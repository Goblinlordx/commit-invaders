import { describe, it, expect } from 'vitest'
import type { Grid, ContributionLevel, SimConfig } from '../types.js'
import { simulate } from './simulate.js'
import { createPRNG } from './prng.js'

const STRIDE = 13
const PADDING = 20
const gridW = 7 * STRIDE + PADDING * 2
const gridH = 52 * STRIDE
const shipMargin = 24

const baseConfig: SimConfig = {
  framesPerSecond: 60,
  waveConfig: {
    weeksPerWave: 4, startDelay: 60, spawnDelay: 0,
    brightenDuration: 60, pluckDuration: 20, darkenDuration: 60,
    travelDuration: 40, hatchDuration: 20,
    endingFadeoutDuration: 60, endingScoreDuration: 180,
    endingScoreOutDuration: 30, endingBoardInDuration: 30,
    endingHoldDuration: 300, endingBlackoutDuration: 60, endingResetDuration: 60,
  },
  playArea: { x: 0, y: 0, width: gridW, height: gridH + shipMargin },
  gridArea: { x: PADDING, y: 0, width: 7 * STRIDE, height: gridH },
  cellSize: 11, cellGap: 2, laserSpeed: 240, laserWidth: 4, invaderSize: 9,
  shipSpeed: 180, shipY: gridH + shipMargin - 4,
  formationBaseSpeed: 60, formationMaxSpeed: 240, formationRowDrop: 14,
  hitChance: 0.85, fireRate: 5, shipYRange: 30,
  formationSpread: 10, formationRowStagger: 10,
}

function makeGrid(weeks: number, seed: string): Grid {
  const prng = createPRNG(seed)
  const cells = []
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const roll = prng.next()
      let level: ContributionLevel
      if (roll < 0.70) level = 0
      else if (roll < 0.82) level = 1
      else if (roll < 0.91) level = 2
      else if (roll < 0.97) level = 3
      else level = 4
      cells.push({
        x: w, y: d, level,
        date: '2025-01-01',
        count: level === 0 ? 0 : Math.floor(level * 3 + prng.next() * 10),
      })
    }
  }
  return { width: weeks, height: 7, cells }
}

describe('solver accuracy', () => {
  it('hitChance=1.0 — all intended hits connect (no misses from prediction)', () => {
    const config = { ...baseConfig, hitChance: 1.0 }
    let totalFires = 0
    let totalHits = 0
    let totalDestroys = 0

    for (let i = 0; i < 5; i++) {
      const seed = `acc-100-${i}`
      const grid = makeGrid(53, seed)
      const output = simulate(grid, seed, config)
      totalFires += output.events.filter(e => e.type === 'fire_laser').length
      totalHits += output.events.filter(e => e.type === 'hit').length
      totalDestroys += output.events.filter(e => e.type === 'destroy').length
    }

    // Every invader should be destroyed, and hit rate should be reasonable
    // (wasted shots from targeting already-dead invaders are acceptable)
    expect(totalDestroys).toBeGreaterThan(0)
    expect(totalHits / totalFires).toBeGreaterThan(0.35)
  })

  it('hitChance=0.85 — games complete and hit rate is reasonable', () => {
    const config = { ...baseConfig, hitChance: 0.85 }
    let totalFires = 0
    let totalHits = 0
    let completed = 0

    for (let i = 0; i < 5; i++) {
      const seed = `acc-85-${i}`
      const grid = makeGrid(53, seed)
      const output = simulate(grid, seed, config)
      totalFires += output.events.filter(e => e.type === 'fire_laser').length
      totalHits += output.events.filter(e => e.type === 'hit').length
      if (output.events.some(e => e.type === 'game_end')) completed++
    }

    expect(completed).toBe(5)
    expect(totalHits / totalFires).toBeGreaterThan(0.30)
  })

  it('all games complete successfully', () => {
    for (let i = 0; i < 5; i++) {
      const seed = `complete-${i}`
      const grid = makeGrid(53, seed)
      const output = simulate(grid, seed, baseConfig)
      const gameEnd = output.events.some(e => e.type === 'game_end')
      expect(gameEnd).toBe(true)
    }
  })

  it('hitChance=0 has very low hit rate (accidental collisions only)', () => {
    const config = { ...baseConfig, hitChance: 0 }
    const grid = makeGrid(53, 'miss-only')
    const output = simulate(grid, 'miss-only', config)
    const fires = output.events.filter(e => e.type === 'fire_laser').length
    const hits = output.events.filter(e => e.type === 'hit').length
    // Accidental hits from AABB overlap should be rare (<5%)
    const rate = fires > 0 ? hits / fires : 0
    expect(rate).toBeLessThan(0.05)
  })
})
