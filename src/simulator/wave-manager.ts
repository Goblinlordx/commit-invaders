import type {
  ContributionCell,
  ContributionLevel,
  Grid,
  WaveConfig,
} from '../types.js'

export interface WaveCell {
  cell: ContributionCell
  hp: number
}

export interface Wave {
  waveIndex: number
  cells: WaveCell[]
}

export interface WaveManager {
  totalWaves: number
  getWave(index: number): Wave
  trySpawnNext(currentFrame: number): Wave | null
  markCleared(waveIndex: number, frame: number): void
}

function hpFromLevel(level: ContributionLevel): number {
  if (level <= 2) return 1
  if (level === 3) return 2
  return 3 // level 4
}

export function createWaveManager(grid: Grid, config: WaveConfig): WaveManager {
  // Group cells by column, filtering out level=0
  const columnMap = new Map<number, ContributionCell[]>()
  for (const cell of grid.cells) {
    if (cell.level === 0) continue
    let col = columnMap.get(cell.x)
    if (!col) {
      col = []
      columnMap.set(cell.x, col)
    }
    col.push(cell)
  }

  // Sort columns left-to-right
  const sortedColumns = [...columnMap.keys()].sort((a, b) => a - b)

  // Group columns into waves by weeksPerWave
  const waves: Wave[] = []
  for (let i = 0; i < sortedColumns.length; i += config.weeksPerWave) {
    const waveCells: WaveCell[] = []
    const end = Math.min(i + config.weeksPerWave, sortedColumns.length)
    for (let j = i; j < end; j++) {
      const colIndex = sortedColumns[j]!
      const cells = columnMap.get(colIndex)!
      for (const cell of cells) {
        waveCells.push({ cell, hp: hpFromLevel(cell.level) })
      }
    }
    if (waveCells.length > 0) {
      waves.push({ waveIndex: waves.length, cells: waveCells })
    }
  }

  let nextWaveIndex = 0
  let lastClearedWave = -1
  let lastClearedFrame: number | null = null

  return {
    get totalWaves() {
      return waves.length
    },

    getWave(index: number): Wave {
      return waves[index]!
    },

    trySpawnNext(currentFrame: number): Wave | null {
      if (nextWaveIndex >= waves.length) return null

      // First wave spawns immediately
      if (nextWaveIndex === 0) {
        return waves[nextWaveIndex++]!
      }

      // Subsequent waves require the PREVIOUS wave to be cleared + delay
      if (lastClearedWave < nextWaveIndex - 1) return null
      if (lastClearedFrame === null) return null
      if (currentFrame < lastClearedFrame + config.spawnDelay) return null

      return waves[nextWaveIndex++]!
    },

    markCleared(waveIndex: number, frame: number): void {
      if (waveIndex > lastClearedWave) {
        lastClearedWave = waveIndex
        lastClearedFrame = frame
      }
    },
  }
}
