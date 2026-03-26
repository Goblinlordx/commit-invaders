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

### Step 1: Prefix Sums

All dates from the contribution history are sorted chronologically and mapped to contiguous indices `0..N-1`. A prefix sum array is built over daily commit counts, enabling any trailing window sum in O(1):

```
prefix[0] = 0
prefix[i] = prefix[i-1] + commits[i-1]

window_score(day) = prefix[day + 1] - prefix[day - windowSize + 1]
```

### Step 2: Window Scores + RunTracker

A single pass over all N days computes:

1. **Window score** for each day -- total commits in the trailing 364 days (52 weeks). Days with score 0 (no contributions in that trailing window) are excluded from further consideration.

2. **RunTracker** -- built from the scores array in two linear passes (forward for run starts, backward for run ends). Adjacent days often share the same window score because the sliding window shifts by one day, adding/removing a single day's commits. The RunTracker identifies these consecutive same-score runs using flat `Int32Array` boundaries (`runStart[i]`, `runEnd[i]`) and tracks consumption via a `Uint8Array` flag per index -- all O(1) operations with no hash overhead.

Non-zero records are collected and sorted by score descending.

### Step 3: Run-Aware Distance Filtering via Binary Search

The sorted list has many entries clustered around peak periods. To produce a diverse top-10, the algorithm enforces a **minimum distance** (in days) between selected entries, with the RunTracker ensuring no two entries come from the same consecutive same-score run.

The optimal distance is found via **binary search over distance thresholds**:

1. Search candidate distances from 0 to N
2. For each candidate, greedily iterate the score-descending records:
   - **Skip** if the RunTracker marks this index as already consumed
   - **Skip** if a binary search of the `used` array finds a previously selected index within the minimum distance
   - **Select** otherwise: add to results, record the index, and tell the RunTracker to consume the entire run (`runStart[i]..runEnd[i]` are all flagged in the `Uint8Array`)
3. The RunTracker resets its consumed flags between binary search iterations
4. Find the **largest** distance that still yields >= 10 entries

O(log K) per proximity check (K = accepted entries, at most 10). Run consumption is amortized O(N) total since each index is consumed at most once per iteration.

**Overall complexity: O(N log N)** -- dominated by the initial sort. The binary search runs O(log N) iterations, each filtering in O(N log K).

### Step 4: Current Day Detection

The current day's window score is computed independently. If it ties or beats the #1 entry on the board, `isNewHighScore` is set. The first board entry matching the current score is marked `isCurrent` for highlight rendering.

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
