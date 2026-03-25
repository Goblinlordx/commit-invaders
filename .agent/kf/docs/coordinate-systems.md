# Coordinate Systems & Spatial Calculations

## Simulation Space (source of truth)

All physics and solver computations happen in sim space.

```
Y=0 (far end, invaders spawn here)
│
│  Invaders oscillate on X axis
│  Lasers travel decreasing Y (upward)
│
Y=shipY (ship position, bottom)

X=0 ─────── X=playArea.width
  (formation zigzag axis)
```

- **X axis**: formation oscillation (left/right zigzag)
- **Y axis**: laser travel (ship fires upward = decreasing Y)
- **Ship**: at `(playArea.width/2, shipY)` initially, moves on X, drifts on Y
- **Formations**: start at gridArea positions, offset accumulates via tick()

## Screen Space (rendered, 90° CW rotation)

The canvas/SVG renderer rotates sim space 90° clockwise for a horizontal layout.

```
┌──────────────────────────────────────────────────┐
│ Ship ──→ lasers ──→ ──→ ──→        Invaders      │
│ (left)                              (right)       │
│                                     ↕ oscillate   │
└──────────────────────────────────────────────────┘
```

**Transform**: `simToScreen(simX, simY, config)`
```
screenX = RENDER_MARGIN + playArea.height - simY
screenY = RENDER_MARGIN + simX
```

- sim Y=0 (far) → screen right edge
- sim Y=shipY (near) → screen left edge
- sim X=0 (top of zigzag) → screen top
- sim X=playArea.width (bottom of zigzag) → screen bottom

**Screen dimensions**:
```
width  = playArea.height + RENDER_MARGIN * 2
height = playArea.width  + RENDER_MARGIN * 2 + STATUS_BAR_HEIGHT
```

## Grid Layout (background, screen space)

The contribution grid is rendered directly in screen space (not through simToScreen).

```
gridScreenOffsetX = screenWidth - gridArea.height - RENDER_MARGIN
gridScreenOffsetY = RENDER_MARGIN + (playArea.width - gridArea.width) / 2
```

Cell positions:
```
cellScreenX = gridScreenOffsetX + cell.x * stride
cellScreenY = gridScreenOffsetY + cell.y * stride
stride = cellSize + cellGap
```

## Formation Target Positions (sim space)

When cells travel to formation positions, the target is computed in sim space:

```typescript
function invaderPosition(cellX, cellY, minCol): Position {
  const col = cellX - minCol
  const staggerX = (cellY % 2) * formationRowStagger
  return {
    x: gridArea.x + col * (stride + formationSpread) + staggerX,
    y: gridArea.y + cellY * (stride + formationSpread),
  }
}
```

These positions are then mapped to screen space via `simToScreen()`.

## Time Mapping

```
dt = 1 / framesPerSecond          // seconds per frame
frame_to_seconds = frame * dt      // frame → real time
frame_to_percent = frame / totalFrames * 100   // frame → CSS animation %
css_animation_duration = totalFrames * dt      // total animation in seconds
```

## Key Dimensions (default sim-viewer config)

| Parameter | Value | Unit |
|-----------|-------|------|
| framesPerSecond | 60 | fps |
| cellSize | 11 | px |
| cellGap | 2 | px |
| stride | 13 | px |
| invaderSize | 9 | px |
| laserWidth | 4 | px |
| PADDING | 20 | px |
| RENDER_MARGIN | 10 | px |
| STATUS_BAR_HEIGHT | 20 | px |
| playArea.width | 131 | px (7 days × stride + padding × 2) |
| playArea.height | 700 | px (52 weeks × stride + shipMargin) |
| shipY | 696 | px |
| gridArea.x | 20 | px (PADDING) |
| gridArea.width | 91 | px (7 × stride) |
| gridArea.height | 676 | px (52 × stride) |
| formationSpread | 10 | px |
| formationRowStagger | 10 | px |
| formationRowDrop | 7 | px |

## CSS Coordinate Mapping for SVG

In the final SVG, entities are positioned in screen space. The SVG viewBox matches screen dimensions:

```xml
<svg viewBox="0 0 {screenWidth} {screenHeight}" xmlns="http://www.w3.org/2000/svg">
```

All positions in the SVG use screen coordinates directly. The `simToScreen` mapping is applied during SVG generation, not at render time.
