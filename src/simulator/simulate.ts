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
  Position,
} from '../types.js'

import { createPRNG } from './prng.js'
import type { PRNG } from '../types.js'
import { createWaveManager } from './wave-manager.js'
import { createFormation, type Formation } from './formation.js'
import { spawnLaser, advanceLasers, checkHits } from './combat.js'

// Internal constants (don't affect visual output)
const MAX_FRAMES = 100_000 // absolute safety net — should never be reached
const ANCHOR_INTERVAL = 100
const LRU_CAPACITY = 16

type Decision = { type: 'move'; x: number } | { type: 'fire' }

// ── Prediction ──

/**
 * Predict invader world position at exactly N ticks in the future.
 * Replicates formation.tick() boundary logic exactly — verified to match.
 * Returns both X and Y (Y changes due to row drops on wall bounces).
 */
function predictWorldPos(
  invBaseX: number,
  invBaseY: number,
  formation: Formation,
  ticksAhead: number,
  playArea: { x: number; width: number },
  rowDrop: number,
  dt: number,
): { x: number; y: number } {
  const s = formation.getState()
  const alive = s.invaders.filter((i) => !i.destroyed)
  let offX = s.offset.x
  let offY = s.offset.y
  let dir = s.direction
  const spd = s.speed * dt // px/s → px/frame

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
      offY += rowDrop
    } else {
      offX += dx
    }
  }

  return { x: invBaseX + offX, y: invBaseY + offY }
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
  // Search over extraDelay (frames the ship has to move before firing).
  // For each delay, predict invader position at (delay + travelFrames) ticks
  // ahead. The laser Y and invader Y must intersect — find the tick count
  // where the laser (traveling from shipY at laserSpeed) reaches the invader.

  // Per-frame speeds (px/s * dt = px/frame)
  const dt = 1 / config.framesPerSecond
  const shipSpeedPerFrame = config.shipSpeed * dt
  const laserSpeedPerFrame = config.laserSpeed * dt
  const halfLaser = config.laserWidth / 2
  const halfInvader = config.invaderSize / 2

  // Bounds derived from per-frame speeds
  const maxDelay = Math.ceil(config.playArea.width / shipSpeedPerFrame) + 20
  const maxLaserTicks = Math.ceil(config.shipY / laserSpeedPerFrame) + 5

  const fState = target.formation.getState()
  const alive = fState.invaders.filter((i) => !i.destroyed)
  const spd = fState.speed * dt // px/s → px/frame

  // Pre-compute the formation path once for (maxDelay + maxLaserTicks) ticks.
  const pathLen = maxDelay + maxLaserTicks + 1
  const pathX: number[] = new Array(pathLen)
  const pathY: number[] = new Array(pathLen)

  let offX = fState.offset.x
  let offY = fState.offset.y
  let dir = fState.direction

  pathX[0] = target.invBaseX + offX
  pathY[0] = target.invBaseY + offY

  for (let t = 1; t < pathLen; t++) {
    const dx = dir === 'right' ? spd : -spd
    let wouldExceed = false
    for (const a of alive) {
      if (a.position.x + offX + dx < config.playArea.x ||
          a.position.x + offX + dx >= config.playArea.x + config.playArea.width) {
        wouldExceed = true; break
      }
    }
    if (wouldExceed) { dir = dir === 'right' ? 'left' : 'right'; offY += config.formationRowDrop }
    else { offX += dx }
    pathX[t] = target.invBaseX + offX
    pathY[t] = target.invBaseY + offY
  }

  // Search (extraDelay, laserTicks) space using pre-computed path
  for (let extraDelay = 0; extraDelay < maxDelay; extraDelay++) {
    const fireFrame = currentFrame + extraDelay
    if (fireFrame >= MAX_FRAMES) return null // safety net

    for (let laserTicks = 1; laserTicks < maxLaserTicks; laserTicks++) {
      const totalTicks = extraDelay + laserTicks
      if (totalTicks >= pathLen) break

      const laserY = config.shipY - laserTicks * laserSpeedPerFrame
      if (laserY < 0) break

      const predX = pathX[totalTicks]!
      const predY = pathY[totalTicks]!

      const yOverlap =
        laserY - halfLaser < predY + halfInvader &&
        laserY + halfLaser > predY - halfInvader

      if (!yOverlap) continue

      if (predX < config.playArea.x || predX >= config.playArea.x + config.playArea.width) continue

      const moveDist = Math.abs(predX - shipX)
      if (moveDist > extraDelay * shipSpeedPerFrame) {
        break // need more delay
      }

      return { fireFrame, fireX: predX, targetId: target.id }
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
    const dt = 1 / config.framesPerSecond
    const travelFrames = Math.ceil(dist / (config.laserSpeed * dt))

    for (const inv of fState.invaders) {
      if (inv.destroyed) continue
      const futurePos = predictWorldPos(inv.position.x, inv.position.y, f, travelFrames, config.playArea, config.formationRowDrop, dt)
      const futureX = futurePos.x
      occupiedXs.push(futureX)
    }
  }

  // Find a gap
  const dt = 1 / config.framesPerSecond
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = prng.float(
      config.playArea.x + 10,
      config.playArea.x + config.playArea.width - 10,
    )
    if (occupiedXs.every((ox) => Math.abs(ox - candidate) > config.invaderSize + 2)) {
      const moveDist = Math.abs(candidate - shipX)
      const moveFrames = Math.ceil(moveDist / (config.shipSpeed * dt))
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
  // Per-wave hit chance overrides. Starts with all waves using config.hitChance.
  // If a wave fails (breach), only that wave's hitChance is increased on retry.
  const waveHitChances = new Map<number, number>()
  const maxRetries = 10

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = simulateCore(grid, seed, config, waveHitChances)

    // Check if game completed (game_end event present)
    const completed = result.events.some((e) => e.type === 'game_end')
    if (completed) return result

    // Find which wave breached — it's the active wave that didn't clear
    const spawnedWaves = result.events
      .filter((e) => e.type === 'wave_spawn')
      .map((e) => (e.data as { waveIndex: number }).waveIndex)
    const clearedWaves = new Set(
      result.events
        .filter((e) => e.type === 'wave_clear')
        .map((e) => (e.data as { waveIndex: number }).waveIndex),
    )
    const failedWave = spawnedWaves.find((w) => !clearedWaves.has(w))

    if (failedWave === undefined) return result // shouldn't happen

    // Bump only the failed wave's hit chance
    const current = waveHitChances.get(failedWave) ?? config.hitChance
    waveHitChances.set(failedWave, Math.min(1.0, current + (1.0 - current) * 0.5))
  }

  // Final fallback — set all waves to 100%
  const totalWaves = Math.ceil(grid.cells.filter((c) => c.level > 0).length / (config.waveConfig.weeksPerWave * 7))
  for (let w = 0; w < totalWaves + 1; w++) waveHitChances.set(w, 1.0)
  return simulateCore(grid, seed, config, waveHitChances)
}

