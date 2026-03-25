import type {
  Grid,
  SimConfig,
  SimOutput,
  SimEvent,
  GameState,
  LaserState,
  ShipState,
  InvaderState,
  EntityTimeline,
  InflectionPoint,
} from '../types.js'

import { createPRNG } from './prng.js'
import { createWaveManager } from './wave-manager.js'
import { createFormation, type Formation } from './formation.js'
import { spawnLaser, advanceLasers, checkHits } from './combat.js'

const MAX_FRAMES = 10_000
const ANCHOR_INTERVAL = 100
const LRU_CAPACITY = 16

/**
 * Simulates the complete game from a Grid and PRNG seed.
 *
 * The solver runs inline: each frame it reads invader world positions,
 * moves the ship toward the current target, and fires when aligned.
 * PRNG controls targeting order, reaction delays, and organic drift.
 *
 * Deterministic: same (Grid, seed, config) → identical SimOutput.
 */
export function simulate(
  grid: Grid,
  seed: string,
  config: SimConfig,
): SimOutput {
  const prng = createPRNG(seed)
  const formationConfig = {
    baseSpeed: config.formationBaseSpeed,
    maxSpeed: config.formationMaxSpeed,
    rowDrop: config.formationRowDrop,
  }

  const allEvents: SimEvent[] = []
  const entityTimelines = new Map<string, EntityTimeline>()
  const anchorSnapshots = new Map<number, GameState>()
  // Record solver decisions for replay
  const frameDecisions: Map<
    number,
    Array<{ type: 'move'; x: number } | { type: 'fire' }>
  > = new Map()

  const simWM = createWaveManager(grid, config.waveConfig)
  const formations: Formation[] = []

  let score = 0
  let totalInvaders = 0
  let laserCounter = 0
  let lasers: LaserState[] = []
  const ship: ShipState = {
    position: { x: config.playArea.width / 2, y: config.shipY },
    targetX: null,
  }

  // Solver state
  const targetQueues: Map<number, string[]> = new Map()
  let targetInvaderId: string | null = null
  let shotsRemaining = 0
  let cooldown = 0

  function addInflection(
    entityId: string,
    entityType: EntityTimeline['entityType'],
    point: InflectionPoint,
  ): void {
    let timeline = entityTimelines.get(entityId)
    if (!timeline) {
      timeline = { entityId, entityType, inflections: [] }
      entityTimelines.set(entityId, timeline)
    }
    timeline.inflections.push(point)
  }

  function buildGameState(frame: number, frameEvents: SimEvent[]): GameState {
    return {
      frame,
      score,
      totalInvaders,
      gridCells: grid.cells.map((cell) => ({
        cell,
        status: 'in_grid' as const,
        detachProgress: 0,
      })),
      formations: formations.map((f) => f.getState()),
      ship: { ...ship, position: { ...ship.position } },
      lasers: lasers.map((l) => ({ ...l, position: { ...l.position } })),
      effects: [],
      currentWave: formations.length,
      totalWaves: simWM.totalWaves,
      events: frameEvents,
    }
  }

  function getInvaderWorldPos(
    invaderId: string,
  ): { x: number; y: number } | null {
    for (const f of formations) {
      const fState = f.getState()
      if (!fState.active) continue
      const inv = fState.invaders.find(
        (i) => i.id === invaderId && !i.destroyed,
      )
      if (inv) {
        return {
          x: inv.position.x + fState.offset.x,
          y: inv.position.y + fState.offset.y,
        }
      }
    }
    return null
  }

  function pickNextTarget(): boolean {
    for (const [waveIdx, queue] of targetQueues) {
      const formation = formations.find(
        (f) => f.getState().waveIndex === waveIdx,
      )
      if (!formation || !formation.getState().active) {
        targetQueues.delete(waveIdx)
        continue
      }

      const fState = formation.getState()
      while (queue.length > 0) {
        const inv = fState.invaders.find((i) => i.id === queue[0])
        if (inv && !inv.destroyed) break
        queue.shift()
      }

      if (queue.length === 0) {
        targetQueues.delete(waveIdx)
        continue
      }

      const invId = queue.shift()!
      const inv = fState.invaders.find((i) => i.id === invId)!
      targetInvaderId = invId
      shotsRemaining = inv.hp
      cooldown = prng.range(2, 6)
      return true
    }

    targetInvaderId = null
    return false
  }

  let totalFrames = 0

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    const frameEvents: SimEvent[] = []
    const decisions: Array<{ type: 'move'; x: number } | { type: 'fire' }> =
      []

    // 1. Wave spawning
    const wave = simWM.trySpawnNext(frame)
    if (wave) {
      const invaders: InvaderState[] = wave.cells.map((wc, i) => ({
        id: `inv-w${wave.waveIndex}-${i}`,
        cell: wc.cell,
        hp: wc.hp,
        maxHp: wc.hp,
        position: {
          x:
            config.gridArea.x +
            wc.cell.x * (config.cellSize + config.cellGap),
          y:
            config.gridArea.y +
            wc.cell.y * (config.cellSize + config.cellGap),
        },
        destroyed: false,
        destroyedAtFrame: null,
      }))
      totalInvaders += invaders.length

      formations.push(
        createFormation(
          invaders,
          wave.waveIndex,
          config.playArea,
          formationConfig,
        ),
      )

      const formationId = `formation-${wave.waveIndex}`
      frameEvents.push({
        frame,
        type: 'wave_spawn',
        entityId: formationId,
        position: { x: 0, y: 0 },
        data: { waveIndex: wave.waveIndex, invaderCount: invaders.length },
      })
      addInflection(formationId, 'formation', {
        frame,
        position: { x: 0, y: 0 },
        type: 'spawn',
      })
      for (const inv of invaders) {
        addInflection(inv.id, 'invader', {
          frame,
          position: { ...inv.position },
          type: 'spawn',
        })
      }

      // PRNG-shuffled target queue
      const ids = invaders.map((inv) => inv.id)
      for (let i = ids.length - 1; i > 0; i--) {
        const j = prng.range(0, i)
        ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
      }
      targetQueues.set(wave.waveIndex, ids)
      cooldown = Math.max(cooldown, prng.range(3, 8))
    }

    // 2. Advance formations
    for (const formation of formations) {
      const fState = formation.getState()
      if (!fState.active) continue

      const prevDir = fState.direction
      const fEvents = formation.tick(frame)
      if (fState.direction !== prevDir) {
        addInflection(`formation-${fState.waveIndex}`, 'formation', {
          frame,
          position: { ...fState.offset },
          type: 'direction_change',
        })
      }
      frameEvents.push(...fEvents)
    }

    // 3. Solver: drive ship and fire with lead compensation
    if (cooldown > 0) {
      cooldown--
    } else {
      if (!targetInvaderId || !getInvaderWorldPos(targetInvaderId)) {
        pickNextTarget()
      }

      if (targetInvaderId && cooldown <= 0) {
        const targetPos = getInvaderWorldPos(targetInvaderId)
        if (targetPos) {
          // Compute lead: where will the invader be when the laser arrives?
          const dist = config.shipY - targetPos.y
          const travelFrames =
            dist > 0 ? Math.ceil(dist / config.laserSpeed) : 1

          // Find the formation this invader belongs to
          let leadX = targetPos.x
          for (const f of formations) {
            const fState = f.getState()
            if (!fState.active) continue
            const inv = fState.invaders.find(
              (i) => i.id === targetInvaderId && !i.destroyed,
            )
            if (!inv) continue

            // Simulate formation movement forward to predict offset
            let offX = fState.offset.x
            let offY = fState.offset.y
            let dir = fState.direction
            const spd = fState.speed
            const alive = fState.invaders.filter((i) => !i.destroyed)

            for (let t = 0; t < travelFrames; t++) {
              const dx = dir === 'right' ? spd : -spd
              let wouldExceed = false
              for (const a of alive) {
                const ex = a.position.x + offX + dx
                if (
                  ex < config.playArea.x ||
                  ex >= config.playArea.x + config.playArea.width
                ) {
                  wouldExceed = true
                  break
                }
              }
              if (wouldExceed) {
                dir = dir === 'right' ? 'left' : 'right'
                offY += config.formationRowDrop
              } else {
                offX += dx
              }
            }

            leadX = inv.position.x + offX
            break
          }

          const dx = leadX - ship.position.x
          if (Math.abs(dx) <= config.shipSpeed + 1) {
            // Aligned with lead position — snap and fire
            ship.position.x = leadX
            decisions.push({ type: 'move', x: leadX })

            addInflection('ship', 'ship', {
              frame,
              position: { ...ship.position },
              type: 'move_end',
            })

            const laserId = `laser-${laserCounter++}`
            const laser = spawnLaser(
              laserId,
              ship.position,
              config.laserSpeed,
            )
            lasers.push(laser)
            decisions.push({ type: 'fire' })

            frameEvents.push({
              frame,
              type: 'fire_laser',
              entityId: laserId,
              position: { ...ship.position },
            })
            addInflection(laserId, 'laser', {
              frame,
              position: { ...ship.position },
              type: 'fire',
            })

            shotsRemaining--
            if (shotsRemaining <= 0) {
              targetInvaderId = null
            }
            cooldown = prng.range(1, 3)
          } else {
            // Move toward lead position
            ship.position.x +=
              dx > 0 ? config.shipSpeed : -config.shipSpeed
            decisions.push({ type: 'move', x: ship.position.x })

            addInflection('ship', 'ship', {
              frame,
              position: { ...ship.position },
              type: 'move_start',
            })
          }
        } else {
          targetInvaderId = null
        }
      }
    }

    if (decisions.length > 0) {
      frameDecisions.set(frame, decisions)
    }

    // 4. Advance lasers
    lasers = advanceLasers(lasers, config.playArea)

    // 5. Hit detection
    for (const formation of formations) {
      const fState = formation.getState()
      if (!fState.active) continue

      const worldInvaders: InvaderState[] = fState.invaders.map((inv) => ({
        ...inv,
        position: {
          x: inv.position.x + fState.offset.x,
          y: inv.position.y + fState.offset.y,
        },
      }))

      const hitResult = checkHits(lasers, worldInvaders)

      for (const hit of hitResult.hits) {
        const invader = worldInvaders.find(
          (inv) => inv.id === hit.invaderId,
        )!
        const updatedInv = hitResult.updatedInvaders.find(
          (inv) => inv.id === hit.invaderId,
        )!

        frameEvents.push({
          frame,
          type: 'hit',
          entityId: hit.invaderId,
          position: { ...invader.position },
          data: { laserId: hit.laserId, hp: updatedInv.hp },
        })
        addInflection(hit.invaderId, 'invader', {
          frame,
          position: { ...invader.position },
          type: 'hit',
        })

        const origInv = fState.invaders.find(
          (i) => i.id === hit.invaderId,
        )!
        origInv.hp = updatedInv.hp

        if (updatedInv.destroyed) {
          formation.destroyInvader(hit.invaderId, frame)

          frameEvents.push({
            frame,
            type: 'destroy',
            entityId: hit.invaderId,
            position: { ...invader.position },
          })
          addInflection(hit.invaderId, 'invader', {
            frame,
            position: { ...invader.position },
            type: 'destroy',
          })

          if (targetInvaderId === hit.invaderId) {
            targetInvaderId = null
          }
        }
      }

      score += hitResult.scoreIncrease
      lasers = hitResult.updatedLasers
    }

    // 6. Wave clears
    for (const formation of formations) {
      const fState = formation.getState()
      if (fState.clearedAtFrame === frame) {
        simWM.markCleared(fState.waveIndex, frame)
        frameEvents.push({
          frame,
          type: 'wave_clear',
          entityId: `formation-${fState.waveIndex}`,
          position: { x: 0, y: 0 },
          data: { waveIndex: fState.waveIndex },
        })
        addInflection(`formation-${fState.waveIndex}`, 'formation', {
          frame,
          position: { ...fState.offset },
          type: 'wave_clear',
        })
      }
    }

    allEvents.push(...frameEvents)

    if (frame % ANCHOR_INTERVAL === 0) {
      anchorSnapshots.set(frame, buildGameState(frame, frameEvents))
    }

    totalFrames = frame + 1

    // Re-queue alive invaders if target queues are empty but invaders remain
    if (!targetInvaderId && targetQueues.size === 0) {
      for (const f of formations) {
        const fState = f.getState()
        if (!fState.active) continue
        const alive = fState.invaders.filter((i) => !i.destroyed)
        if (alive.length > 0) {
          const ids = alive.map((i) => i.id)
          for (let i = ids.length - 1; i > 0; i--) {
            const j = prng.range(0, i)
            ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
          }
          targetQueues.set(fState.waveIndex, ids)
        }
      }
    }

    const allSpawned = formations.length === simWM.totalWaves
    const allCleared =
      allSpawned &&
      formations.length > 0 &&
      formations.every((f) => !f.getState().active)
    if (allCleared) {
      allEvents.push({
        frame,
        type: 'game_end',
        entityId: 'game',
        position: { x: 0, y: 0 },
        data: { score, totalFrames },
      })
      break
    }
  }

  // ── Build SimOutput ──

  const lruCache = new Map<number, GameState>()
  const lruOrder: number[] = []

  function lruGet(f: number): GameState | undefined {
    const cached = lruCache.get(f)
    if (cached) {
      const idx = lruOrder.indexOf(f)
      if (idx !== -1) {
        lruOrder.splice(idx, 1)
        lruOrder.push(f)
      }
    }
    return cached
  }

  function lruSet(f: number, state: GameState): void {
    if (lruCache.has(f)) {
      const idx = lruOrder.indexOf(f)
      if (idx !== -1) lruOrder.splice(idx, 1)
    }
    lruCache.set(f, state)
    lruOrder.push(f)
    while (lruOrder.length > LRU_CAPACITY) {
      const evicted = lruOrder.shift()!
      lruCache.delete(evicted)
    }
  }

  function peek(targetFrame: number): GameState {
    if (targetFrame < 0 || targetFrame >= totalFrames) {
      throw new Error(
        `Frame ${targetFrame} out of range [0, ${totalFrames})`,
      )
    }

    const cached = lruGet(targetFrame)
    if (cached) return cached

    const anchor = anchorSnapshots.get(targetFrame)
    if (anchor) {
      lruSet(targetFrame, anchor)
      return anchor
    }

    const state = replayToFrame(grid, config, frameDecisions, targetFrame)
    lruSet(targetFrame, state)
    return state
  }

  return {
    events: allEvents,
    entityTimelines,
    totalFrames,
    config,
    finalScore: score,
    peek,
    getInflections(entityId: string): InflectionPoint[] {
      return entityTimelines.get(entityId)?.inflections ?? []
    },
    getAllInflections(): Map<string, EntityTimeline> {
      return entityTimelines
    },
  }
}

