/**
 * Prediction accuracy tests.
 *
 * Core invariant: if the solver produces a firing solution (fireFrame, fireX)
 * for a target, then a laser fired from (fireX, shipY) at that frame MUST
 * hit the invader. 100%.
 */
import { describe, it, expect } from 'vitest'

import { createFormation } from './formation.js'
import { createPRNG } from './prng.js'
import { spawnLaser, advanceLasers, checkHits } from './combat.js'
import type { InvaderState, BoundingBox, LaserState } from '../types.js'

const PLAY_AREA: BoundingBox = { x: 0, y: 0, width: 300, height: 400 }
const SHIP_Y = 380
const LASER_SPEED = 4
const INVADER_SIZE = 11
const FC = { baseSpeed: 1, maxSpeed: 4, rowDrop: 20, dt: 1 }

function makeInvader(id: string, x: number, y: number, hp = 1): InvaderState {
  return {
    id, cell: { x: 0, y: 0, level: 1, date: '2025-01-01', count: 1 },
    hp, maxHp: hp, position: { x, y }, destroyed: false, destroyedAtFrame: null,
  }
}

/** Same prediction as simulate.ts */
function predictWorldPos(
  invBaseX: number, invBaseY: number,
  formation: ReturnType<typeof createFormation>,
  ticksAhead: number,
): { x: number; y: number } {
  const s = formation.getState()
  const alive = s.invaders.filter((i) => !i.destroyed)
  let offX = s.offset.x, offY = s.offset.y, dir = s.direction
  const spd = s.speed * FC.dt

  for (let t = 0; t < ticksAhead; t++) {
    const dx = dir === 'right' ? spd : -spd
    let wouldExceed = false
    for (const a of alive) {
      if (a.position.x + offX + dx < PLAY_AREA.x ||
          a.position.x + offX + dx >= PLAY_AREA.x + PLAY_AREA.width) {
        wouldExceed = true; break
      }
    }
    if (wouldExceed) { dir = dir === 'right' ? 'left' : 'right'; offY += FC.rowDrop }
    else { offX += dx }
  }

  return { x: invBaseX + offX, y: invBaseY + offY }
}

/** Same solver as simulate.ts solveHit */
function solveHit(
  invBaseX: number, invBaseY: number,
  formation: ReturnType<typeof createFormation>,
  shipX: number,
): { fireFrame: number; fireX: number } | null {
  for (let extraDelay = 0; extraDelay < 500; extraDelay++) {
    for (let laserTicks = 1; laserTicks < 500; laserTicks++) {
      const totalTicks = extraDelay + laserTicks
      const predicted = predictWorldPos(invBaseX, invBaseY, formation, totalTicks)

      const laserY = SHIP_Y - laserTicks * LASER_SPEED
      if (laserY < 0) break

      const yOverlap =
        laserY - 1 < predicted.y + INVADER_SIZE / 2 &&
        laserY + 1 > predicted.y - INVADER_SIZE / 2

      if (!yOverlap) continue

      if (predicted.x < PLAY_AREA.x || predicted.x >= PLAY_AREA.x + PLAY_AREA.width) continue

      const moveDist = Math.abs(predicted.x - shipX)
      if (moveDist > extraDelay * 3) break // ship speed = 3

      return { fireFrame: extraDelay, fireX: predicted.x }
    }
  }
  return null
}

/**
 * Verify: solve a hit, then simulate the actual formation + laser to confirm it hits.
 */
