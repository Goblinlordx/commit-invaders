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

const MAX_FRAMES = 10_000
const ANCHOR_INTERVAL = 100
const LRU_CAPACITY = 16
const HIT_CHANCE = 0.85
const PATH_LOOKAHEAD = 500

// ── Decision recording ──

type Decision = { type: 'move'; x: number } | { type: 'fire' }

// ── Formation path prediction ──

interface PathSnapshot {
  offsetX: number
  offsetY: number
  direction: 'left' | 'right'
}

/**
 * Predict formation offsets for future frames by cloning state and ticking.
 * Returns an array indexed by frames-from-now.
 */
function computeFormationPath(
  formation: Formation,
  playArea: { x: number; y: number; width: number; height: number },
  lookahead: number,
): PathSnapshot[] {
  const fState = formation.getState()
  if (!fState.active) return []

  const alive = fState.invaders.filter((i) => !i.destroyed)
  if (alive.length === 0) return []

  let offX = fState.offset.x
  let offY = fState.offset.y
  let dir = fState.direction
  const spd = fState.speed

  const path: PathSnapshot[] = [
    { offsetX: offX, offsetY: offY, direction: dir },
  ]

  for (let t = 0; t < lookahead; t++) {
    const dx = dir === 'right' ? spd : -spd
    let wouldExceed = false
    for (const a of alive) {
      const ex = a.position.x + offX + dx
      if (ex < playArea.x || ex >= playArea.x + playArea.width) {
        wouldExceed = true
        break
      }
    }
    if (wouldExceed) {
      dir = dir === 'right' ? 'left' : 'right'
      offY += 20 // rowDrop
    } else {
      offX += dx
    }
    path.push({ offsetX: offX, offsetY: offY, direction: dir })
  }

  return path
}

// ── Solver ──

interface ShotSolution {
  fireFrame: number
  shipX: number
  targetId: string | null // null = miss
  isHit: boolean
}

/**
 * Solve for the next shot. PRNG determines hit/miss and target.
 * Searches for the earliest feasible impact time given ship speed.
 *
 * Returns null if no solution found (insert delay and retry).
 */
function solveNextShot(
  prng: PRNG,
  currentTime: number,
  shipX: number,
  formations: Formation[],
  paths: Map<Formation, PathSnapshot[]>,
  config: SimConfig,
  aliveInvaders: Array<{ id: string; basePos: Position; formation: Formation }>,
): ShotSolution | null {
  const isHit = prng.chance(HIT_CHANCE)

  if (!isHit) {
    // Miss: fire at a random x position
    const missX = prng.float(
      config.playArea.x + 20,
      config.playArea.x + config.playArea.width - 20,
    )
    const moveDist = Math.abs(missX - shipX)
    const moveFrames = Math.ceil(moveDist / config.shipSpeed)
    const fireFrame = currentTime + moveFrames + prng.range(0, 2)

    return {
      fireFrame,
      shipX: missX,
      targetId: null,
      isHit: false,
    }
  }

  // Hit: pick a target
  if (aliveInvaders.length === 0) return null

  const targetIdx = prng.range(0, aliveInvaders.length - 1)
  const target = aliveInvaders[targetIdx]!
  const path = paths.get(target.formation)
  if (!path || path.length === 0) return null

  const fState = target.formation.getState()

  // Search for earliest feasible impact time
  const minTravel = Math.ceil(
    (config.shipY - (target.basePos.y + fState.offset.y)) / config.laserSpeed,
  )

  for (
    let futureOffset = minTravel;
    futureOffset < path.length;
    futureOffset++
  ) {
    const impactTime = currentTime + futureOffset
    if (impactTime >= MAX_FRAMES) break

    const snapshot = path[futureOffset]
    if (!snapshot) break

    const invWorldX = target.basePos.x + snapshot.offsetX
    const invWorldY = target.basePos.y + snapshot.offsetY

    // Laser travel time from ship to invader at impact
    const dist = config.shipY - invWorldY
    if (dist <= 0) continue
    const travelFrames = Math.ceil(dist / config.laserSpeed)

    const fireFrame = impactTime - travelFrames
    if (fireFrame < currentTime) continue

    // Ship feasibility: can it reach invWorldX by fireFrame?
    const moveDist = Math.abs(invWorldX - shipX)
    const availableFrames = fireFrame - currentTime
    if (moveDist > availableFrames * config.shipSpeed) continue

    // Feasible!
    return {
      fireFrame,
      shipX: invWorldX,
      targetId: target.id,
      isHit: true,
    }
  }

  // No feasible solution for this target — caller should retry or delay
  return null
}