// ── Replay for peek() ──

type Decision = { type: 'move'; x: number } | { type: 'fire' }

function replayToFrame(
  grid: Grid,
  config: SimConfig,
  frameDecisions: Map<number, Decision[]>,
  targetFrame: number,
): GameState {
  const simWM = createWaveManager(grid, config.waveConfig)
  const fc = {
    baseSpeed: config.formationBaseSpeed,
    maxSpeed: config.formationMaxSpeed,
    rowDrop: config.formationRowDrop,
  }

  let score = 0
  let totalInvaders = 0
  let laserCounter = 0
  let lasers: LaserState[] = []
  const formations: Formation[] = []
  const ship: ShipState = {
    position: { x: config.playArea.width / 2, y: config.shipY },
    targetX: null,
  }

  for (let frame = 0; frame <= targetFrame; frame++) {
    const wave = simWM.trySpawnNext(frame)
    if (wave) {
      const invaders: InvaderState[] = wave.cells.map((wc, i) => ({
        id: `inv-w${wave.waveIndex}-${i}`,
        cell: wc.cell,
        hp: wc.hp,
        maxHp: wc.hp,
        position: {
          x:
            config.gridArea.x +
            wc.cell.x * (config.cellSize + config.cellGap),
          y:
            config.gridArea.y +
            wc.cell.y * (config.cellSize + config.cellGap),
        },
        destroyed: false,
        destroyedAtFrame: null,
      }))
      totalInvaders += invaders.length
      formations.push(
        createFormation(invaders, wave.waveIndex, config.playArea, fc),
      )
    }

    for (const f of formations) {
      if (f.getState().active) f.tick(frame)
    }

    // Replay decisions
    const decisions = frameDecisions.get(frame)
    if (decisions) {
      for (const d of decisions) {
        if (d.type === 'move') {
          ship.position.x = d.x
        } else {
          lasers.push(
            spawnLaser(
              `laser-${laserCounter++}`,
              ship.position,
              config.laserSpeed,
            ),
          )
        }
      }
    }

    lasers = advanceLasers(lasers, config.playArea)

    for (const f of formations) {
      const fState = f.getState()
      if (!fState.active) continue

      const worldInvaders: InvaderState[] = fState.invaders.map((inv) => ({
        ...inv,
        position: {
          x: inv.position.x + fState.offset.x,
          y: inv.position.y + fState.offset.y,
        },
      }))

      const hitResult = checkHits(lasers, worldInvaders)
      for (const hit of hitResult.hits) {
        const updated = hitResult.updatedInvaders.find(
          (inv) => inv.id === hit.invaderId,
        )!
        const orig = fState.invaders.find((i) => i.id === hit.invaderId)!
        orig.hp = updated.hp
        if (updated.destroyed) f.destroyInvader(hit.invaderId, frame)
      }
      score += hitResult.scoreIncrease
      lasers = hitResult.updatedLasers
    }

    for (const f of formations) {
      const fState = f.getState()
      if (fState.clearedAtFrame === frame) {
        simWM.markCleared(fState.waveIndex, frame)
      }
    }
  }

  return {
    frame: targetFrame,
    score,
    totalInvaders,
    gridCells: grid.cells.map((cell) => ({
      cell,
      status: 'in_grid' as const,
      detachProgress: 0,
    })),
    formations: formations.map((f) => f.getState()),
    ship: { ...ship, position: { ...ship.position } },
    lasers: lasers.map((l) => ({ ...l, position: { ...l.position } })),
    effects: [],
    currentWave: formations.length,
    totalWaves: simWM.totalWaves,
    events: [],
  }
}
