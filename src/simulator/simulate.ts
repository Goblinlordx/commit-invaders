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
import type { PRNG } from '../types.js'
import { createWaveManager } from './wave-manager.js'
import { createFormation, type Formation } from './formation.js'
import { spawnLaser, advanceLasers, checkHits } from './combat.js'

const MAX_FRAMES = 30_000
const ANCHOR_INTERVAL = 100
const LRU_CAPACITY = 16
const HIT_CHANCE = 0.85
const INVADER_SIZE = 11

type Decision = { type: 'move'; x: number } | { type: 'fire' }

// ── Prediction ──

/**
 * Predict invader world-X at exactly N ticks in the future from the
 * formation's current state. Replicates formation.tick() boundary logic
 * exactly — verified to match.
 */
function predictWorldX(
  invBaseX: number,
  formation: Formation,
  ticksAhead: number,
  playArea: { x: number; width: number },
): number {
  const s = formation.getState()
  const alive = s.invaders.filter((i) => !i.destroyed)
  let offX = s.offset.x
  let dir = s.direction
  const spd = s.speed

  for (let t = 0; t < ticksAhead; t++) {
    const dx = dir === 'right' ? spd : -spd
    let wouldExceed = false
    for (const a of alive) {
      if (a.position.x + offX + dx < playArea.x ||
          a.position.x + offX + dx >= playArea.x + playArea.width) {
        wouldExceed = true
        break
      }
    }
    if (wouldExceed) {
      dir = dir === 'right' ? 'left' : 'right'
    } else {
      offX += dx
    }
  }

  return invBaseX + offX
}

// ── Firing solution ──

interface FiringSolution {
  fireFrame: number   // when the ship must fire
  fireX: number       // where the ship must be when it fires
  targetId: string | null // null = miss
}

/**
 * Solve for a hit on a specific target.
 *
 * Given current frame and ship position, find the earliest impact frame
 * where: (1) the laser can reach the invader, and (2) the ship can
 * reach the required fire position in time.
 */
function solveHit(
  target: { id: string; invBaseX: number; invBaseY: number; formation: Formation },
  currentFrame: number,
  shipX: number,
  config: SimConfig,
): FiringSolution | null {
  const fState = target.formation.getState()
  const invWorldY = target.invBaseY + fState.offset.y

  const dist = config.shipY - invWorldY
  if (dist <= 0) return null
  const travelFrames = Math.ceil(dist / config.laserSpeed)

  // Search for the earliest feasible impact frame
  // Impact frame must be >= currentFrame + travelFrames (laser needs time to travel)
  // Fire frame = impact frame - travelFrames
  // Ship must reach fireX by fireFrame: |fireX - shipX| <= (fireFrame - currentFrame) * shipSpeed

  for (let extraDelay = 0; extraDelay < 500; extraDelay++) {
    const impactFrame = currentFrame + travelFrames + extraDelay
    if (impactFrame >= MAX_FRAMES) return null

    const ticksAhead = travelFrames + extraDelay
    const fireX = predictWorldX(
      target.invBaseX,
      target.formation,
      ticksAhead,
      config.playArea,
    )

    // Check fire position is in bounds
    if (fireX < config.playArea.x || fireX >= config.playArea.x + config.playArea.width) {
      continue
    }

    const fireFrame = impactFrame - travelFrames
    const availableFrames = fireFrame - currentFrame
    const moveDist = Math.abs(fireX - shipX)

    if (moveDist <= availableFrames * config.shipSpeed) {
      return { fireFrame, fireX, targetId: target.id }
    }
  }

  return null
}

/**
 * Solve for a miss: find a fire position where the laser trajectory
 * won't hit any alive invader.
 */
function solveMiss(
  formations: Formation[],
  currentFrame: number,
  shipX: number,
  config: SimConfig,
  prng: PRNG,
): FiringSolution | null {
  // Collect predicted invader X positions across the laser's flight path
  const occupiedXs: number[] = []
  for (const f of formations) {
    const fState = f.getState()
    if (!fState.active) continue
    const dist = config.shipY - (fState.invaders[0]?.position.y ?? 0) - fState.offset.y
    if (dist <= 0) continue
    const travelFrames = Math.ceil(dist / config.laserSpeed)

    for (const inv of fState.invaders) {
      if (inv.destroyed) continue
      const futureX = predictWorldX(inv.position.x, f, travelFrames, config.playArea)
      occupiedXs.push(futureX)
    }
  }

  // Find a gap
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = prng.float(
      config.playArea.x + 10,
      config.playArea.x + config.playArea.width - 10,
    )
    if (occupiedXs.every((ox) => Math.abs(ox - candidate) > INVADER_SIZE + 2)) {
      const moveDist = Math.abs(candidate - shipX)
      const moveFrames = Math.ceil(moveDist / config.shipSpeed)
      return {
        fireFrame: currentFrame + moveFrames,
        fireX: candidate,
        targetId: null,
      }
    }
  }

  return null // no safe miss trajectory
}

