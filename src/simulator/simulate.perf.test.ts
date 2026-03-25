import { describe, it, expect } from 'vitest'

import type {
  Grid,
  SimConfig,
  ContributionCell,
  ContributionLevel,
} from '../types.js'

import { simulate } from './simulate.js'
import { createPRNG } from './prng.js'

// ── Factories ──

function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    waveConfig: { weeksPerWave: 4, spawnDelay: 10 },
    playArea: { x: 0, y: 0, width: 300, height: 400 },
    gridArea: { x: 10, y: 10, width: 280, height: 100 },
    cellSize: 11,
    cellGap: 2,
    laserSpeed: 4,
    shipSpeed: 3,
    shipY: 380,
    formationBaseSpeed: 1,
    formationMaxSpeed: 4,
    formationRowDrop: 20,
    ...overrides,
  }
}

/**
 * Generate a realistic full-year GitHub contribution grid.
 * 52 weeks × 7 days = 364 cells.
 * Uses PRNG to assign contribution levels matching typical GitHub activity:
 *   ~30% NONE (level 0), ~30% FIRST_QUARTILE, ~20% SECOND, ~12% THIRD, ~8% FOURTH
 */
function makeFullYearGrid(seed: string): {
  grid: Grid
  activeCount: number
  totalHP: number
} {
  const prng = createPRNG(seed)
  const cells: ContributionCell[] = []
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

      const count = level === 0 ? 0 : Math.floor(level * 3 + prng.next() * 10)

      cells.push({
        x: week,
        y: day,
        level,
        date: `2025-${String(Math.floor(week / 4) + 1).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`,
        count,
      })

      if (level > 0) {
        activeCount++
        // HP from wave-manager: level ≤ 2 → 1, level 3 → 2, level 4 → 3
        totalHP += level <= 2 ? 1 : level === 3 ? 2 : 3
      }
    }
  }

  return {
    grid: { width: 52, height: 7, cells },
    activeCount,
    totalHP,
  }
}

// ── Performance tests ──

describe('simulate — performance (full year grid)', () => {
  const { grid, activeCount, totalHP } = makeFullYearGrid('perf-bench-2026')
  const config = makeConfig()

  it(`grid stats: ${activeCount} active cells, ${totalHP} total HP, 52×7 = 364 cells`, () => {
    expect(grid.cells).toHaveLength(364)
    expect(activeCount).toBeGreaterThan(200)
    expect(activeCount).toBeLessThan(300)
  })

  it('completes full-year simulation and destroys all invaders', () => {
    const start = performance.now()
    const output = simulate(grid, 'perf-seed-1', config)
    const elapsed = performance.now() - start

    expect(output.finalScore).toBe(activeCount)
    expect(output.totalFrames).toBeLessThan(10_000)

    console.log(
      `\n  Full-year simulation:` +
        `\n    Active cells:    ${activeCount}` +
        `\n    Total HP:        ${totalHP}` +
        `\n    Waves:           ${Math.ceil(52 / config.waveConfig.weeksPerWave)}` +
        `\n    Final score:     ${output.finalScore}` +
        `\n    Total frames:    ${output.totalFrames}` +
        `\n    Total events:    ${output.events.length}` +
        `\n    Entity timelines: ${output.getAllInflections().size}` +
        `\n    Elapsed:         ${elapsed.toFixed(1)}ms`,
    )
  })

  it('peek() reconstructs mid-game state efficiently', () => {
    const output = simulate(grid, 'perf-seed-1', config)
    const midFrame = Math.floor(output.totalFrames / 2)

    const start = performance.now()
    const state = output.peek(midFrame)
    const elapsed = performance.now() - start

    expect(state.frame).toBe(midFrame)
    expect(state.score).toBeGreaterThan(0)
    expect(state.score).toBeLessThanOrEqual(output.finalScore)

    console.log(
      `\n  peek(${midFrame}):` +
        `\n    Score at mid:    ${state.score}/${output.finalScore}` +
        `\n    Active lasers:   ${state.lasers.length}` +
        `\n    Elapsed:         ${elapsed.toFixed(1)}ms`,
    )
  })

  it('runs 5 different seeds and reports variance', () => {
    const seeds = ['bench-A', 'bench-B', 'bench-C', 'bench-D', 'bench-E']
    const results: Array<{
      seed: string
      ms: number
      frames: number
      events: number
      score: number
    }> = []

    for (const s of seeds) {
      const start = performance.now()
      const out = simulate(grid, s, config)
      const ms = performance.now() - start

      results.push({
        seed: s,
        ms,
        frames: out.totalFrames,
        events: out.events.length,
        score: out.finalScore,
      })

      expect(out.finalScore).toBe(activeCount)
    }

    const times = results.map((r) => r.ms)
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const max = Math.max(...times)
    const min = Math.min(...times)

    console.log(
      `\n  5-seed benchmark (${activeCount} invaders):` +
        `\n    Avg:    ${avg.toFixed(1)}ms` +
        `\n    Min:    ${min.toFixed(1)}ms` +
        `\n    Max:    ${max.toFixed(1)}ms` +
        `\n    Range:  ${(max - min).toFixed(1)}ms`,
    )

    for (const r of results) {
      console.log(
        `    ${r.seed}: ${r.ms.toFixed(1)}ms, ${r.frames} frames, ${r.events} events`,
      )
    }
  })
})
