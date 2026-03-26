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
 * Algorithm (single pass + heap):
 * 1. For each day, compute window score (trailing windowSize days via prefix sums)
 * 2. Inline: push non-zero records into max-heap, build run map (consecutive
 *    same-score indices → shared Set for fast consumption)
 * 3. Drain heap → score-descending array
 * 4. Binary search for max distance that yields >= maxEntries, using run-aware
 *    distance filter (selecting a date consumes its entire run)
 * 5. Check if current day's score is on the board
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

  // Single pass: compute window scores, build run map, and push non-zero
  // records into a max-heap (by score). This avoids a separate filter + sort.
  const heap: WindowRecord[] = []
  const runMap = new Map<number, Set<number>>()
  let currentRun: Set<number> | null = null
  let currentRunScore = -1

  for (let i = 0; i < allDates.length; i++) {
    const startIdx = Math.max(0, i - windowSize + 1)
    const score = prefix[i + 1]! - prefix[startIdx]!

    // Track consecutive same-score runs
    if (score === currentRunScore && currentRun) {
      currentRun.add(i)
      runMap.set(i, currentRun)
    } else {
      currentRun = new Set([i])
      currentRunScore = score
      runMap.set(i, currentRun)
    }

    // Push non-zero records into max-heap
    if (score > 0) {
      heapPush(heap, { endIndex: i, date: allDates[i]!, score })
    }
  }

  // Drain heap into score-descending array for binary search passes
  const records: WindowRecord[] = []
  while (heap.length > 0) {
    records.push(heapPop(heap)!)
  }

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
    const count = filterByDistance(records, mid, runMap, maxEntries).length
    if (count >= maxEntries) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  const bestDistance = lo
  const bestFiltered = filterByDistance(records, bestDistance, runMap, maxEntries)
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
 * Filter records by minimum distance between entries, with run-aware consumption.
 * Takes the highest-scoring records that are at least `minDist` days apart.
 * When a date is selected, all dates in its consecutive same-score run are
 * consumed (via the shared Set in runMap), preventing redundant selection.
 *
 * Uses a sorted array of used indices for O(log K) proximity checks per record.
 * Early-exits when `needed` entries found.
 */
function filterByDistance(
  sortedRecords: Array<{ endIndex: number; score: number }>,
  minDist: number,
  runMap: Map<number, Set<number>>,
  needed: number = Infinity,
): Array<{ endIndex: number; date: string; score: number }> {
  const result: Array<{ endIndex: number; date: string; score: number }> = []
  // Keep used indices sorted for binary search proximity check
  const used: number[] = []
  const consumed = new Set<number>()

  for (const rec of sortedRecords) {
    if (result.length >= needed) break

    const r = rec as { endIndex: number; date: string; score: number }

    // Skip if already consumed by a previous selection's run
    if (consumed.has(r.endIndex)) continue

    if (minDist <= 0 || used.length === 0) {
      result.push(r)
      insertSorted(used, r.endIndex)
      consumeRun(r.endIndex, runMap, consumed)
      continue
    }

    // Binary search for nearest used index
    if (!isTooClose(used, r.endIndex, minDist)) {
      result.push(r)
      insertSorted(used, r.endIndex)
      consumeRun(r.endIndex, runMap, consumed)
    }
  }

  return result
}

/** Mark all indices in the same consecutive run as consumed. */
function consumeRun(index: number, runMap: Map<number, Set<number>>, consumed: Set<number>): void {
  const run = runMap.get(index)
  if (run) {
    for (const idx of run) {
      consumed.add(idx)
    }
  }
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

// ── Max-heap by score ──

interface HeapItem { score: number }

function heapPush<T extends HeapItem>(heap: T[], item: T): void {
  heap.push(item)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >>> 1
    if (heap[parent]!.score >= heap[i]!.score) break
    ;[heap[parent], heap[i]] = [heap[i]!, heap[parent]!]
    i = parent
  }
}

function heapPop<T extends HeapItem>(heap: T[]): T | undefined {
  if (heap.length === 0) return undefined
  const top = heap[0]!
  const last = heap.pop()!
  if (heap.length > 0) {
    heap[0] = last
    let i = 0
    while (true) {
      let largest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < heap.length && heap[left]!.score > heap[largest]!.score) largest = left
      if (right < heap.length && heap[right]!.score > heap[largest]!.score) largest = right
      if (largest === i) break
      ;[heap[i], heap[largest]] = [heap[largest]!, heap[i]!]
      i = largest
    }
  }
  return top
}
