import type { Grid } from './types.js'

export interface HighScoreEntry {
  date: string // ISO date of the window's end day
  score: number // total commits in the window
  rank: number // 1-indexed
  isCurrent: boolean // true if this is the current render's day
}

export interface ScoreboardResult {
  entries: HighScoreEntry[]
  isNewHighScore: boolean // current day appears on the board
  currentDayScore: number
  currentDayDate: string
  windowSize: number // days in each window
  minDistance: number // minimum days between entries
}

/**
 * Compute the high score board from contribution data.
 *
 * Algorithm:
 * 1. For each day, compute total commits in a trailing window of `windowSize` days
 * 2. Sort all windows by score descending
 * 3. Filter with increasing distance threshold until we have exactly 10
 *    (or fewer if not enough data)
 * 4. Check if current day's score is on the board
 */
export function computeScoreboard(
  grid: Grid,
  currentDate: string, // ISO date of the current render
  windowSize: number = 364, // default: 52 weeks
  maxEntries: number = 10,
): ScoreboardResult {
  // Build a date→commits map from the grid
  const commitsByDate = new Map<string, number>()
  for (const cell of grid.cells) {
    commitsByDate.set(cell.date, (commitsByDate.get(cell.date) ?? 0) + cell.count)
  }

  // Get all dates sorted chronologically
  const allDates = [...commitsByDate.keys()].sort()
  if (allDates.length === 0) {
    return {
      entries: [],
      isNewHighScore: false,
      currentDayScore: 0,
      currentDayDate: currentDate,
      windowSize,
      minDistance: 0,
    }
  }

  // Compute prefix sums for efficient window scoring
  // Map dates to indices for arithmetic
  const dateToIndex = new Map<string, number>()
  const indexToDate = new Map<number, string>()
  const dailyCounts: number[] = []

  for (let i = 0; i < allDates.length; i++) {
    const d = allDates[i]!
    dateToIndex.set(d, i)
    indexToDate.set(i, d)
    dailyCounts.push(commitsByDate.get(d) ?? 0)
  }

  // Prefix sum
  const prefix: number[] = new Array(dailyCounts.length + 1).fill(0) as number[]
  for (let i = 0; i < dailyCounts.length; i++) {
    prefix[i + 1] = prefix[i]! + dailyCounts[i]!
  }

  // Compute window score for each day (window ends on this day, goes back windowSize days)
  interface WindowRecord {
    endIndex: number
    date: string
    score: number
  }

  const records: WindowRecord[] = []
  for (let i = 0; i < allDates.length; i++) {
    const startIdx = Math.max(0, i - windowSize + 1)
    const score = prefix[i + 1]! - prefix[startIdx]!
    records.push({
      endIndex: i,
      date: allDates[i]!,
      score,
    })
  }

  // Sort by score descending
  records.sort((a, b) => b.score - a.score)

  // Current day score
  const currentIdx = dateToIndex.get(currentDate)
  let currentDayScore = 0
  if (currentIdx !== undefined) {
    const startIdx = Math.max(0, currentIdx - windowSize + 1)
    currentDayScore = prefix[currentIdx + 1]! - prefix[startIdx]!
  }

  // Distance filtering: increase minDistance until we'd drop below maxEntries
  let bestEntries: WindowRecord[] = []
  let bestDistance = 0

  for (let dist = 0; dist <= allDates.length; dist++) {
    const filtered = filterByDistance(records, dist)

    if (filtered.length >= maxEntries) {
      bestEntries = filtered.slice(0, maxEntries)
      bestDistance = dist
    } else {
      // Increasing distance dropped us below maxEntries — use previous best
      // If we never had enough, use what we have
      if (bestEntries.length === 0) {
        bestEntries = filtered.slice(0, maxEntries)
        bestDistance = dist
      }
      break
    }
  }

  // Check if current day is on the board
  const isNewHighScore = bestEntries.some((e) => e.date === currentDate)

  const entries: HighScoreEntry[] = bestEntries.map((e, i) => ({
    date: e.date,
    score: e.score,
    rank: i + 1,
    isCurrent: e.date === currentDate,
  }))

  return {
    entries,
    isNewHighScore,
    currentDayScore,
    currentDayDate: currentDate,
    windowSize,
    minDistance: bestDistance,
  }
}

/**
 * Filter records by minimum distance between entries.
 * Takes the highest-scoring records that are at least `minDist` days apart.
 */
function filterByDistance(
  sortedRecords: Array<{ endIndex: number; score: number }>,
  minDist: number,
): Array<{ endIndex: number; date: string; score: number }> {
  const result: Array<{ endIndex: number; date: string; score: number }> = []
  const usedIndices: number[] = []

  for (const rec of sortedRecords) {
    const r = rec as { endIndex: number; date: string; score: number }
    const tooClose = usedIndices.some(
      (idx) => Math.abs(r.endIndex - idx) < minDist,
    )
    if (!tooClose) {
      result.push(r)
      usedIndices.push(r.endIndex)
    }
  }

  return result
}