function simulateCore(
  grid: Grid,
  seed: string,
  config: SimConfig,
  waveHitChances: Map<number, number> = new Map(),
): SimOutput {
  const prng = createPRNG(seed)
  const dt = 1 / config.framesPerSecond
  const stride = config.cellSize + config.cellGap
  const formationStride = stride + config.formationSpread
  const formationConfig = {
    baseSpeed: config.formationBaseSpeed,
    maxSpeed: config.formationMaxSpeed,
    rowDrop: config.formationRowDrop,
    dt,
  }

  /** Compute invader formation position from cell coordinates. */
  function invaderPosition(cellX: number, cellY: number, minCol: number): Position {
    const col = cellX - minCol
    const staggerX = (cellY % 2) * config.formationRowStagger
    return {
      x: config.gridArea.x + col * formationStride + staggerX,
      y: config.gridArea.y + cellY * formationStride,
    }
  }

  const allEvents: SimEvent[] = []
  const entityTimelines = new Map<string, EntityTimeline>()
  const anchorSnapshots = new Map<number, GameState>()
  const frameDecisions = new Map<number, Decision[]>()

  // Per-frame lifecycle data (lightweight — just phase + cell status indices)
  // Stored every frame so peek() can overlay accurate lifecycle state onto replayed GameState
  interface FrameLifecycle {
    wavePhase: import('../types.js').WavePhase
    wavePhaseProgress: number
    cellStatuses: Array<{ status: import('../types.js').CellStatus; detachProgress: number; targetPosition: Position | null }>
  }
  const frameLifecycleData: FrameLifecycle[] = []

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

  // ── Per-cell staggered lifecycle ──
  interface CellSchedule {
    cellIndex: number
    targetPos: Position
    pluckFrame: number
    travelStartFrame: number
    hatchStartFrame: number
    transformFrame: number
  }
  let pendingWave: ReturnType<typeof simWM.trySpawnNext> = null
  let cellSchedules: CellSchedule[] = []
  let brightenStartFrame = -1
  let lifecycleEndFrame = -1 // frame when last cell transforms → wave starts
  const gridCellStates: Array<{ status: import('../types.js').CellStatus; detachProgress: number; targetPosition: Position | null }> =
    grid.cells.map(() => ({ status: 'in_grid' as const, detachProgress: 0, targetPosition: null }))

  function getWavePhase(): import('../types.js').WavePhase {
    if (pendingWave !== null && cellSchedules.length > 0) {
      const anyInGrid = cellSchedules.some((cs) => cs.cellIndex >= 0 && gridCellStates[cs.cellIndex]!.status === 'in_grid')
      const anyPlucked = cellSchedules.some((cs) => cs.cellIndex >= 0 && gridCellStates[cs.cellIndex]!.status === 'plucked')
      const anyTraveling = cellSchedules.some((cs) => cs.cellIndex >= 0 && gridCellStates[cs.cellIndex]!.status === 'traveling')
      const anyHatching = cellSchedules.some((cs) => cs.cellIndex >= 0 && gridCellStates[cs.cellIndex]!.status === 'hatching')

      // Brightening: before any cell is plucked
      if (anyInGrid && !anyPlucked && !anyTraveling && !anyHatching) return 'brightening'
      // Plucking: some cells still being plucked (some in_grid remain)
      if (anyInGrid) return 'plucking'
      // Darkening: all plucked but none traveling yet
      if (anyPlucked && !anyTraveling && !anyHatching) return 'darkening'
      // Mixed states: cells at different lifecycle stages
      if (anyTraveling) return 'traveling'
      if (anyHatching) return 'hatching'
      return 'hatching'
    }
    if (formations.some((f) => f.getState().active)) return 'active'
    return 'idle'
  }

  function getWavePhaseProgress(): number {
    if (pendingWave === null) return 0
    if (lifecycleEndFrame <= brightenStartFrame) return 0
    const elapsed = totalFrames - brightenStartFrame
    const total = lifecycleEndFrame - brightenStartFrame
    return Math.min(1, elapsed / total)
  }

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

  function cloneFormationState(f: Formation): typeof f extends Formation ? ReturnType<typeof f.getState> : never {
    const s = f.getState()
    return {
      ...s,
      offset: { ...s.offset },
      invaders: s.invaders.map((inv) => ({ ...inv, position: { ...inv.position }, cell: { ...inv.cell } })),
    } as ReturnType<typeof f.getState>
  }

  function buildGameState(frame: number, frameEvents: SimEvent[]): GameState {
    return {
      frame, score, totalInvaders,
      gridCells: grid.cells.map((c, i) => ({
        cell: c,
        status: gridCellStates[i]!.status,
        detachProgress: gridCellStates[i]!.detachProgress,
        targetPosition: gridCellStates[i]!.targetPosition ? { ...gridCellStates[i]!.targetPosition! } : null,
      })),
      formations: formations.map(cloneFormationState),
      ship: { ...ship, position: { ...ship.position } },
      lasers: lasers.map((l) => ({ ...l, position: { ...l.position } })),
      effects: [],
      currentWave: formations.length,
      totalWaves: simWM.totalWaves,
      wavePhase: getWavePhase(),
      wavePhaseProgress: getWavePhaseProgress(),
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

    // Use per-wave hitChance if overridden, otherwise config default
    const activeWaveIdx = formations.length > 0
      ? formations.findLast((f) => f.getState().active)?.getState().waveIndex ?? 0
      : 0
    const effectiveHitChance = waveHitChances.get(activeWaveIdx) ?? config.hitChance
    const isHit = prng.chance(effectiveHitChance)

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

    // 1. Per-cell staggered lifecycle
    const wc = config.waveConfig
    const lifecycleTotal = wc.brightenDuration + wc.pluckDuration + wc.darkenDuration + wc.travelDuration + wc.hatchDuration

    if (!pendingWave) {
      const wave = simWM.trySpawnNext(frame)
      if (wave) {
        if (lifecycleTotal === 0) {
          // No lifecycle — instant spawn (backward compatible)
          const minCol = wave.cells.reduce((m, w) => Math.min(m, w.cell.x), Infinity)
          const invaders: InvaderState[] = wave.cells.map((w, i) => ({
            id: `inv-w${wave.waveIndex}-${i}`,
            cell: w.cell, hp: w.hp, maxHp: w.hp,
            position: invaderPosition(w.cell.x, w.cell.y, minCol),
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
        } else {
          // Start per-cell staggered lifecycle
          pendingWave = wave
          brightenStartFrame = frame
          const minCol = wave.cells.reduce((m, w) => Math.min(m, w.cell.x), Infinity)

          // Build cell list and shuffle for random pluck order
          const cells: Array<{ cellIndex: number; targetPos: Position }> = wave.cells.map((w) => {
            const cellIndex = grid.cells.findIndex((c) => c.x === w.cell.x && c.y === w.cell.y)
            const targetPos = invaderPosition(w.cell.x, w.cell.y, minCol)
            if (cellIndex >= 0) gridCellStates[cellIndex]!.targetPosition = { ...targetPos }
            return { cellIndex, targetPos }
          })
          for (let i = cells.length - 1; i > 0; i--) {
            const j = prng.range(0, i)
            ;[cells[i], cells[j]] = [cells[j]!, cells[i]!]
          }

          // Schedule each cell with staggered timing
          // Pluck is spread across pluckDuration, then each cell individually
          // does: pluck → (wait pluckDuration per cell) → travel → hatch → transform
          const pluckSpread = wc.pluckDuration // total time to pluck all cells
          const n = cells.length
          cellSchedules = cells.map((c, i) => {
            const pluckFrame = frame + wc.brightenDuration + Math.floor((i / n) * pluckSpread)
            const travelStartFrame = pluckFrame + wc.pluckDuration // individual pluck hold time
            const hatchStartFrame = travelStartFrame + wc.travelDuration
            const transformFrame = hatchStartFrame + wc.hatchDuration
            return { ...c, pluckFrame, travelStartFrame, hatchStartFrame, transformFrame }
          })

          // Wave starts when last cell transforms
          lifecycleEndFrame = Math.max(...cellSchedules.map((cs) => cs.transformFrame))

          frameEvents.push({ frame, type: 'wave_phase_change', entityId: 'lifecycle', position: { x: 0, y: 0 }, data: { phase: 'brightening' } })
          addInflection('lifecycle', 'cell', { frame, position: { x: 0, y: 0 }, type: 'phase_change' })
        }
      }
    }

    // Advance per-cell lifecycles
    if (pendingWave && cellSchedules.length > 0) {
      let allTransformed = true

      for (const cs of cellSchedules) {
        if (cs.cellIndex < 0) continue
        const state = gridCellStates[cs.cellIndex]!

        if (frame === cs.pluckFrame && state.status === 'in_grid') {
          state.status = 'plucked'
          const cell = grid.cells[cs.cellIndex]!
          const cellId = `cell-${cell.x}-${cell.y}`
          frameEvents.push({ frame, type: 'cell_pluck', entityId: cellId, position: { x: cell.x, y: cell.y } })
          addInflection(cellId, 'cell', { frame, position: { x: cell.x, y: cell.y }, type: 'pluck' })
        }

        if (frame === cs.travelStartFrame && state.status === 'plucked') {
          state.status = 'traveling'
          state.detachProgress = 0
          const cell = grid.cells[cs.cellIndex]!
          const cellId = `cell-${cell.x}-${cell.y}`
          frameEvents.push({ frame, type: 'cell_travel_start', entityId: cellId, position: { x: cell.x, y: cell.y }, data: { targetX: cs.targetPos.x, targetY: cs.targetPos.y } })
          addInflection(cellId, 'cell', { frame, position: { x: cell.x, y: cell.y }, type: 'travel_start' })
        }

        if (state.status === 'traveling' && frame >= cs.travelStartFrame && frame < cs.hatchStartFrame) {
          const elapsed = frame - cs.travelStartFrame
          state.detachProgress = wc.travelDuration > 0 ? Math.min(1, elapsed / wc.travelDuration) : 1
        }

        if (frame === cs.hatchStartFrame && state.status === 'traveling') {
          state.status = 'hatching'
          state.detachProgress = 1
          const cellId = `cell-${grid.cells[cs.cellIndex]!.x}-${grid.cells[cs.cellIndex]!.y}`
          addInflection(cellId, 'cell', { frame, position: cs.targetPos, type: 'travel_end' })
          frameEvents.push({ frame, type: 'cell_hatch_start', entityId: cellId, position: cs.targetPos })
          addInflection(cellId, 'cell', { frame, position: cs.targetPos, type: 'hatch_start' })
        }

        if (frame === cs.transformFrame && state.status === 'hatching') {
          state.status = 'transformed'
          const cellId = `cell-${grid.cells[cs.cellIndex]!.x}-${grid.cells[cs.cellIndex]!.y}`
          frameEvents.push({ frame, type: 'cell_hatch_complete', entityId: cellId, position: cs.targetPos })
          addInflection(cellId, 'cell', { frame, position: cs.targetPos, type: 'hatch_complete' })
        }

        if (state.status !== 'transformed') allTransformed = false
      }

      // All cells transformed → create formation and start wave
      if (allTransformed) {
        const wave = pendingWave!
        const invaders: InvaderState[] = cellSchedules.map((cs, i) => ({
          id: `inv-w${wave.waveIndex}-${i}`,
          cell: wave.cells[i]!.cell, hp: wave.cells[i]!.hp, maxHp: wave.cells[i]!.hp,
          position: cs.targetPos,
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

        pendingWave = null
        cellSchedules = []
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

    // Check for invader breach — any alive invader past the ship
    let breached = false
    for (const formation of formations) {
      const fState = formation.getState()
      if (!fState.active) continue
      for (const inv of fState.invaders) {
        if (inv.destroyed) continue
        const worldY = inv.position.y + fState.offset.y
        if (worldY >= config.shipY) {
          breached = true
          break
        }
      }
      if (breached) break
    }
    if (breached) {
      // Game over — invader reached the ship. Outer loop will retry.
      break
    }

    // 3. Solver: find solution or execute committed one
    if (solveCooldown > 0) {
      solveCooldown--
      // Organic Y drift during cooldown (ship advances/retreats along fire axis)
      if (config.shipYRange > 0 && prng.chance(0.15)) {
        const minY = config.shipY - config.shipYRange
        const targetY = prng.float(minY, config.shipY)
        const yStep = config.shipSpeed * dt * 0.5 // drift at half speed
        const dy = targetY - ship.position.y
        ship.position.y += Math.sign(dy) * Math.min(Math.abs(dy), yStep)
      }
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
        // Fire rate limit: minimum frames between shots = fps / fireRate
        const minCooldown = Math.ceil(config.framesPerSecond / config.fireRate)
        solveCooldown = minCooldown + prng.range(0, Math.max(1, Math.floor(minCooldown * 0.2)))
      } else {
        // Move toward fire position
        const dx = sol.fireX - ship.position.x
        if (Math.abs(dx) > 0.5) {
          const step = Math.min(Math.abs(dx), config.shipSpeed * dt) * Math.sign(dx)
          ship.position.x += step
          record(frame, { type: 'move', x: ship.position.x })
          addInflection('ship', 'ship', { frame, position: { ...ship.position }, type: 'move_start' })
        }
      }
    }

    // 4. Advance lasers
    lasers = advanceLasers(lasers, config.playArea, dt)

    // 5. Hit detection
    for (const formation of formations) {
      const fState = formation.getState()
      if (!fState.active) continue

      const worldInvaders: InvaderState[] = fState.invaders.map((inv) => ({
        ...inv,
        position: { x: inv.position.x + fState.offset.x, y: inv.position.y + fState.offset.y },
      }))

      const hitResult = checkHits(lasers, worldInvaders, config.laserWidth, config.invaderSize)
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

    // Record lightweight lifecycle data every frame for peek() accuracy
    frameLifecycleData[frame] = {
      wavePhase: getWavePhase(),
      wavePhaseProgress: getWavePhaseProgress(),
      cellStatuses: gridCellStates.map((cs) => ({
        status: cs.status,
        detachProgress: cs.detachProgress,
        targetPosition: cs.targetPosition ? { ...cs.targetPosition } : null,
      })),
    }
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

    // Check LRU cache first
    const c = lruGet(targetFrame)
    if (c) return c

    // Anchor snapshots already have lifecycle data baked in
    const a = anchorSnapshots.get(targetFrame)
    if (a) { lruSet(targetFrame, a); return a }

    // Replay produces correct physics state but lacks lifecycle data.
    // Overlay the recorded per-frame lifecycle data onto the replayed state.
    const s = replayToFrame(grid, config, frameDecisions, targetFrame)
    const lifecycle = frameLifecycleData[targetFrame]
    if (lifecycle) {
      s.wavePhase = lifecycle.wavePhase
      s.wavePhaseProgress = lifecycle.wavePhaseProgress
      for (let i = 0; i < s.gridCells.length && i < lifecycle.cellStatuses.length; i++) {
        s.gridCells[i]!.status = lifecycle.cellStatuses[i]!.status
        s.gridCells[i]!.detachProgress = lifecycle.cellStatuses[i]!.detachProgress
        s.gridCells[i]!.targetPosition = lifecycle.cellStatuses[i]!.targetPosition
      }
    }
    lruSet(targetFrame, s)
    return s
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
  const replayDt = 1 / config.framesPerSecond
  const fc = { baseSpeed: config.formationBaseSpeed, maxSpeed: config.formationMaxSpeed, rowDrop: config.formationRowDrop, dt: replayDt }
  const replayFormStride = config.cellSize + config.cellGap + config.formationSpread
  function replayInvPos(cellX: number, cellY: number, minCol: number): Position {
    return {
      x: config.gridArea.x + (cellX - minCol) * replayFormStride + (cellY % 2) * config.formationRowStagger,
      y: config.gridArea.y + cellY * replayFormStride,
    }
  }
  let score = 0, totalInvaders = 0, laserCounter = 0, lasers: LaserState[] = []
  const formations: Formation[] = []
  const ship: ShipState = { position: { x: config.playArea.width / 2, y: config.shipY }, targetX: null }

  for (let frame = 0; frame <= targetFrame; frame++) {
    const wave = wm.trySpawnNext(frame)
    if (wave) {
      const mc = wave.cells.reduce((m, wc) => Math.min(m, wc.cell.x), Infinity)
      const invaders: InvaderState[] = wave.cells.map((wc, i) => ({
        id: `inv-w${wave.waveIndex}-${i}`, cell: wc.cell, hp: wc.hp, maxHp: wc.hp,
        position: replayInvPos(wc.cell.x, wc.cell.y, mc),
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

    lasers = advanceLasers(lasers, config.playArea, replayDt)
    for (const f of formations) {
      const s = f.getState(); if (!s.active) continue
      const wi = s.invaders.map(inv => ({ ...inv, position: { x: inv.position.x + s.offset.x, y: inv.position.y + s.offset.y } }))
      const hr = checkHits(lasers, wi, config.laserWidth, config.invaderSize)
      for (const h of hr.hits) { const u = hr.updatedInvaders.find(i => i.id === h.invaderId)!; const o = s.invaders.find(i => i.id === h.invaderId)!; o.hp = u.hp; if (u.destroyed) f.destroyInvader(h.invaderId, frame) }
      score += hr.scoreIncrease; lasers = hr.updatedLasers
    }
    for (const f of formations) { const s = f.getState(); if (s.clearedAtFrame === frame) wm.markCleared(s.waveIndex, frame) }
  }

  return {
    frame: targetFrame, score, totalInvaders,
    gridCells: grid.cells.map(c => ({ cell: c, status: 'in_grid' as const, detachProgress: 0, targetPosition: null })),
    formations: formations.map(f => f.getState()),
    ship: { ...ship, position: { ...ship.position } },
    lasers: lasers.map(l => ({ ...l, position: { ...l.position } })),
    effects: [], currentWave: formations.length, totalWaves: wm.totalWaves, wavePhase: 'active' as const, wavePhaseProgress: 0, events: [],
  }
}
