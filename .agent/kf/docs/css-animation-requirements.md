# CSS Animation Requirements

## Shared @keyframes Patterns

These are defined once and reused across entities via CSS custom properties.

| Pattern | Used By | Properties Animated | Parameterized By |
|---------|---------|-------------------|------------------|
| `oscillate` | Formation groups | translateX (back-and-forth) | --osc-points (x values at each direction change) |
| `travel` | Grid cells (lifecycle) | translate(x,y), scale | --start-x, --start-y, --end-x, --end-y, --start-size, --end-size |
| `fade-in` | Overlay, score text, scoreboard, ship (reset) | opacity 0→1 | --fade-duration |
| `fade-out` | Overlay, score text, ship (ending), status bar | opacity 1→0 | --fade-duration |
| `constant-velocity` | Lasers | translateY (one direction) | --start-y, --end-y, --speed |
| `wiggle` | Score text chars, NHS indicator chars | translateY (sine wave) | --wiggle-amp, --wiggle-freq, --wiggle-phase |

## Per-Entity Animation Breakdown

### Grid Cell (lifecycle)
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Color → amber | pluck inflection | instant | `fill: #d29922` |
| Position interpolation | travel_start → travel_end | travelDuration | `transform: translate()` |
| Size interpolation | travel_start → travel_end | travelDuration | `width`/`height` or `transform: scale()` |
| Color → invader red | hatch_start | instant (hitbox mode) | `fill: #ff4444` |
| Despawn | hatch_complete (all cells) | instant | `opacity: 0` |

### Invader
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Spawn (appear) | wave_spawn event | instant | `opacity: 1` via animation start |
| Movement | inherited from formation `<g>` | continuous | parent `transform` |
| Destroy | destroy inflection | instant | `opacity: 0` |

### Formation (`<g>` group)
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Horizontal oscillation | spawn → direction_change → ... → wave_clear | per-segment | `transform: translate()` with multi-stop keyframes |
| Row drop | direction_change inflection | instant within keyframe | Y component of transform |

### Ship
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| X movement | move_start/move_end inflections | per-segment | `transform: translateX()` |
| Y drift | continuous during cooldown | slow organic | `transform: translateY()` |
| Ending fade | ending_fadeout phase | endingFadeoutDuration | `opacity: 1→0` |
| Reset appear | ending_reset phase | endingResetDuration | `opacity: 0→1` at initial position |

### Laser
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Spawn + travel | fire inflection | travel time frames | `transform: translateY()` linear |
| Despawn | out of bounds or hit | instant | `opacity: 0` or animation end |

### Overlay
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Phase transitions | wavePhase changes | per-phase duration | `opacity` multi-stop keyframes |

### Score Text (ending)
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Fade in | ending_score start | ~15% of endingScoreDuration | `opacity: 0→1` |
| Wiggle | continuous during score display | looping | per-char `transform: translateY()` |
| Fade out | ending_score_out | endingScoreOutDuration | `opacity: 1→0` |

### Scoreboard (ending)
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Fade in | ending_board_in | endingBoardInDuration | `opacity: 0→1` |
| NHS wiggle | continuous during display | looping | per-char `transform: translateY()` |
| Fade out | ending_blackout | endingBlackoutDuration | `opacity: 1→0` |

### Status Bar
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Score updates | destroy events | instant | text content change (CSS counter or pre-rendered) |
| Fade out | ending_fadeout | endingFadeoutDuration | `opacity: 1→0` |
| Reset text + fade in | ending_reset | endingResetDuration | `opacity: 0→1`, content = "READY"/"0 COMMITS" |

### Blackout Overlay
| Animation | Trigger | Duration | CSS Property |
|-----------|---------|----------|-------------|
| Fade to black | ending_blackout | endingBlackoutDuration | `opacity: 0→1` |
| Fade from black | ending_reset | endingResetDuration | `opacity: 1→0` |

## CSS Architecture Notes

- **Total unique @keyframes**: ~6 shared patterns + 1 per formation (13 waves) + 1 per laser (~300-500) = ~320-520 rules
- **Optimization**: lasers share a single constant-velocity keyframe, differentiated by --start-y and --delay
- **Formation keyframes**: each formation has unique oscillation path from direction_change inflections
- **GitHub SVG constraint**: no `<script>`, no external `<link>`, no `url()` to external resources
- **animation-duration**: derived from totalFrames / framesPerSecond
- **animation-delay**: per-entity, derived from spawn frame / framesPerSecond
- **Seamless loop**: `animation-iteration-count: infinite` with matching first/last frames
