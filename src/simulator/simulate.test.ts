import { describe, it, expect } from 'vitest'

import type {
  Grid,
  SimConfig,
  ContributionCell,
} from '../types.js'

import { simulate } from './simulate.js'

// ── Factories ──

function makeCell(
  x: number,
  y: number,
  level: 1 | 2 | 3 | 4 = 1,
): ContributionCell {
  return { x, y, level, date: '2026-01-01', count: level }
}

function makeGrid(cells: ContributionCell[]): Grid {
  const maxX = cells.reduce((m, c) => Math.max(m, c.x), 0)
  return { width: maxX + 1, height: 7, cells }
}

function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    framesPerSecond: 1, // dt=1 — keeps legacy test values (speed in px/frame)
    waveConfig: { weeksPerWave: 4, startDelay: 0, introScoreboardFadeIn: 0, introScoreboardHold: 0, introScoreboardFadeOut: 0, spawnDelay: 10, brightenDuration: 0, pluckDuration: 0, darkenDuration: 0, travelDuration: 0, hatchDuration: 0, endingFadeoutDuration: 0, endingScoreDuration: 0, endingScoreOutDuration: 0, endingBoardInDuration: 0, endingHoldDuration: 0, endingBlackoutDuration: 0, endingResetDuration: 0 },
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
    fireRate: 1000,
    shipYRange: 0,
    formationSpread: 0,
    formationRowStagger: 0,
    ...overrides,
  }
}

// ── Test grids ──

// 2 invaders, 1 wave, both level 1 (1 HP)
const SIMPLE_GRID = makeGrid([makeCell(0, 0), makeCell(0, 1)])

// Multi-wave: columns 0-1 (wave 1) and column 5 (wave 2)
const MULTI_WAVE_GRID = makeGrid([
  makeCell(0, 0),
  makeCell(0, 1),
  makeCell(1, 0),
  makeCell(1, 2),
  makeCell(5, 0),
  makeCell(5, 3),
])

// High-HP invaders
const HIGH_HP_GRID = makeGrid([
  makeCell(0, 0, 3), // HP 2
  makeCell(0, 1, 4), // HP 3
])

// Spread-out invaders (harder to hit, tests miss recovery)
const SPREAD_GRID = makeGrid([
  makeCell(0, 0),
  makeCell(0, 6),
])

