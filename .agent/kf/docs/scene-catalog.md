# Scene Catalog — Visual Phases

The animation consists of 15 distinct scenes, looping seamlessly.

## Scene 1: IDLE (Start Hold)
- **WavePhase**: `idle`
- **Duration**: `waveConfig.startDelay` frames
- **Visible**: full grid (original colors), ship at center, "READY", "0 COMMITS"
- **Overlay**: 0 (transparent)
- **Entities active**: grid cells (static), ship (slight Y drift)
- **Loop point**: first frame = last frame of ending_reset

## Scene 2: BRIGHTENING
- **WavePhase**: `brightening`
- **Duration**: `waveConfig.brightenDuration` frames
- **Visible**: grid, ship, "WAVE N" label fades in
- **Overlay**: first wave: stays 0. Subsequent waves: 0.6 → 0
- **Entities active**: grid cells (static), ship (drift), wave label

## Scene 3: PLUCKING
- **WavePhase**: `plucking`
- **Duration**: `waveConfig.pluckDuration` frames (staggered per cell)
- **Visible**: grid with cells turning amber one by one (random order)
- **Overlay**: 0 (transparent — see the plucked cells)
- **Entities active**: grid cells (some → plucked status), ship (drift), wave label

## Scene 4: DARKENING
- **WavePhase**: `darkening`
- **Duration**: `waveConfig.darkenDuration` frames
- **Visible**: grid with plucked amber cells, overlay fading in
- **Overlay**: 0 → 0.6
- **Entities active**: grid cells (plucked stay visible above overlay), ship (drift), wave label

## Scene 5: TRAVELING
- **WavePhase**: `traveling`
- **Duration**: `waveConfig.travelDuration` frames per cell (staggered)
- **Visible**: cells moving from grid to formation positions, size interpolating
- **Overlay**: 0.6
- **Entities active**: traveling cells (position + size interpolation), ship (drift), wave label

## Scene 6: HATCHING
- **WavePhase**: `hatching`
- **Duration**: `waveConfig.hatchDuration` frames per cell (staggered)
- **Visible**: cells at formation position, invader color, waiting for all to finish
- **Overlay**: 0.6
- **Entities active**: hatching cells (invader color, invader size, target position), wave label
- **End condition**: all cells hatch → simultaneous despawn + formation spawn

## Scene 7: ACTIVE (Combat)
- **WavePhase**: `active`
- **Duration**: until all invaders destroyed
- **Visible**: formation oscillating, ship targeting and firing, lasers traveling, invaders dying
- **Overlay**: 0.6
- **Entities active**: formation (oscillation), invaders (visibility), ship (movement + firing), lasers (travel), status bar (score incrementing)

## Scene 8: WAVE CLEAR → NEXT WAVE
- **Transition**: wave_clear event → `spawnDelay` frames → next wave brightening
- **Duration**: `spawnDelay` frames (default 0 — lifecycle IS the transition)
- **Visible**: grid (cleared cells as level-0), ship
- **Entities active**: ship (drift)
- **Next**: back to Scene 2 (brightening) for next wave

## Scene 9: ENDING FADEOUT
- **WavePhase**: `ending_fadeout`
- **Duration**: `waveConfig.endingFadeoutDuration` frames
- **Visible**: ship fading, remaining lasers flying, status bar fading
- **Overlay**: 0.6
- **Entities active**: ship (opacity 1→0), lasers (continue traveling), status bar (opacity 1→0)

## Scene 10: ENDING SCORE
- **WavePhase**: `ending_score`
- **Duration**: `waveConfig.endingScoreDuration` frames
- **Visible**: "N COMMITS" large centered text with per-character wiggle
- **Overlay**: 0.6
- **Entities active**: score text (fade in first 15%, hold, wiggle throughout)

## Scene 11: ENDING SCORE OUT
- **WavePhase**: `ending_score_out`
- **Duration**: `waveConfig.endingScoreOutDuration` frames
- **Visible**: "N COMMITS" text fading out
- **Overlay**: 0.6
- **Entities active**: score text (opacity 1→0)

## Scene 12: ENDING BOARD IN
- **WavePhase**: `ending_board_in`
- **Duration**: `waveConfig.endingBoardInDuration` frames
- **Visible**: scoreboard fading in (title, entries, NHS indicator)
- **Overlay**: 0.6
- **Entities active**: scoreboard (opacity 0→1), NHS indicator (wiggle if applicable)

## Scene 13: ENDING HOLD
- **WavePhase**: `ending_hold`
- **Duration**: `waveConfig.endingHoldDuration` frames
- **Visible**: scoreboard stable, NHS wiggling
- **Overlay**: 0.6
- **Entities active**: scoreboard (static), NHS indicator (wiggle)

## Scene 14: ENDING BLACKOUT
- **WavePhase**: `ending_blackout`
- **Duration**: `waveConfig.endingBlackoutDuration` frames
- **Visible**: scoreboard fading behind black overlay
- **Overlay**: black 0→1
- **Entities active**: scoreboard (opacity 1→0), blackout overlay (opacity 0→1)

## Scene 15: ENDING RESET
- **WavePhase**: `ending_reset`
- **Duration**: `waveConfig.endingResetDuration` frames
- **Visible**: black fading to reveal initial state
- **Overlay**: black 1→0
- **Entities active**: grid (original colors), ship at initial position (opacity 0→1), status bar "READY"/"0 COMMITS" (opacity 0→1), blackout overlay (opacity 1→0)
- **End condition**: loops back to Scene 1 (idle)