function verifyHit(
  invaders: InvaderState[],
  startFrame: number,
  targetIdx: number,
  shipX = 150,
): { solved: boolean; hit: boolean; fireX: number; details: string } {
  const formation = createFormation(
    invaders.map((i) => ({ ...i, position: { ...i.position } })),
    0, PLAY_AREA, FC,
  )
  for (let f = 0; f < startFrame; f++) formation.tick(f)

  const inv = formation.getState().invaders[targetIdx]!
  const sol = solveHit(inv.position.x, inv.position.y, formation, shipX)
  if (!sol) return { solved: false, hit: false, fireX: 0, details: 'no solution' }

  // Now simulate: tick formation sol.fireFrame + laserTicks times,
  // and verify the laser actually hits.
  // We need a fresh formation from the same state to simulate forward.
  const simFormation = createFormation(
    invaders.map((i) => ({ ...i, position: { ...i.position } })),
    0, PLAY_AREA, FC,
  )
  for (let f = 0; f < startFrame; f++) simFormation.tick(f)

  // Tick through the extra delay
  for (let f = 0; f < sol.fireFrame; f++) {
    simFormation.tick(startFrame + f)
  }

  // Fire the laser
  let laser: LaserState = spawnLaser('test', { x: sol.fireX, y: SHIP_Y }, LASER_SPEED)

  // Advance laser + formation until hit or laser exits
  for (let t = 0; t < 500; t++) {
    simFormation.tick(startFrame + sol.fireFrame + t)
    const advanced = advanceLasers([laser], PLAY_AREA, FC.dt)
    if (advanced.length === 0) {
      return { solved: true, hit: false, fireX: sol.fireX, details: `laser exited at tick ${t}` }
    }
    laser = advanced[0]!

    const fs = simFormation.getState()
    const worldInvaders = fs.invaders.map((inv) => ({
      ...inv,
      position: { x: inv.position.x + fs.offset.x, y: inv.position.y + fs.offset.y },
    }))

    const result = checkHits([laser], worldInvaders)
    if (result.hits.length > 0) {
      return { solved: true, hit: true, fireX: sol.fireX, details: `hit at tick ${t}` }
    }
  }

  return { solved: true, hit: false, fireX: sol.fireX, details: 'no hit after 500 ticks' }
}

// ── Tests ──

describe('prediction accuracy', () => {
  it('single invader, start frame 0', () => {
    const r = verifyHit([makeInvader('inv', 10, 10)], 0, 0)
    expect(r.solved).toBe(true)
    expect(r.hit).toBe(true)
  })

  it('single invader, mid-game', () => {
    const r = verifyHit([makeInvader('inv', 10, 10)], 50, 0)
    expect(r.solved).toBe(true)
    expect(r.hit).toBe(true)
  })

  it('single invader, near wall bounce', () => {
    const r = verifyHit([makeInvader('inv', 10, 10)], 250, 0)
    expect(r.solved).toBe(true)
    expect(r.hit).toBe(true)
  })

  it('single invader, after wall bounce', () => {
    const r = verifyHit([makeInvader('inv', 10, 10)], 300, 0)
    expect(r.solved).toBe(true)
    expect(r.hit).toBe(true)
  })

  it('single invader, at the problematic frame 200', () => {
    const r = verifyHit([makeInvader('inv', 10, 10)], 200, 0)
    expect(r.solved).toBe(true)
    expect(r.hit).toBe(true)
  })

  it('multiple invaders', () => {
    const invaders = [makeInvader('a', 10, 10), makeInvader('b', 30, 10), makeInvader('c', 50, 10)]
    for (let i = 0; i < invaders.length; i++) {
      const r = verifyHit(invaders, 20, i)
      expect(r.hit).toBe(true)
    }
  })

  it('invader at Y=80 (shorter laser travel)', () => {
    const r = verifyHit([makeInvader('inv', 10, 80)], 10, 0)
    expect(r.solved).toBe(true)
    expect(r.hit).toBe(true)
  })

  it('100% accuracy across 20 start frames', () => {
    const failures: string[] = []
    let solved = 0

    for (let frame = 0; frame < 400; frame += 20) {
      const r = verifyHit([makeInvader('inv', 10, 10)], frame, 0)
      if (!r.solved) continue
      solved++
      if (!r.hit) failures.push(`frame=${frame}: ${r.details}`)
    }

    expect(solved).toBeGreaterThan(15)
    expect(failures).toEqual([])
  })

  it('100% accuracy across 20 random seeds', () => {
    const failures: string[] = []
    let solved = 0

    for (let i = 0; i < 20; i++) {
      const prng = createPRNG(`pred-${i}`)
      const x = prng.range(5, 250)
      const y = prng.range(5, 100)
      const startFrame = prng.range(0, 300)

      const r = verifyHit([makeInvader('inv', x, y)], startFrame, 0)
      if (!r.solved) continue
      solved++
      if (!r.hit) {
        failures.push(`seed=pred-${i} x=${x} y=${y} frame=${startFrame} fireX=${r.fireX.toFixed(1)}: ${r.details}`)
      }
    }

    expect(solved).toBeGreaterThan(15)
    expect(failures).toEqual([])
  })
})
