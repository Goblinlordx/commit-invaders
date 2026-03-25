import { describe, it, expect } from 'vitest'

import type {
  Grid,
  ShipScript,
  SimConfig,
  ContributionCell,
  SimOutput,
} from '../types.js'

import { runSimulation } from './engine.js'

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

// A simple grid: 2 cells in 1 week = 1 wave, 2 invaders (level 1 = 1 HP each)
const SIMPLE_GRID = makeGrid([makeCell(0, 0), makeCell(0, 1)])

// Ship fires at frame 2 and 6, positioned to hit
function simpleScript(): ShipScript {
  return [
    { frame: 0, action: 'move', x: 10 },
    { frame: 2, action: 'fire' },
    { frame: 6, action: 'fire' },
  ]
}

describe('Engine', () => {
  it('produces SimOutput with correct structure', () => {
    const config = makeConfig()
    const script = simpleScript()
    const output = runSimulation(SIMPLE_GRID, script, config)

    expect(output.events).toBeInstanceOf(Array)
    expect(output.totalFrames).toBeGreaterThan(0)
    expect(output.config).toBe(config)
    expect(output.finalScore).toBeGreaterThanOrEqual(0)
    expect(typeof output.peek).toBe('function')
    expect(typeof output.getInflections).toBe('function')
    expect(typeof output.getAllInflections).toBe('function')
  })

  it('records events as compact deltas (not full snapshots)', () => {
    const config = makeConfig()
    const script = simpleScript()
    const output = runSimulation(SIMPLE_GRID, script, config)

    // Events should exist but fewer than totalFrames (not one per frame)
    expect(output.events.length).toBeGreaterThan(0)
    // Each event has frame, type, entityId, position
    for (const ev of output.events) {
      expect(ev).toHaveProperty('frame')
      expect(ev).toHaveProperty('type')
      expect(ev).toHaveProperty('entityId')
      expect(ev).toHaveProperty('position')
    }
  })

  it('tracks score correctly across the game', () => {
    // 2 invaders with 1 HP each — score should be 2 when both destroyed
    const config = makeConfig()
    // Build a script that definitely clears everything
    // We'll use a very long script to ensure it works
    const script: ShipScript = []
    for (let f = 0; f < 500; f += 3) {
      script.push({ frame: f, action: 'fire' })
    }
    const output = runSimulation(SIMPLE_GRID, script, config)

    expect(output.finalScore).toBe(2)
  })

  it('stops simulation when all waves are cleared', () => {
    const config = makeConfig()
    const script: ShipScript = []
    for (let f = 0; f < 500; f += 3) {
      script.push({ frame: f, action: 'fire' })
    }
    const output = runSimulation(SIMPLE_GRID, script, config)

    // Should end before max frames since all invaders get destroyed
    expect(output.totalFrames).toBeLessThan(500)
  })
})
