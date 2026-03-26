# High Score Board

The high score board ranks the top 10 contribution windows from your GitHub history. It appears at the start of the animation (before gameplay) and highlights your current window if it qualifies.

## Data Flow

```
GitHub GraphQL API  ──>  10 years of contribution data
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

1. **Fetch** -- The GitHub Action fetches up to 10 years of contribution history via the GraphQL API.
2. **Score** -- `computeScoreboard()` computes the top 10 non-overlapping contribution windows.
3. **Render** -- The SVG compositor draws the scoreboard as an intro overlay and the final score as an ending display.

## Algorithm

### Sliding Window with Prefix Sums

Every day in your contribution history gets a **window score**: the total commits in the trailing 364 days (52 weeks).

```
window_score[day] = sum of commits from (day - 363) to day
```

To compute this efficiently, the algorithm builds a **prefix sum array** over daily commit counts. This allows any window's total to be calculated in O(1):

```
score = prefix[day + 1] - prefix[day - windowSize + 1]
```

All windows are then sorted by score in descending order.

### Distance Filtering

The raw sorted list often has many overlapping windows clustered around the same peak period. To produce a diverse top-10 list, the algorithm enforces a **minimum distance** (in days) between selected entries.

The optimal distance is found via **binary search**:

1. Binary search over candidate distances from 0 to N (total days)
2. For each candidate distance, greedily select the highest-scoring windows that are at least that many days apart
3. Find the largest distance that still yields 10 or more entries

The greedy selection uses a **sorted set** of already-chosen indices. For each candidate window, a binary search checks whether any previously selected window is too close. This gives O(log K) per proximity check, where K is the number of entries selected so far (at most 10).

**Overall complexity: O(N log N)** -- dominated by the initial sort. The binary search runs O(log N) iterations, each filtering in O(N log K) time.

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

## Configuration

### `--no-scoreboard` Flag

Pass `no_scoreboard: true` in the GitHub Action (or `--no-scoreboard` via npx) to disable the scoreboard entirely. This:

- Skips fetching 10 years of historical data (faster)
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
| `src/action/index.ts` | Historical data fetching (10 years via GraphQL) |
