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

// ── Run Tracker ──
// Tracks consecutive same-score runs using flat typed arrays.
// Accepts dates as input — maps to internal indices automatically.
// When a date is selected, its entire run is consumed in one call.

class RunTracker {
  private readonly dateToIndex: Map<string, number>
  private readonly runStart: Int32Array
  private readonly runEnd: Int32Array
  private consumed: Uint8Array

  constructor(dates: string[], scores: Int32Array) {
    const N = dates.length
    this.dateToIndex = new Map()
    for (let i = 0; i < N; i++) this.dateToIndex.set(dates[i]!, i)

    this.runStart = new Int32Array(N)
    this.runEnd = new Int32Array(N)
    this.consumed = new Uint8Array(N)

    this.runStart[0] = 0
    for (let i = 1; i < N; i++) {
      this.runStart[i] = scores[i] === scores[i - 1] ? this.runStart[i - 1]! : i
    }

    this.runEnd[N - 1] = N - 1
    for (let i = N - 2; i >= 0; i--) {
      this.runEnd[i] = scores[i] === scores[i + 1] ? this.runEnd[i + 1]! : i
    }
  }

  /** Check if a date has already been consumed. */
  has(date: string): boolean {
    const i = this.dateToIndex.get(date)
    return i !== undefined && this.consumed[i] === 1
  }

  /** Consume a date and all dates in its consecutive same-score run. */
  set(date: string): void {
    const i = this.dateToIndex.get(date)
    if (i === undefined) return
    const start = this.runStart[i]!
    const end = this.runEnd[i]!
    for (let j = start; j <= end; j++) this.consumed[j] = 1
  }

  /** Reset consumed state for reuse across binary search iterations. */
  reset(): void {
    this.consumed = new Uint8Array(this.consumed.length)
  }
}

// ── Scoreboard ──

interface WindowRecord {
  endIndex: number
  date: string
  score: number
}

/**
 * Compute the high score board from contribution data.
 *
 * Algorithm:
 * 1. For each day, compute window score (trailing windowSize days via prefix sums)
 * 2. Build RunTracker from scores (consecutive same-score run boundaries)
 * 3. Exclude score-0 windows, sort descending
 * 4. Binary search for max distance that yields >= maxEntries, using run-aware
 *    distance filter (selecting a date consumes its entire run)
 * 5. Check if current day's score is on the board
 */
export function computeScoreboard(
  grid: Grid,
  currentDate: string,
  windowSize: number = 364,
  maxEntries: number = 10,
): ScoreboardResult {
  const commitsByDate = new Map<string, number>()
  for (const cell of grid.cells) {
    commitsByDate.set(cell.date, (commitsByDate.get(cell.date) ?? 0) + cell.count)
  }

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

  // Prefix sums for O(1) window scoring
  const dateToIndex = new Map<string, number>()
  const dailyCounts: number[] = []
  for (let i = 0; i < allDates.length; i++) {
    dateToIndex.set(allDates[i]!, i)
    dailyCounts.push(commitsByDate.get(allDates[i]!) ?? 0)
  }

  const prefix: number[] = new Array(dailyCounts.length + 1).fill(0) as number[]
  for (let i = 0; i < dailyCounts.length; i++) {
    prefix[i + 1] = prefix[i]! + dailyCounts[i]!
  }

  // Compute window scores
  const N = allDates.length
  const scores = new Int32Array(N)
  for (let i = 0; i < N; i++) {
    const startIdx = Math.max(0, i - windowSize + 1)
    scores[i] = prefix[i + 1]! - prefix[startIdx]!
  }

  const runs = new RunTracker(allDates, scores)

  // Collect non-zero records and sort descending
  const records: WindowRecord[] = []
  for (let i = 0; i < N; i++) {
    if (scores[i]! > 0) {
      records.push({ endIndex: i, date: allDates[i]!, score: scores[i]! })
    }
  }
  records.sort((a, b) => b.score - a.score)

  // Current day score
  const currentIdx = dateToIndex.get(currentDate)
  let currentDayScore = 0
  if (currentIdx !== undefined) {
    const startIdx = Math.max(0, currentIdx - windowSize + 1)
    currentDayScore = prefix[currentIdx + 1]! - prefix[startIdx]!
  }

  // Binary search for max distance that yields >= maxEntries
  let lo = 0
  let hi = N

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const count = filterByDistance(records, mid, runs, maxEntries).length
    if (count >= maxEntries) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  const bestDistance = lo
  const bestFiltered = filterByDistance(records, bestDistance, runs, maxEntries)
  const bestEntries = bestFiltered.slice(0, maxEntries)

  const topScore = bestEntries.length > 0 ? bestEntries[0]!.score : 0
  const isNewHighScore = currentDayScore > 0 && currentDayScore >= topScore

  let currentMarked = false
  const entries: HighScoreEntry[] = bestEntries.map((e, i) => {
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
 * Filter records by minimum distance, with run-aware consumption.
 * When a date is selected, its entire consecutive same-score run is consumed
 * via the RunTracker, preventing redundant selection of neighbouring dates.
 */
function filterByDistance(
  sortedRecords: WindowRecord[],
  minDist: number,
  runs: RunTracker,
  needed: number,
): WindowRecord[] {
  runs.reset()
  const result: WindowRecord[] = []
  const used: number[] = []

  for (const r of sortedRecords) {
    if (result.length >= needed) break
    if (runs.has(r.date)) continue

    if (minDist <= 0 || used.length === 0 || !isTooClose(used, r.endIndex, minDist)) {
      result.push(r)
      insertSorted(used, r.endIndex)
      runs.set(r.date)
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

  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid]! < val) lo = mid + 1
    else hi = mid
  }

  if (lo < sorted.length && Math.abs(sorted[lo]! - val) < minDist) return true
  if (lo > 0 && Math.abs(sorted[lo - 1]! - val) < minDist) return true
  return false
}