// ── Main simulate function ──

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

  // Solver state
  let solverTime = 0
  let solverShipX = config.playArea.width / 2
  let pathsDirty = true
  const formationPaths = new Map<Formation, PathSnapshot[]>()

  // Track invaders with shots already in flight (avoid double-targeting same frame)
  const recentlyTargeted = new Set<string>()

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

  function recomputePaths(): void {
    formationPaths.clear()
    for (const f of formations) {
      if (f.getState().active) {
        formationPaths.set(
          f,
          computeFormationPath(f, config.playArea, PATH_LOOKAHEAD),
        )
      }
    }
    pathsDirty = false
  }

  function getAliveInvaders(): Array<{
    id: string
    basePos: Position
    formation: Formation
    hp: number
  }> {
    const result: Array<{
      id: string
      basePos: Position
      formation: Formation
      hp: number
    }> = []
    for (const f of formations) {
      const fState = f.getState()
      if (!fState.active) continue
      for (const inv of fState.invaders) {
        if (!inv.destroyed) {
          result.push({
            id: inv.id,
            basePos: inv.position,
            formation: f,
            hp: inv.hp,
          })
        }
      }
    }
    return result
  }

  /**
   * Run the solver ahead: plan actions until we've scheduled shots
   * for all alive invaders, or we can't solve further.
   */
  function planAhead(currentFrame: number): void {
    if (solverTime < currentFrame) {
      solverTime = currentFrame
    }

    // Plan up to a batch of shots
    const maxSolveAttempts = 50
    let attempts = 0

    while (attempts < maxSolveAttempts) {
      attempts++

      if (pathsDirty) recomputePaths()

      const alive = getAliveInvaders()
      if (alive.length === 0) break

      // Add reaction delay
      const delay = prng.range(2, 6)
      solverTime += delay

      const solution = solveNextShot(
        prng,
        solverTime,
        solverShipX,
        formations,
        formationPaths,
        config,
        alive,
      )

      if (!solution) {
        // Try other targets before giving up
        let found = false
        for (let retry = 0; retry < Math.min(alive.length, 5); retry++) {
          const alt = solveNextShot(
            prng,
            solverTime,
            solverShipX,
            formations,
            formationPaths,
            config,
            alive,
          )
          if (alt) {
            recordSolution(alt)
            found = true
            break
          }
        }

        if (!found) {
          // Insert delay and retry
          solverTime += prng.range(5, 15)
          pathsDirty = true // paths may have shifted
          continue
        }
      } else {
        recordSolution(solution)
      }
    }
  }

  function recordSolution(sol: ShotSolution): void {
    // Record move
    let decisions = frameDecisions.get(sol.fireFrame)
    if (!decisions) {
      decisions = []
      frameDecisions.set(sol.fireFrame, decisions)
    }
    decisions.push({ type: 'move', x: sol.shipX })
    decisions.push({ type: 'fire' })

    solverShipX = sol.shipX
    solverTime = sol.fireFrame + prng.range(1, 3)

    if (sol.isHit && sol.targetId) {
      recentlyTargeted.add(sol.targetId)
    }
  }

  // ── Forward simulation loop ──

  let totalFrames = 0

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    const frameEvents: SimEvent[] = []

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

      pathsDirty = true
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

    // 3. Run solver if we need more planned actions
    const hasAlive = formations.some((f) => {
      const s = f.getState()
      return s.active && s.invaders.some((i) => !i.destroyed)
    })
    if (hasAlive && frame >= solverTime - 10) {
      pathsDirty = true
      planAhead(frame)
    }

    // 4. Execute decisions for this frame
    const decisions = frameDecisions.get(frame)
    if (decisions) {
      for (const d of decisions) {
        if (d.type === 'move') {
          ship.position.x = d.x

          addInflection('ship', 'ship', {
            frame,
            position: { ...ship.position },
            type: 'move_start',
          })
        } else {
          const laserId = `laser-${laserCounter++}`
          const laser = spawnLaser(
            laserId,
            ship.position,
            config.laserSpeed,
          )
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
        }
      }
    }

    // 5. Advance lasers
    lasers = advanceLasers(lasers, config.playArea)

    // 6. Hit detection
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

          // Kill changes formation speed → invalidate paths
          recentlyTargeted.delete(hit.invaderId)
          pathsDirty = true
        }
      }

      score += hitResult.scoreIncrease
      lasers = hitResult.updatedLasers
    }

    // Clear recently targeted set periodically so invaders can be re-targeted
    if (frame % 50 === 0) {
      recentlyTargeted.clear()
    }

    // 7. Wave clears
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