// ── Main ──

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
  const frameDecisions = new Map<number, Decision[]>()

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

  // Solver: committed firing solution
  let solution: FiringSolution | null = null
  let solveCooldown = 0

  function addInflection(
    entityId: string,
    entityType: EntityTimeline['entityType'],
    point: InflectionPoint,
  ): void {
    let tl = entityTimelines.get(entityId)
    if (!tl) {
      tl = { entityId, entityType, inflections: [] }
      entityTimelines.set(entityId, tl)
    }
    tl.inflections.push(point)
  }

  function buildGameState(frame: number, frameEvents: SimEvent[]): GameState {
    return {
      frame, score, totalInvaders,
      gridCells: grid.cells.map((c) => ({ cell: c, status: 'in_grid' as const, detachProgress: 0 })),
      formations: formations.map((f) => f.getState()),
      ship: { ...ship, position: { ...ship.position } },
      lasers: lasers.map((l) => ({ ...l, position: { ...l.position } })),
      effects: [],
      currentWave: formations.length,
      totalWaves: simWM.totalWaves,
      events: frameEvents,
    }
  }

  function record(frame: number, ...decs: Decision[]): void {
    let list = frameDecisions.get(frame)
    if (!list) { list = []; frameDecisions.set(frame, list) }
    list.push(...decs)
  }

  function findSolution(frame: number): void {
    // Gather alive targets
    const targets: Array<{ id: string; invBaseX: number; invBaseY: number; formation: Formation; hp: number }> = []
    for (const f of formations) {
      const s = f.getState()
      if (!s.active) continue
      for (const inv of s.invaders) {
        if (!inv.destroyed) {
          targets.push({
            id: inv.id,
            invBaseX: inv.position.x,
            invBaseY: inv.position.y,
            formation: f,
            hp: inv.hp,
          })
        }
      }
    }
    if (targets.length === 0) return

    const isHit = prng.chance(HIT_CHANCE)

    if (isHit) {
      // Shuffle targets with PRNG
      for (let i = targets.length - 1; i > 0; i--) {
        const j = prng.range(0, i)
        ;[targets[i], targets[j]] = [targets[j]!, targets[i]!]
      }

      for (const t of targets) {
        const sol = solveHit(t, frame, ship.position.x, config)
        if (sol) {
          solution = sol
          return
        }
      }
      // No hit solution — add delay and retry next frame
      solveCooldown = prng.range(3, 10)
    } else {
      const sol = solveMiss(formations, frame, ship.position.x, config, prng)
      if (sol) {
        solution = sol
      } else {
        solveCooldown = prng.range(2, 5)
      }
    }
  }

  // ── Frame loop ──

  let totalFrames = 0

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    const frameEvents: SimEvent[] = []

    // 1. Wave spawning
    const wave = simWM.trySpawnNext(frame)
    if (wave) {
      const invaders: InvaderState[] = wave.cells.map((wc, i) => ({
        id: `inv-w${wave.waveIndex}-${i}`,
        cell: wc.cell, hp: wc.hp, maxHp: wc.hp,
        position: {
          x: config.gridArea.x + wc.cell.x * (config.cellSize + config.cellGap),
          y: config.gridArea.y + wc.cell.y * (config.cellSize + config.cellGap),
        },
        destroyed: false, destroyedAtFrame: null,
      }))
      totalInvaders += invaders.length
      formations.push(createFormation(invaders, wave.waveIndex, config.playArea, formationConfig))

      const fid = `formation-${wave.waveIndex}`
      frameEvents.push({ frame, type: 'wave_spawn', entityId: fid, position: { x: 0, y: 0 }, data: { waveIndex: wave.waveIndex, invaderCount: invaders.length } })
      addInflection(fid, 'formation', { frame, position: { x: 0, y: 0 }, type: 'spawn' })
      for (const inv of invaders) {
        addInflection(inv.id, 'invader', { frame, position: { ...inv.position }, type: 'spawn' })
      }
    }

    // 2. Advance formations
    for (const formation of formations) {
      const fState = formation.getState()
      if (!fState.active) continue
      const prevDir = fState.direction
      const fEvents = formation.tick(frame)
      if (fState.direction !== prevDir) {
        addInflection(`formation-${fState.waveIndex}`, 'formation', { frame, position: { ...fState.offset }, type: 'direction_change' })
      }
      frameEvents.push(...fEvents)
    }

    // 3. Solver: find solution or execute committed one
    if (solveCooldown > 0) {
      solveCooldown--
    } else if (!solution) {
      findSolution(frame)
    }

    // Execute committed solution
    const sol = solution as FiringSolution | null
    if (sol && frame <= sol.fireFrame) {
      if (frame === sol.fireFrame) {
        // Fire frame — snap to position and fire
        ship.position.x = sol.fireX
        record(frame, { type: 'move', x: sol.fireX }, { type: 'fire' })
        addInflection('ship', 'ship', { frame, position: { ...ship.position }, type: 'move_end' })

        const laserId = `laser-${laserCounter++}`
        lasers.push(spawnLaser(laserId, ship.position, config.laserSpeed))
        frameEvents.push({ frame, type: 'fire_laser', entityId: laserId, position: { ...ship.position } })
        addInflection(laserId, 'laser', { frame, position: { ...ship.position }, type: 'fire' })

        solution = null
        solveCooldown = prng.range(1, 2)
      } else {
        // Move toward fire position
        const dx = sol.fireX - ship.position.x
        if (Math.abs(dx) > 0.5) {
          const step = Math.min(Math.abs(dx), config.shipSpeed) * Math.sign(dx)
          ship.position.x += step
          record(frame, { type: 'move', x: ship.position.x })
          addInflection('ship', 'ship', { frame, position: { ...ship.position }, type: 'move_start' })
        }
      }
    }

    // 4. Advance lasers
    lasers = advanceLasers(lasers, config.playArea)

    // 5. Hit detection
    for (const formation of formations) {
      const fState = formation.getState()
      if (!fState.active) continue

      const worldInvaders: InvaderState[] = fState.invaders.map((inv) => ({
        ...inv,
        position: { x: inv.position.x + fState.offset.x, y: inv.position.y + fState.offset.y },
      }))

      const hitResult = checkHits(lasers, worldInvaders)
      for (const hit of hitResult.hits) {
        const invader = worldInvaders.find((i) => i.id === hit.invaderId)!
        const updated = hitResult.updatedInvaders.find((i) => i.id === hit.invaderId)!

        frameEvents.push({ frame, type: 'hit', entityId: hit.invaderId, position: { ...invader.position }, data: { laserId: hit.laserId, hp: updated.hp } })
        addInflection(hit.invaderId, 'invader', { frame, position: { ...invader.position }, type: 'hit' })

        const orig = fState.invaders.find((i) => i.id === hit.invaderId)!
        orig.hp = updated.hp

        if (updated.destroyed) {
          formation.destroyInvader(hit.invaderId, frame)
          frameEvents.push({ frame, type: 'destroy', entityId: hit.invaderId, position: { ...invader.position } })
          addInflection(hit.invaderId, 'invader', { frame, position: { ...invader.position }, type: 'destroy' })

          // Invalidate solution if target was destroyed by another laser
          if ((solution as FiringSolution | null)?.targetId === hit.invaderId) { solution = null }
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
        frameEvents.push({ frame, type: 'wave_clear', entityId: `formation-${fState.waveIndex}`, position: { x: 0, y: 0 }, data: { waveIndex: fState.waveIndex } })
        addInflection(`formation-${fState.waveIndex}`, 'formation', { frame, position: { ...fState.offset }, type: 'wave_clear' })
      }
    }

    allEvents.push(...frameEvents)
    if (frame % ANCHOR_INTERVAL === 0) anchorSnapshots.set(frame, buildGameState(frame, frameEvents))
    totalFrames = frame + 1

    const allSpawned = formations.length === simWM.totalWaves
    const allCleared = allSpawned && formations.length > 0 && formations.every((f) => !f.getState().active)
    if (allCleared) {
      allEvents.push({ frame, type: 'game_end', entityId: 'game', position: { x: 0, y: 0 }, data: { score, totalFrames } })
      break
    }
  }

  // ── SimOutput ──

  const lruCache = new Map<number, GameState>()
  const lruOrder: number[] = []

  function lruGet(f: number): GameState | undefined {
    const c = lruCache.get(f)
    if (c) { const i = lruOrder.indexOf(f); if (i !== -1) { lruOrder.splice(i, 1); lruOrder.push(f) } }
    return c
  }
  function lruSet(f: number, s: GameState): void {
    if (lruCache.has(f)) { const i = lruOrder.indexOf(f); if (i !== -1) lruOrder.splice(i, 1) }
    lruCache.set(f, s); lruOrder.push(f)
    while (lruOrder.length > LRU_CAPACITY) { lruCache.delete(lruOrder.shift()!) }
  }

  function peek(targetFrame: number): GameState {
    if (targetFrame < 0 || targetFrame >= totalFrames) throw new Error(`Frame ${targetFrame} out of range [0, ${totalFrames})`)
    const c = lruGet(targetFrame); if (c) return c
    const a = anchorSnapshots.get(targetFrame); if (a) { lruSet(targetFrame, a); return a }
    const s = replayToFrame(grid, config, frameDecisions, targetFrame); lruSet(targetFrame, s); return s
  }

  return {
    events: allEvents, entityTimelines, totalFrames, config, finalScore: score, peek,
    getInflections(id: string) { return entityTimelines.get(id)?.inflections ?? [] },
    getAllInflections() { return entityTimelines },
  }
}

