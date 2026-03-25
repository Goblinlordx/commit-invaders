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

  // Distance filtering via binary search — O(N log N) total
  // filterByDistance is monotonic: more distance → fewer or equal entries
  // Binary search for max distance that yields >= maxEntries
  let lo = 0
  let hi = allDates.length

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const count = filterByDistance(records, mid, maxEntries).length
    if (count >= maxEntries) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  const bestDistance = lo
  const bestFiltered = filterByDistance(records, bestDistance, maxEntries)
  const bestEntries = bestFiltered.slice(0, maxEntries)

  // The current date's score may match the top entry but get distance-filtered out.
  // If the #1 entry has the same score as the current window, treat it as "current".
  const topScore = bestEntries.length > 0 ? bestEntries[0]!.score : 0
  const isNewHighScore = currentDayScore > 0 && currentDayScore >= topScore

  let currentMarked = false
  const entries: HighScoreEntry[] = bestEntries.map((e, i) => {
    // Mark the first entry whose score matches the current window score as "current"
    const isCurrent = !currentMarked && e.score === currentDayScore && currentDayScore > 0
    if (isCurrent) currentMarked = true
    return {
      date: e.date,
      score: e.score,
      rank: i + 1,
      isCurrent,
    }
  })

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
 * Uses a sorted set of used indices for O(log K) proximity checks per record,
 * where K = number of accepted entries. Early-exits when `needed` entries found.
 *
 * Total: O(N log K) per call, called O(log N) times = O(N log N log K) overall.
 */
function filterByDistance(
  sortedRecords: Array<{ endIndex: number; score: number }>,
  minDist: number,
  needed: number = Infinity,
): Array<{ endIndex: number; date: string; score: number }> {
  const result: Array<{ endIndex: number; date: string; score: number }> = []
  // Keep used indices sorted for binary search proximity check
  const used: number[] = []

  for (const rec of sortedRecords) {
    if (result.length >= needed) break

    const r = rec as { endIndex: number; date: string; score: number }

    if (minDist <= 0 || used.length === 0) {
      result.push(r)
      insertSorted(used, r.endIndex)
      continue
    }

    // Binary search for nearest used index
    if (!isTooClose(used, r.endIndex, minDist)) {
      result.push(r)
      insertSorted(used, r.endIndex)
    }
  }

  return result
}

/** Insert value into a sorted array maintaining sort order. */
function insertSorted(arr: number[], val: number): void {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid]! < val) lo = mid + 1
    else hi = mid
  }
  arr.splice(lo, 0, val)
}

/** Check if val is within minDist of any value in sorted array. O(log N). */
function isTooClose(sorted: number[], val: number, minDist: number): boolean {
  if (sorted.length === 0) return false

  // Find insertion point
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid]! < val) lo = mid + 1
    else hi = mid
  }

  // Check neighbors
  if (lo < sorted.length && Math.abs(sorted[lo]! - val) < minDist) return true
  if (lo > 0 && Math.abs(sorted[lo - 1]! - val) < minDist) return true
  return false
}
