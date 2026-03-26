# High Score Board

The high score board ranks the top 10 contribution windows from your GitHub history. It appears at the start of the animation (before gameplay) and highlights your current window if it qualifies.

Because the board is recomputed each time the animation is generated, **scores and dates on the board will shift over time**. As new contributions are added and old ones fall outside the 52-week windows, entries may appear, move, or drop off entirely. This is expected -- the board is designed to give a well-distributed snapshot of your most active contribution periods on GitHub, not a fixed historical record.

## Data Flow

```
GitHub GraphQL API  ──>  all contribution years (via contributionYears)
                              │
                              ▼
                     computeScoreboard()
                       (src/scoreboard.ts)
                              │
                              ▼
                      ScoreboardResult
                     { entries, isNewHighScore, ... }
                              │
                              ▼
                        composeSvg()
                  (src/animation/svg-compositor.ts)
                              │
                              ▼
                     Intro scoreboard overlay
                     + ending score display
```

1. **Fetch** -- The GitHub Action queries `contributionYears` to discover all years with data, then fetches them all concurrently (with exponential backoff retries).
2. **Score** -- `computeScoreboard()` computes the top 10 non-overlapping contribution windows.
3. **Render** -- The SVG compositor draws the scoreboard as an intro overlay and the final score as an ending display.

## Algorithm

### Step 1: Window Scores + Run Map + Max-Heap (single pass)

A single pass over all dates computes three things simultaneously:

1. **Window score** for each day: total commits in the trailing 364 days (52 weeks), computed in O(1) via a prefix sum array:

   ```
   score = prefix[day + 1] - prefix[day - windowSize + 1]
   ```

2. **Run map**: each date index maps to a shared `Set` of all indices in its consecutive same-score run. Adjacent days often share the same window score (the window shifts by one day, adding/removing the same 0-contribution day). The shared Set enables O(1) lookup and bulk consumption during filtering.

3. **Max-heap**: non-zero-score records are pushed into a binary max-heap keyed by score. Windows with score 0 are excluded -- no contributions in that period.

After the pass, the heap is drained into a score-descending array for the distance filter.

### Step 2: Distance Filtering via Binary Search

The sorted records often have many entries clustered around the same peak period. To produce a diverse top-10 list, the algorithm enforces a **minimum distance** (in days) between selected entries.

The optimal distance is found via **binary search**:

1. Binary search over candidate distances from 0 to N (total days)
2. For each candidate distance, greedily select the highest-scoring windows that are at least that many days apart
3. When a date is selected, **consume its entire run** via the run map -- all dates in the same consecutive same-score run are skipped for future candidates
4. Find the **largest** distance that still yields >= 10 entries

The greedy selection maintains a **sorted array** of already-chosen indices. For each candidate window, a binary search checks whether any previously selected window is within the minimum distance. O(log K) per proximity check, where K is the number of accepted entries (at most 10).

**Complexity: O(N log N)** -- heap drain dominates. Binary search runs O(log N) iterations, each filtering in O(N log K). Run consumption is amortized O(N) total since each index is consumed at most once.

### Current Day Detection

After filtering, the algorithm checks whether the current day's window score matches any entry on the board. If the current score ties or beats the #1 entry, `isNewHighScore` is set to `true`, and the first matching entry is marked as the current day's entry for highlighting.

## Score Formatting

Scores are displayed in compact form:

| Range | Format | Example |
|-------|--------|---------|
| < 10,000 | raw number | `4323` |
| 10,000 -- 99,999 | X.XXk | `12.34k` |
| 100,000 -- 999,999 | X.Xk | `123.4k` |
| >= 1,000,000 | X.XXM | `1.23M` |

## SVG Rendering

### Intro Scoreboard

The scoreboard appears at the very start of the animation, before gameplay begins, rendered on a black background:

- **Title**: "HIGH SCORES" (centered, monospace bold)
- **New high score banner**: If the current window ties or beats #1, a "NEW HIGH SCORE!" label appears below the title
- **Entries**: Displayed in 2 columns of 5 rows, each showing rank, date (YYYY-MM-DD), and score
- **Highlighting**: The current day's entry (if present) uses brighter colors and bold text

**Timing** (at 60 FPS):
- Fade in: 30 frames (0.5s)
- Hold: 300 frames (5s)
- Fade out: 30 frames (0.5s)

### Ending Score Display

After all waves are cleared, the ending sequence shows the final commit score:

1. **Ship fadeout** (60 frames) -- ship and lasers disappear
2. **Score display** (180 frames) -- "{N} COMMITS" fades in, holds with a subtle wiggle animation
3. **Score fade out** (30 frames)
4. **Blackout** (60 frames) -- fade to black
5. **Reset** (60 frames) -- fade back to the initial grid state, seamlessly looping

The score counter during gameplay also tracks commits in real-time in the status bar, updating as each invader is destroyed.

## Zero Contributions

When the grid has no active cells (all contribution levels are 0), the game runs normally with 0 waves. The ending sequence displays "0 COMMITS" and loops as usual.

## Configuration

### `--no-scoreboard` Flag

Pass `no_scoreboard: true` in the GitHub Action (or `--no-scoreboard` via npx) to disable the scoreboard entirely. This:

- Skips fetching historical contribution data (faster)
- Removes the intro scoreboard overlay
- Reduces the start delay from 480 frames (8s) to 90 frames (1.5s)
- The ending score display still shows the current run's commit total

### Timing Parameters

All timing values are in frames (default 60 FPS). These are configurable in `SimConfig.waveConfig`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `introScoreboardFadeIn` | 30 | Intro board fade-in duration |
| `introScoreboardHold` | 300 | Intro board visible duration |
| `introScoreboardFadeOut` | 30 | Intro board fade-out duration |
| `endingScoreDuration` | 180 | Final score display + hold |
| `endingScoreOutDuration` | 30 | Final score fade-out |
| `endingBlackoutDuration` | 60 | Fade to black |
| `endingResetDuration` | 60 | Fade back to initial state |

## Source Files

| File | Role |
|------|------|
| `src/scoreboard.ts` | Scoring algorithm (sliding window, distance filtering) |
| `src/scoreboard.test.ts` | Test suite (edge cases, performance, ranking) |
| `src/animation/svg-compositor.ts` | SVG rendering (intro board, ending score, blackout) |
| `src/action/inputs.ts` | Configuration and `noScoreboard` flag |
| `src/action/index.ts` | Historical data fetching (all years via GraphQL contributionYears) |