describe('simulate', () => {
  describe('output structure', () => {
    it('returns SimOutput with all required fields', () => {
      const output = simulate(SIMPLE_GRID, 'test-seed', makeConfig())

      expect(output.events).toBeInstanceOf(Array)
      expect(output.totalFrames).toBeGreaterThan(0)
      expect(output.config).toBeDefined()
      expect(output.finalScore).toBeGreaterThanOrEqual(0)
      expect(typeof output.peek).toBe('function')
      expect(typeof output.getInflections).toBe('function')
      expect(typeof output.getAllInflections).toBe('function')
    })

    it('records events as compact deltas', () => {
      const output = simulate(SIMPLE_GRID, 'test-seed', makeConfig())

      expect(output.events.length).toBeGreaterThan(0)
      for (const ev of output.events) {
        expect(ev).toHaveProperty('frame')
        expect(ev).toHaveProperty('type')
        expect(ev).toHaveProperty('entityId')
        expect(ev).toHaveProperty('position')
      }
    })
  })

  describe('game completion', () => {
    it('destroys all invaders (simple grid)', () => {
      const output = simulate(SIMPLE_GRID, 'test-seed', makeConfig())
      expect(output.finalScore).toBe(2)
    })

    it('destroys all invaders (multi-wave grid)', () => {
      const output = simulate(MULTI_WAVE_GRID, 'multi-seed', makeConfig())
      expect(output.finalScore).toBe(6)
    })

    it('destroys high-HP invaders', () => {
      const output = simulate(HIGH_HP_GRID, 'hp-seed', makeConfig())
      // level 3 (count=3) + level 4 (count=4) = 7
      expect(output.finalScore).toBe(7)
    })

    it('destroys spread-out invaders', () => {
      const output = simulate(SPREAD_GRID, 'spread-seed', makeConfig())
      expect(output.finalScore).toBe(2)
    })

    it('final score equals total active commits', () => {
      const grid = makeGrid([
        makeCell(0, 0, 1),
        makeCell(0, 1, 2),
        makeCell(0, 2, 3),
        makeCell(0, 3, 4),
        // level 0 cells are excluded from grid.cells by convention, but
        // if present they don't count
      ])
      const expectedScore = 1 + 2 + 3 + 4 // sum of cell.count (= level)
      const output = simulate(grid, 'score-seed', makeConfig())
      expect(output.finalScore).toBe(expectedScore)
    })
  })

  describe('determinism', () => {
    it('same (Grid, seed) produces identical SimOutput', () => {
      const config = makeConfig()
      const a = simulate(MULTI_WAVE_GRID, 'det-seed', config)
      const b = simulate(MULTI_WAVE_GRID, 'det-seed', config)

      expect(a.totalFrames).toBe(b.totalFrames)
      expect(a.finalScore).toBe(b.finalScore)
      expect(a.events.length).toBe(b.events.length)
      for (let i = 0; i < a.events.length; i++) {
        expect(a.events[i]).toEqual(b.events[i])
      }
    })

    it('different seeds produce different outputs', () => {
      const config = makeConfig()
      const a = simulate(MULTI_WAVE_GRID, 'seed-A', config)
      const b = simulate(MULTI_WAVE_GRID, 'seed-B', config)

      // Scores should match (both complete the game) but timelines differ
      expect(a.finalScore).toBe(b.finalScore)
      // At least totalFrames or event count should differ
      const differs =
        a.totalFrames !== b.totalFrames ||
        a.events.length !== b.events.length
      expect(differs).toBe(true)
    })
  })

  describe('inflection points', () => {
    it('records inflections for formations', () => {
      const output = simulate(SIMPLE_GRID, 'inflection-seed', makeConfig())
      const allTimelines = output.getAllInflections()

      // Should have a formation timeline
      const formationTimeline = allTimelines.get('formation-0')
      expect(formationTimeline).toBeDefined()
      expect(formationTimeline!.entityType).toBe('formation')
      expect(formationTimeline!.inflections.length).toBeGreaterThan(0)

      // Should have spawn inflection
      const spawn = formationTimeline!.inflections.find(
        (p) => p.type === 'spawn',
      )
      expect(spawn).toBeDefined()
    })

    it('records inflections for ship', () => {
      const output = simulate(SIMPLE_GRID, 'ship-seed', makeConfig())
      const shipTimeline = output.getAllInflections().get('ship')

      expect(shipTimeline).toBeDefined()
      expect(shipTimeline!.entityType).toBe('ship')
      expect(shipTimeline!.inflections.length).toBeGreaterThan(0)
    })

    it('records inflections for invaders (spawn + destroy)', () => {
      const output = simulate(SIMPLE_GRID, 'inv-seed', makeConfig())
      const allTimelines = output.getAllInflections()

      // Find an invader timeline
      const invTimelines = [...allTimelines.values()].filter(
        (t) => t.entityType === 'invader',
      )
      expect(invTimelines.length).toBeGreaterThan(0)

      // Each invader should have spawn and destroy
      for (const tl of invTimelines) {
        const types = tl.inflections.map((p) => p.type)
        expect(types).toContain('spawn')
        expect(types).toContain('destroy')
      }
    })

    it('getInflections returns correct points for a specific entity', () => {
      const output = simulate(SIMPLE_GRID, 'get-seed', makeConfig())
      const allTimelines = output.getAllInflections()
      const firstEntry = [...allTimelines.entries()][0]!

      const points = output.getInflections(firstEntry[0])
      expect(points).toEqual(firstEntry[1].inflections)
    })
  })

  describe('peek', () => {
    it('reconstructs GameState at a given frame', () => {
      const output = simulate(SIMPLE_GRID, 'peek-seed', makeConfig())
      const state = output.peek(0)

      expect(state.frame).toBe(0)
      expect(state.score).toBeGreaterThanOrEqual(0)
      expect(state.ship).toBeDefined()
      expect(state.lasers).toBeInstanceOf(Array)
      expect(state.formations).toBeInstanceOf(Array)
    })

    it('state progresses over time', () => {
      const output = simulate(SIMPLE_GRID, 'progress-seed', makeConfig())
      const mid = Math.floor(output.totalFrames / 2)

      const early = output.peek(0)
      const late = output.peek(mid)

      // Score should increase over time
      expect(late.score).toBeGreaterThanOrEqual(early.score)
    })

    it('final frame has all invaders destroyed', () => {
      const output = simulate(SIMPLE_GRID, 'final-seed', makeConfig())
      const final = output.peek(output.totalFrames - 1)

      expect(final.score).toBe(output.finalScore)
    })
  })
})
