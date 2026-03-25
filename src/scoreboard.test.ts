import { describe, it, expect } from 'vitest'
import { computeScoreboard } from './scoreboard.js'
import type { Grid, ContributionCell } from './types.js'

function makeCell(
  x: number,
  y: number,
  date: string,
  count: number,
): ContributionCell {
  const level = count === 0 ? 0 : count < 5 ? 1 : count < 10 ? 2 : count < 15 ? 3 : 4
  return { x, y, level: level as 0 | 1 | 2 | 3 | 4, date, count }
}

function makeGrid(cells: ContributionCell[]): Grid {
  const maxX = cells.reduce((m, c) => Math.max(m, c.x), 0)
  return { width: maxX + 1, height: 7, cells }
}

// Helper: generate a year of daily cells with varying counts
function makeYearGrid(dailyCounts: number[]): Grid {
  const cells: ContributionCell[] = []
  const startDate = new Date('2025-01-01')
  for (let i = 0; i < dailyCounts.length; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const date = d.toISOString().slice(0, 10)
    const week = Math.floor(i / 7)
    const day = i % 7
    cells.push(makeCell(week, day, date, dailyCounts[i]!))
  }
  const maxX = cells.reduce((m, c) => Math.max(m, c.x), 0)
  return { width: maxX + 1, height: 7, cells }
}

describe('computeScoreboard', () => {
  it('returns empty for empty grid', () => {
    const grid = makeGrid([])
    const result = computeScoreboard(grid, '2025-06-01')
    expect(result.entries).toHaveLength(0)
    expect(result.isNewHighScore).toBe(false)
  })

  it('returns entries sorted by score descending', () => {
    // 30 days with varying activity
    const counts = Array.from({ length: 30 }, (_, i) => (i % 7 === 0 ? 20 : i % 3 === 0 ? 10 : 2))
    const grid = makeYearGrid(counts)
    const result = computeScoreboard(grid, '2025-01-30', 7, 5)

    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.entries.length).toBeLessThanOrEqual(5)

    // Scores should be in descending order
    for (let i = 1; i < result.entries.length; i++) {
      expect(result.entries[i]!.score).toBeLessThanOrEqual(result.entries[i - 1]!.score)
    }
  })

  it('ranks entries 1 through N', () => {
    const counts = Array.from({ length: 60 }, (_, i) => i + 1)
    const grid = makeYearGrid(counts)
    const result = computeScoreboard(grid, '2025-03-01', 7, 5)

    for (let i = 0; i < result.entries.length; i++) {
      expect(result.entries[i]!.rank).toBe(i + 1)
    }
  })

  it('detects new high score when current date is on the board', () => {
    // Make the last day have a huge spike
    const counts = Array.from({ length: 30 }, () => 1)
    counts[29] = 100 // last day is massive
    const grid = makeYearGrid(counts)
    const result = computeScoreboard(grid, '2025-01-30', 7, 10)

    // The window ending on day 29 should have the highest score
    expect(result.isNewHighScore).toBe(true)
    const current = result.entries.find((e) => e.isCurrent)
    expect(current).toBeDefined()
    expect(current!.isCurrent).toBe(true)
  })

  it('does not flag new high score when current date is not on the board', () => {
    // Current date has low activity, earlier dates have high activity
    const counts = Array.from({ length: 60 }, (_, i) => (i < 30 ? 50 : 1))
    const grid = makeYearGrid(counts)
    const result = computeScoreboard(grid, '2025-03-01', 7, 10)

    // Current day is in the low-activity period
    expect(result.isNewHighScore).toBe(false)
  })

  it('respects distance filtering — entries are spaced apart', () => {
    // 100 days, spike every 3 days
    const counts = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? 50 : 1))
    const grid = makeYearGrid(counts)
    const result = computeScoreboard(grid, '2025-04-10', 7, 10)

    // With distance filtering, entries should not be adjacent
    if (result.minDistance > 0 && result.entries.length > 1) {
      const dates = result.entries.map((e) => e.date).sort()
      for (let i = 1; i < dates.length; i++) {
        const d1 = new Date(dates[i - 1]!)
        const d2 = new Date(dates[i]!)
        const daysBetween = Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
        expect(daysBetween).toBeGreaterThanOrEqual(result.minDistance)
      }
    }
  })

  it('handles small grids with fewer than 10 possible entries', () => {
    const counts = [5, 10, 3]
    const grid = makeYearGrid(counts)
    const result = computeScoreboard(grid, '2025-01-03', 2, 10)

    expect(result.entries.length).toBeLessThanOrEqual(3)
    expect(result.entries.length).toBeGreaterThan(0)
  })

  it('currentDayScore reflects the window ending on currentDate', () => {
    const counts = [10, 20, 30, 40, 50]
    const grid = makeYearGrid(counts)
    // Window of 3 ending on day 4 (index 3): days 2,3,4 = 30+40+50 = 120... wait
    // Actually index 3 = '2025-01-04', window of 3 = days 2,3,4 → counts[1]+[2]+[3] = 20+30+40 = 90
    const result = computeScoreboard(grid, '2025-01-04', 3, 10)
    expect(result.currentDayScore).toBe(90)
  })
})
