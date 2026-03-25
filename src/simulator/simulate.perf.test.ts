/**
 * Performance benchmark for full GitHub contribution chart simulation.
 *
 * Run manually: npx vitest run src/simulator/simulate.perf.test.ts
 *
 * Tests a realistic 52-week × 7-day grid (~250 active invaders across
 * 13 waves) to measure simulation throughput across multiple seeds.
 */
import { describe, it, expect } from 'vitest'

import type { Grid, SimConfig, ContributionLevel } from '../types.js'
import { simulate } from './simulate.js'
import { createPRNG } from './prng.js'

function makeConfig(): SimConfig {
  return {
    framesPerSecond: 1,
    waveConfig: { weeksPerWave: 4, spawnDelay: 10, brightenDuration: 0, pluckDuration: 0, darkenDuration: 0, travelDuration: 0, hatchDuration: 0 },
    playArea: { x: 0, y: 0, width: 300, height: 400 },
    gridArea: { x: 10, y: 10, width: 280, height: 100 },
    cellSize: 11,
    cellGap: 2,
    laserSpeed: 4,
    laserWidth: 2,
    invaderSize: 11,
    shipSpeed: 3,
    shipY: 380,
    formationBaseSpeed: 1,
    formationMaxSpeed: 4,
    formationRowDrop: 20,
    hitChance: 0.85,
  }
}

/**
 * Generate a realistic full-year GitHub contribution grid.
 * Distribution: ~30% NONE, ~30% L1, ~20% L2, ~12% L3, ~8% L4
 */
function makeFullYearGrid(seed: string): {
  grid: Grid
  activeCount: number
  totalHP: number
  totalCommits: number
} {
  const prng = createPRNG(seed)
  const cells = []
  let activeCount = 0
  let totalHP = 0

  for (let week = 0; week < 52; week++) {
    for (let day = 0; day < 7; day++) {
      const roll = prng.next()
      let level: ContributionLevel
      if (roll < 0.3) level = 0
      else if (roll < 0.6) level = 1
      else if (roll < 0.8) level = 2
      else if (roll < 0.92) level = 3
      else level = 4

      cells.push({
        x: week,
        y: day,
        level,
        date: `2025-${String(Math.floor(week / 4) + 1).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`,
        count: level === 0 ? 0 : Math.floor(level * 3 + prng.next() * 10),
      })

      const count = level === 0 ? 0 : Math.floor(level * 3 + prng.next() * 10)
      cells[cells.length - 1]!.count = count

      if (level > 0) {
        activeCount++
        totalHP += level <= 2 ? 1 : level === 3 ? 2 : 3
      }
    }
  }

  const totalCommits = cells.reduce((sum, c) => sum + c.count, 0)
  return { grid: { width: 52, height: 7, cells }, activeCount, totalHP, totalCommits }
}

describe('simulate — full year performance', () => {
  const config = makeConfig()

  it('completes a full 52-week grid across 10 seeds', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => `perf-${i}`)
    const results: Array<{
      seed: string
      ms: number
      frames: number
      events: number
      fires: number
      hits: number
      invaders: number
      score: number
    }> = []

    for (const seed of seeds) {
      const { grid, activeCount, totalCommits } = makeFullYearGrid(seed)
      const start = performance.now()
      const out = simulate(grid, seed, config)
      const ms = performance.now() - start

      const fires = out.events.filter((e) => e.type === 'fire_laser').length
      const hits = out.events.filter((e) => e.type === 'hit').length

      results.push({
        seed,
        ms,
        frames: out.totalFrames,
        events: out.events.length,
        fires,
        hits,
        invaders: activeCount,
        score: out.finalScore,
      })

      // Every seed MUST complete
      expect(out.finalScore).toBe(totalCommits)
    }

    const times = results.map((r) => r.ms)
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const max = Math.max(...times)
    const min = Math.min(...times)

    console.log(
      `\n  Full-year benchmark (10 seeds):` +
        `\n    Avg time:     ${avg.toFixed(1)}ms` +
        `\n    Min/Max:      ${min.toFixed(1)}ms / ${max.toFixed(1)}ms` +
        `\n    Avg invaders: ${(results.reduce((a, r) => a + r.invaders, 0) / results.length).toFixed(0)}` +
        `\n    Avg frames:   ${(results.reduce((a, r) => a + r.frames, 0) / results.length).toFixed(0)}` +
        `\n    Avg fires:    ${(results.reduce((a, r) => a + r.fires, 0) / results.length).toFixed(0)}` +
        `\n    Avg hits:     ${(results.reduce((a, r) => a + r.hits, 0) / results.length).toFixed(0)}` +
        `\n    Hit rate:     ${((results.reduce((a, r) => a + r.hits, 0) / results.reduce((a, r) => a + r.fires, 0)) * 100).toFixed(1)}%`,
    )

    for (const r of results) {
      console.log(
        `    ${r.seed}: ${r.ms.toFixed(0)}ms, ${r.invaders} inv, ${r.frames}f, ${r.fires}F/${r.hits}H`,
      )
    }

    // Performance gate: each seed should complete in under 500ms
    for (const r of results) {
      expect(r.ms).toBeLessThan(500)
    }
  })

  it('peek() mid-game is fast', () => {
    const { grid, totalCommits } = makeFullYearGrid('peek-bench')
    const out = simulate(grid, 'peek-bench', config)

    expect(out.finalScore).toBe(totalCommits)

    const mid = Math.floor(out.totalFrames / 2)
    const start = performance.now()
    const state = out.peek(mid)
    const ms = performance.now() - start

    console.log(
      `\n  peek(${mid}/${out.totalFrames}): ${ms.toFixed(1)}ms, score ${state.score}/${out.finalScore}`,
    )

    expect(state.frame).toBe(mid)
    expect(state.score).toBeGreaterThan(0)
    expect(ms).toBeLessThan(200)
  })
})
