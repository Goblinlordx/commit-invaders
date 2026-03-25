import type {
  Grid,
  ShipScript,
  ShipCommand,
  SimConfig,
  SimOutput,
  SimEvent,
  GameState,
  LaserState,
  ShipState,
  InvaderState,
  FormationState,
  CellState,
  EntityTimeline,
  InflectionPoint,
} from '../types.js'

import { createWaveManager } from './wave-manager.js'
import { createFormation, type Formation } from './formation.js'
import { spawnLaser, advanceLasers, checkHits } from './combat.js'

const MAX_FRAMES = 10_000
const ANCHOR_INTERVAL = 100
const LRU_CAPACITY = 16

// ── Engine ──

export function runSimulation(
  grid: Grid,
  script: ShipScript,
  config: SimConfig,
): SimOutput {
  const waveManager = createWaveManager(grid, config.waveConfig)
  const allEvents: SimEvent[] = []
  const entityTimelines = new Map<string, EntityTimeline>()
  const anchorSnapshots = new Map<number, GameState>()

  // Index script by frame for O(1) lookup
  const scriptByFrame = new Map<number, ShipCommand[]>()
  for (const cmd of script) {
    let cmds = scriptByFrame.get(cmd.frame)
    if (!cmds) {
      cmds = []
      scriptByFrame.set(cmd.frame, cmds)
    }
    cmds.push(cmd)
  }

  // Mutable state
  let score = 0
  let totalInvaders = 0
  let laserCounter = 0
  let lasers: LaserState[] = []
  const formations: Formation[] = []
  const ship: ShipState = {
    position: { x: config.playArea.width / 2, y: config.shipY },
    targetX: null,
  }

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
    const gridCells: CellState[] = grid.cells.map((cell) => ({
      cell,
      status: 'in_grid',
      detachProgress: 0,
    }))

    const formationStates: FormationState[] = formations.map((f) =>
      f.getState(),
    )

    return {
      frame,
      score,
      totalInvaders,
      gridCells,
      formations: formationStates,
      ship: { ...ship, position: { ...ship.position } },
      lasers: lasers.map((l) => ({ ...l, position: { ...l.position } })),
      effects: [],
      currentWave: formations.length,
      totalWaves: waveManager.totalWaves,
      events: frameEvents,
    }
  }

  let totalFrames = 0

  // ── Frame loop ──
  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    const frameEvents: SimEvent[] = []

    // 1. Check wave spawn
    const wave = waveManager.trySpawnNext(frame)
    if (wave) {
      const invaders: InvaderState[] = wave.cells.map((wc, i) => {
        const id = `inv-w${wave.waveIndex}-${i}`
        const inv: InvaderState = {
          id,
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
        }
        totalInvaders++

        addInflection(id, 'invader', {
          frame,
          position: { ...inv.position },
          type: 'spawn',
        })

        return inv
      })

      const formation = createFormation(invaders, wave.waveIndex, config.playArea, {
        baseSpeed: config.formationBaseSpeed,
        maxSpeed: config.formationMaxSpeed,
        rowDrop: config.formationRowDrop,
      })
      formations.push(formation)

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
    }

    // 2. Advance active formations
    for (const formation of formations) {
      const fState = formation.getState()
      if (!fState.active) continue

      const prevDirection = fState.direction
      const fEvents = formation.tick(frame)
      const newDirection = fState.direction

      // Record direction change inflection
      if (newDirection !== prevDirection) {
        addInflection(`formation-${fState.waveIndex}`, 'formation', {
          frame,
          position: { ...fState.offset },
          type: 'direction_change',
        })
      }

      frameEvents.push(...fEvents)
    }

    // 3. Apply ShipScript commands
    const commands = scriptByFrame.get(frame)
    if (commands) {
      for (const cmd of commands) {
        if (cmd.action === 'move') {
          ship.targetX = cmd.x
          addInflection('ship', 'ship', {
            frame,
            position: { ...ship.position },
            type: 'move_start',
          })
        } else if (cmd.action === 'fire') {
          const laserId = `laser-${laserCounter++}`
          const laser = spawnLaser(laserId, ship.position, config.laserSpeed)
          lasers.push(laser)

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
        } else if (cmd.action === 'stop') {
          ship.targetX = null
          addInflection('ship', 'ship', {
            frame,
            position: { ...ship.position },
            type: 'move_end',
          })
        }
      }
    }

    // Move ship toward target
    if (ship.targetX !== null) {
      const dx = ship.targetX - ship.position.x
      if (Math.abs(dx) <= config.shipSpeed) {
        ship.position.x = ship.targetX
        ship.targetX = null
      } else {
        ship.position.x += dx > 0 ? config.shipSpeed : -config.shipSpeed
      }
    }

    // 4. Advance lasers
    lasers = advanceLasers(lasers, config.playArea)

    // 5. Hit detection across all active formations
    for (const formation of formations) {
      const fState = formation.getState()
      if (!fState.active) continue

      // Build world-position invader list for hit detection
      const worldInvaders: InvaderState[] = fState.invaders.map((inv) => ({
        ...inv,
        position: {
          x: inv.position.x + fState.offset.x,
          y: inv.position.y + fState.offset.y,
        },
      }))

      const hitResult = checkHits(lasers, worldInvaders)

      for (const hit of hitResult.hits) {
        const invader = worldInvaders.find((inv) => inv.id === hit.invaderId)!
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

        // Apply damage to the original formation invader
        const origInv = fState.invaders.find((i) => i.id === hit.invaderId)!
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
        }
      }

      score += hitResult.scoreIncrease
      lasers = hitResult.updatedLasers
    }

    // 6. Check wave clears
    for (const formation of formations) {
      const fState = formation.getState()
      if (fState.clearedAtFrame === frame) {
        waveManager.markCleared(fState.waveIndex, frame)

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

    // 7. Record frame events
    allEvents.push(...frameEvents)

    // 8. Store anchor snapshot
    if (frame % ANCHOR_INTERVAL === 0) {
      anchorSnapshots.set(frame, buildGameState(frame, frameEvents))
    }

    totalFrames = frame + 1

    // Check if game is over: all waves spawned and all formations cleared
    const allWavesSpawned = formations.length === waveManager.totalWaves
    const allCleared =
      allWavesSpawned &&
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

  // LRU cache for peek()
  const lruCache = new Map<number, GameState>()
  const lruOrder: number[] = []

  function lruGet(frame: number): GameState | undefined {
    const cached = lruCache.get(frame)
    if (cached) {
      // Move to end (most recent)
      const idx = lruOrder.indexOf(frame)
      if (idx !== -1) {
        lruOrder.splice(idx, 1)
        lruOrder.push(frame)
      }
    }
    return cached
  }

  function lruSet(frame: number, state: GameState): void {
    if (lruCache.has(frame)) {
      const idx = lruOrder.indexOf(frame)
      if (idx !== -1) {
        lruOrder.splice(idx, 1)
      }
    }
    lruCache.set(frame, state)
    lruOrder.push(frame)
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

    // Check LRU cache
    const cached = lruGet(targetFrame)
    if (cached) return cached

    // Check anchor snapshots
    const anchor = anchorSnapshots.get(targetFrame)
    if (anchor) {
      lruSet(targetFrame, anchor)
      return anchor
    }

    // Find nearest anchor before target
    let nearestFrame = 0
    for (const [f] of anchorSnapshots) {
      if (f <= targetFrame && f > nearestFrame) {
        nearestFrame = f
      }
    }

    // Rebuild by re-running simulation from start to target frame
    // For simplicity, re-run the full sim to that frame
    // In production this would use anchor + event replay
    const replayOutput = replayToFrame(
      grid,
      script,
      config,
      targetFrame,
    )
    lruSet(targetFrame, replayOutput)
    return replayOutput
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

// ── Replay helper for peek() ──

function replayToFrame(
  grid: Grid,
  script: ShipScript,
  config: SimConfig,
  targetFrame: number,
): GameState {
  const waveManager = createWaveManager(grid, config.waveConfig)

  const scriptByFrame = new Map<number, ShipCommand[]>()
  for (const cmd of script) {
    let cmds = scriptByFrame.get(cmd.frame)
    if (!cmds) {
      cmds = []
      scriptByFrame.set(cmd.frame, cmds)
    }
    cmds.push(cmd)
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
    const frameEvents: SimEvent[] = []

    const wave = waveManager.trySpawnNext(frame)
    if (wave) {
      const invaders: InvaderState[] = wave.cells.map((wc, i) => ({
        id: `inv-w${wave.waveIndex}-${i}`,
        cell: wc.cell,
        hp: wc.hp,
        maxHp: wc.hp,
        position: {
          x: config.gridArea.x + wc.cell.x * (config.cellSize + config.cellGap),
          y: config.gridArea.y + wc.cell.y * (config.cellSize + config.cellGap),
        },
        destroyed: false,
        destroyedAtFrame: null,
      }))
      totalInvaders += invaders.length

      formations.push(
        createFormation(invaders, wave.waveIndex, config.playArea, {
          baseSpeed: config.formationBaseSpeed,
          maxSpeed: config.formationMaxSpeed,
          rowDrop: config.formationRowDrop,
        }),
      )
    }

    for (const formation of formations) {
      if (formation.getState().active) {
        formation.tick(frame)
      }
    }

    const commands = scriptByFrame.get(frame)
    if (commands) {
      for (const cmd of commands) {
        if (cmd.action === 'move') {
          ship.targetX = cmd.x
        } else if (cmd.action === 'fire') {
          lasers.push(
            spawnLaser(`laser-${laserCounter++}`, ship.position, config.laserSpeed),
          )
        } else if (cmd.action === 'stop') {
          ship.targetX = null
        }
      }
    }

    if (ship.targetX !== null) {
      const dx = ship.targetX - ship.position.x
      if (Math.abs(dx) <= config.shipSpeed) {
        ship.position.x = ship.targetX
        ship.targetX = null
      } else {
        ship.position.x += dx > 0 ? config.shipSpeed : -config.shipSpeed
      }
    }

    lasers = advanceLasers(lasers, config.playArea)

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
        const updatedInv = hitResult.updatedInvaders.find(
          (inv) => inv.id === hit.invaderId,
        )!
        const origInv = fState.invaders.find((i) => i.id === hit.invaderId)!
        origInv.hp = updatedInv.hp
        if (updatedInv.destroyed) {
          formation.destroyInvader(hit.invaderId, frame)
        }
      }

      score += hitResult.scoreIncrease
      lasers = hitResult.updatedLasers
    }

    for (const formation of formations) {
      const fState = formation.getState()
      if (fState.clearedAtFrame === frame) {
        waveManager.markCleared(fState.waveIndex, frame)
      }
    }

    if (frame === targetFrame) {
      const gridCells: CellState[] = grid.cells.map((cell) => ({
        cell,
        status: 'in_grid' as const,
        detachProgress: 0,
      }))

      return {
        frame,
        score,
        totalInvaders,
        gridCells,
        formations: formations.map((f) => f.getState()),
        ship: { ...ship, position: { ...ship.position } },
        lasers: lasers.map((l) => ({ ...l, position: { ...l.position } })),
        effects: [],
        currentWave: formations.length,
        totalWaves: waveManager.totalWaves,
        events: frameEvents,
      }
    }
  }

  // Should not reach here
  throw new Error(`Failed to reach frame ${targetFrame}`)
}
