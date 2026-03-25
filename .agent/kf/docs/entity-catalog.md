# Entity Catalog — CSS Animation Requirements

All entities that need CSS animation in the final SVG output.

## 1. Grid Cell

**Source type**: `CellState` (in `GameState.gridCells[]`)

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Position | grid pos → formation pos (during travel) | `transform: translate()` keyframes |
| Size | cellSize → invaderSize (during travel) | `width`/`height` or `transform: scale()` |
| Color | level-based green → amber → invader red | `fill` transition |
| Visibility | visible → invisible (after transform) | `opacity: 0` or `display: none` |

**Lifecycle states**: `in_grid` → `plucked` → `traveling` → `hatching` → `transformed` (despawned)

**Inflection points**: `pluck`, `travel_start`, `travel_end`, `hatch_start`, `hatch_complete`

**Notes**: Each cell has its own staggered timing. Pluck order is PRNG-randomized. All cells stay `hatching` until simultaneous despawn when formation starts. Grid background shows empty (level-0 color) for plucked/transformed cells.

---

## 2. Invader

**Source type**: `InvaderState` (in `FormationState.invaders[]`)

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Position | formation offset (oscillation + row drop) | inherited from formation `<g>` transform |
| Visibility | visible → invisible (on destroy) | `opacity: 0` on destroy frame |
| Color | INVADER_COLOR (#ff4444) static | none (static fill) |
| Size | invaderSize static | none |

**Lifecycle states**: spawn → in_formation → destroyed

**Inflection points**: `spawn`, `hit`, `destroy`

**Notes**: Position driven by parent formation group. One-hit kills. Individual invader only needs spawn/destroy visibility. Formation group handles all movement.

---

## 3. Formation

**Source type**: `FormationState`

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Offset X | oscillates left/right | `transform: translateX()` keyframes per direction segment |
| Offset Y | increments on wall bounce | `transform: translateY()` keyframes at direction_change points |
| Speed | increases as invaders die | implicit in keyframe timing (shorter segments) |

**Lifecycle states**: spawned → active → cleared

**Inflection points**: `spawn`, `direction_change`, `wave_clear`

**Notes**: Rendered as `<g>` group wrapping all invader rects. The group transform drives all child positions. Direction changes are the primary keyframe breakpoints. Speed changes between direction changes as invaders are destroyed.

---

## 4. Ship

**Source type**: `ShipState`

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Position X | moves to fire positions, drifts | `transform: translateX()` keyframes at move_start/move_end |
| Position Y | organic drift within shipYRange | `transform: translateY()` slow animation |
| Opacity | 1 → 0 during ending_fadeout, 0 → 1 during ending_reset | `opacity` keyframes |

**Lifecycle states**: idle → solving/firing → ending (fade out) → reset (fade in)

**Inflection points**: `move_start`, `move_end`, `fire`

**Notes**: Ship position at ending_reset must match frame 0 position (playArea.width/2, shipY) for seamless loop.

---

## 5. Laser

**Source type**: `LaserState`

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Position Y | constant upward velocity (decreasing Y in sim) | `transform: translateY()` linear keyframes |
| Position X | static (from ship fire position) | none |
| Visibility | spawns at fire, despawns on hit or out-of-bounds | `opacity` or CSS animation fill-mode |

**Lifecycle states**: fired → traveling → hit/out_of_bounds (despawn)

**Inflection points**: `fire` (spawn)

**Notes**: Each laser is a separate element. Linear constant-velocity movement. Spawn time = fire inflection frame. Despawn when Y < playArea.y (out of bounds) or on hit event. Travel time = `ceil(distance / (laserSpeed * dt))` frames.

---

## 6. Overlay

**Source type**: implicit (driven by `GameState.wavePhase` + `wavePhaseProgress`)

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Opacity | varies by phase (0 to 0.6) | `opacity` keyframes at phase boundaries |
| Color | rgba(13, 17, 23, alpha) | static color, variable alpha |

**Phase-based opacity**:
- idle: 0
- brightening: 0.6 → 0 (first wave: stays 0)
- plucking: 0
- darkening: 0 → 0.6
- traveling/hatching/active: 0.6
- ending_fadeout through ending_blackout: varies
- ending_reset: 0

**Notes**: Full-screen rect. Opacity keyframes align to wave phase transition frames.

---

## 7. Wave Label

**Source type**: implicit (shown during lifecycle phases)

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Text | "WAVE N" | static per wave |
| Visibility | shown during brighten→hatch, hidden during active/ending | `opacity` keyframes |
| Position | centered in play area | static |

**Notes**: Appears at lifecycle start, disappears when wave becomes active. One label per wave, centered.

---

## 8. Score Text (ending)

**Source type**: implicit (ending_score phase)

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Text | "N COMMITS" | static |
| Opacity | 0 → 1 (fade in) → 1 (hold) → 0 (fade out) | `opacity` keyframes |
| Per-char Y offset | sin(frame * 0.08 + i * 0.5) * 3 | `transform: translateY()` looping animation per character |

**Notes**: Each character is a separate `<text>` or `<tspan>` with its own wiggle animation phase offset. Wiggle is continuous (looping) during the score display window.

---

## 9. Scoreboard (ending)

**Source type**: `ScoreboardResult` from `computeScoreboard()`

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Opacity | 0 → 1 (board_in) → 1 (hold) → 0 (blackout) | `opacity` keyframes |
| Title | "HIGH SCORES" static | none |
| Entries | 10 entries in 2 columns | static layout |
| Current highlight | green tint on current day's entry | static `fill` or `background` |
| New High Score text | "★ NEW HIGH SCORE! ★" with per-char wiggle | same wiggle pattern as score text |

**Notes**: Entire scoreboard is a group that fades in/out. Current entry has distinct styling. NHS indicator wiggles continuously when visible.

---

## 10. Status Bar

**Source type**: implicit (rendered below game area)

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Wave text | "READY" → "WAVE N/M" → "READY" on reset | content swap at phase boundaries |
| Score text | "0 COMMITS" → "N COMMITS" → "0 COMMITS" on reset | content updates on destroy events |
| Opacity | 1 → 0 (ending_fadeout) → 0 → 1 (ending_reset) | `opacity` keyframes |

**Notes**: Score counter increments on each invader destroy event. Content changes at specific frames. Reset shows "READY" and "0 COMMITS".

---

## 11. Blackout Overlay (ending)

**Source type**: implicit (ending_blackout phase)

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Opacity | 0 → 1 (blackout) → 1 → 0 (reset) | `opacity` keyframes |
| Color | rgba(0, 0, 0, alpha) | static black |

**Notes**: Separate from the game overlay. Covers entire SVG during blackout and reset phases.

---

## 12. Effects (future — visual polish track)

**Source type**: `EffectState`

| Property | Changes | CSS Animation |
|----------|---------|---------------|
| Type | 'explosion' | sprite animation |
| Position | at destroyed invader position | static |
| Duration | configurable | `animation-duration` |
| Visibility | spawn → duration → despawn | `opacity` + `transform: scale()` |

**Notes**: Not implemented in hitbox mode. Will be added in visual polish track.
