import { describe, it, expect } from 'vitest'

import { createWaveManager } from './wave-manager.js'
import type {
  ContributionCell,
  ContributionLevel,
  Grid,
  WaveConfig,
} from '../types.js'

function makeCell(
  x: number,
  y: number,
  level: ContributionLevel,
): ContributionCell {
  return {
    x,
    y,
    level,
    date: `2026-01-${String(x * 7 + y + 1).padStart(2, '0')}`,
    count: level,
  }
}

function makeGrid(cells: ContributionCell[], width: number): Grid {
  return { width, height: 7, cells }
}

const defaultConfig: WaveConfig = {
  weeksPerWave: 1,
  startDelay: 0,
  spawnDelay: 30,
  brightenDuration: 0,
  pluckDuration: 0,
  darkenDuration: 0,
  travelDuration: 0,
  hatchDuration: 0,
  endingFadeoutDuration: 0,
  endingScoreDuration: 0,
  endingScoreOutDuration: 0,
  endingBoardInDuration: 0,
  endingHoldDuration: 0,
  endingBlackoutDuration: 0,
  endingResetDuration: 0,
}

describe('WaveManager', () => {
  describe('column grouping', () => {
    it('groups cells by column into separate waves with weeksPerWave=1', () => {
      const cells = [
        makeCell(0, 0, 2),
        makeCell(0, 1, 1),
        makeCell(1, 0, 3),
        makeCell(2, 0, 4),
      ]
      const grid = makeGrid(cells, 3)
      const wm = createWaveManager(grid, defaultConfig)

      expect(wm.totalWaves).toBe(3)
      expect(wm.getWave(0).cells).toHaveLength(2)
      expect(wm.getWave(1).cells).toHaveLength(1)
      expect(wm.getWave(2).cells).toHaveLength(1)
    })

    it('groups multiple columns per wave with weeksPerWave=2', () => {
      const cells = [
        makeCell(0, 0, 1),
        makeCell(1, 0, 2),
        makeCell(2, 0, 3),
        makeCell(3, 0, 4),
      ]
      const grid = makeGrid(cells, 4)
      const wm = createWaveManager(grid, { ...defaultConfig, weeksPerWave: 2 })

      expect(wm.totalWaves).toBe(2)
      expect(wm.getWave(0).cells).toHaveLength(2)
      expect(wm.getWave(1).cells).toHaveLength(2)
    })

    it('handles uneven column counts with weeksPerWave=3', () => {
      const cells = [
        makeCell(0, 0, 1),
        makeCell(1, 0, 2),
        makeCell(2, 0, 3),
        makeCell(3, 0, 4),
      ]
      const grid = makeGrid(cells, 4)
      const wm = createWaveManager(grid, { ...defaultConfig, weeksPerWave: 3 })

      // 4 columns / 3 per wave = 2 waves (3 + 1)
      expect(wm.totalWaves).toBe(2)
      expect(wm.getWave(0).cells).toHaveLength(3)
      expect(wm.getWave(1).cells).toHaveLength(1)
    })
  })

  describe('wave ordering', () => {
    it('orders waves left-to-right by column index', () => {
      const cells = [
        makeCell(2, 0, 1),
        makeCell(0, 0, 3),
        makeCell(1, 0, 2),
      ]
      const grid = makeGrid(cells, 3)
      const wm = createWaveManager(grid, defaultConfig)

      // First wave should be column 0
      expect(wm.getWave(0).cells[0]!.cell.x).toBe(0)
      // Second wave should be column 1
      expect(wm.getWave(1).cells[0]!.cell.x).toBe(1)
      // Third wave should be column 2
      expect(wm.getWave(2).cells[0]!.cell.x).toBe(2)
    })
  })

  describe('level-0 filtering', () => {
    it('excludes cells with level=0', () => {
      const cells = [
        makeCell(0, 0, 0),
        makeCell(0, 1, 2),
        makeCell(0, 2, 0),
        makeCell(0, 3, 1),
      ]
      const grid = makeGrid(cells, 1)
      const wm = createWaveManager(grid, defaultConfig)

      expect(wm.totalWaves).toBe(1)
      expect(wm.getWave(0).cells).toHaveLength(2)
    })

    it('skips columns that are entirely level=0', () => {
      const cells = [
        makeCell(0, 0, 0),
        makeCell(0, 1, 0),
        makeCell(1, 0, 3),
      ]
      const grid = makeGrid(cells, 2)
      const wm = createWaveManager(grid, defaultConfig)

      // Column 0 is all zeros → skipped, only column 1 remains
      expect(wm.totalWaves).toBe(1)
      expect(wm.getWave(0).cells[0]!.cell.x).toBe(1)
    })

    it('produces zero waves when all cells are level=0', () => {
      const cells = [
        makeCell(0, 0, 0),
        makeCell(1, 0, 0),
      ]
      const grid = makeGrid(cells, 2)
      const wm = createWaveManager(grid, defaultConfig)

      expect(wm.totalWaves).toBe(0)
    })
  })

  describe('spawn delay timing', () => {
    it('spawns the first wave immediately', () => {
      const cells = [makeCell(0, 0, 2), makeCell(1, 0, 1)]
      const grid = makeGrid(cells, 2)
      const wm = createWaveManager(grid, defaultConfig)

      const result = wm.trySpawnNext(0)
      expect(result).not.toBeNull()
      expect(result!.waveIndex).toBe(0)
    })

    it('does not spawn next wave before delay elapses', () => {
      const cells = [makeCell(0, 0, 2), makeCell(1, 0, 1)]
      const grid = makeGrid(cells, 2)
      const wm = createWaveManager(grid, defaultConfig)

      // Spawn first wave
      wm.trySpawnNext(0)
      // Clear it
      wm.markCleared(0, 10)

      // Try spawning next immediately — should fail
      const next = wm.trySpawnNext(11)
      expect(next).toBeNull()
    })

    it('spawns next wave after delay elapses from clear', () => {
      const cells = [makeCell(0, 0, 2), makeCell(1, 0, 1)]
      const grid = makeGrid(cells, 2)
      const wm = createWaveManager(grid, defaultConfig)

      wm.trySpawnNext(0) // spawn wave 0
      wm.markCleared(0, 10) // cleared at frame 10

      // frame 10 + 30 = 40, so frame 40 should work
      const next = wm.trySpawnNext(40)
      expect(next).not.toBeNull()
      expect(next!.waveIndex).toBe(1)
    })

    it('does not spawn beyond total waves', () => {
      const cells = [makeCell(0, 0, 2)]
      const grid = makeGrid(cells, 1)
      const wm = createWaveManager(grid, defaultConfig)

      wm.trySpawnNext(0) // spawn wave 0
      wm.markCleared(0, 5)

      const next = wm.trySpawnNext(100)
      expect(next).toBeNull()
    })
  })

  describe('HP assignment', () => {
    it('assigns 1 HP to all invaders (one-hit kill)', () => {
      const cells = [
        makeCell(0, 0, 1),
        makeCell(0, 1, 2),
        makeCell(0, 2, 3),
        makeCell(0, 3, 4),
      ]
      const grid = makeGrid(cells, 1)
      const wm = createWaveManager(grid, defaultConfig)

      const wave = wm.getWave(0)
      for (const wc of wave.cells) {
        expect(wc.hp).toBe(1)
      }
    })
  })
})