// ── Replay for peek() ──

function replayToFrame(grid: Grid, config: SimConfig, frameDecisions: Map<number, Decision[]>, targetFrame: number): GameState {
  const wm = createWaveManager(grid, config.waveConfig)
  const fc = { baseSpeed: config.formationBaseSpeed, maxSpeed: config.formationMaxSpeed, rowDrop: config.formationRowDrop }
  let score = 0, totalInvaders = 0, laserCounter = 0, lasers: LaserState[] = []
  const formations: Formation[] = []
  const ship: ShipState = { position: { x: config.playArea.width / 2, y: config.shipY }, targetX: null }

  for (let frame = 0; frame <= targetFrame; frame++) {
    const wave = wm.trySpawnNext(frame)
    if (wave) {
      const invaders: InvaderState[] = wave.cells.map((wc, i) => ({
        id: `inv-w${wave.waveIndex}-${i}`, cell: wc.cell, hp: wc.hp, maxHp: wc.hp,
        position: { x: config.gridArea.x + wc.cell.x * (config.cellSize + config.cellGap), y: config.gridArea.y + wc.cell.y * (config.cellSize + config.cellGap) },
        destroyed: false, destroyedAtFrame: null,
      }))
      totalInvaders += invaders.length
      formations.push(createFormation(invaders, wave.waveIndex, config.playArea, fc))
    }
    for (const f of formations) { if (f.getState().active) f.tick(frame) }

    const decs = frameDecisions.get(frame)
    if (decs) for (const d of decs) {
      if (d.type === 'move') ship.position.x = d.x
      else lasers.push(spawnLaser(`laser-${laserCounter++}`, ship.position, config.laserSpeed))
    }

    lasers = advanceLasers(lasers, config.playArea)
    for (const f of formations) {
      const s = f.getState(); if (!s.active) continue
      const wi = s.invaders.map(inv => ({ ...inv, position: { x: inv.position.x + s.offset.x, y: inv.position.y + s.offset.y } }))
      const hr = checkHits(lasers, wi)
      for (const h of hr.hits) { const u = hr.updatedInvaders.find(i => i.id === h.invaderId)!; const o = s.invaders.find(i => i.id === h.invaderId)!; o.hp = u.hp; if (u.destroyed) f.destroyInvader(h.invaderId, frame) }
      score += hr.scoreIncrease; lasers = hr.updatedLasers
    }
    for (const f of formations) { const s = f.getState(); if (s.clearedAtFrame === frame) wm.markCleared(s.waveIndex, frame) }
  }

  return {
    frame: targetFrame, score, totalInvaders,
    gridCells: grid.cells.map(c => ({ cell: c, status: 'in_grid' as const, detachProgress: 0 })),
    formations: formations.map(f => f.getState()),
    ship: { ...ship, position: { ...ship.position } },
    lasers: lasers.map(l => ({ ...l, position: { ...l.position } })),
    effects: [], currentWave: formations.length, totalWaves: wm.totalWaves, events: [],
  }
}
