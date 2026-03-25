import type { GameState, SimConfig } from '../../src/types.js'

// ── Hitbox colors (must match CSS/SVG renderer for pixel-diff validation) ──

export const GRID_COLORS: Record<number, string> = {
  0: '#1a1a2e',
  1: '#0e4429',
  2: '#006d32',
  3: '#26a641',
  4: '#39d353',
}
export const INVADER_COLOR = '#ff4444'
export const LASER_COLOR = '#ffff00'
export const SHIP_COLOR = '#4488ff'
export const BG_COLOR = '#0d1117'
export const OVERLAY_COLOR = 'rgba(13, 17, 23, 0.6)' // darken during active waves

/**
 * Map sim coordinates to screen coordinates.
 *
 * The simulation runs vertically: ship at bottom (high Y), fires upward
 * (decreasing Y), formations zigzag on X. The renderer rotates 90° CW
 * to produce a horizontal layout:
 *
 *   sim Y (up→down = 0→shipY)  →  screen X (left→right = shipX→width)
 *   sim X (left→right)         →  screen Y (top→bottom)
 *
 * Ship ends up on the LEFT, firing RIGHT. Formations oscillate vertically.
 */
function simToScreen(
  simX: number,
  simY: number,
  config: SimConfig,
): { sx: number; sy: number } {
  // Map sim Y to screen X: sim Y=0 (top/far) → screen right, sim Y=shipY → screen left
  const sx = config.playArea.width - simY
  // Map sim X to screen Y directly
  const sy = simX
  return { sx, sy }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: SimConfig,
): void {
  // Screen dimensions: wide (sim height becomes width) × tall (sim width becomes height)
  const screenW = config.playArea.height // sim's vertical range → screen width
  const screenH = config.playArea.width  // sim's horizontal range → screen height

  // Clear
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, screenW, screenH)

  // Grid cells (background — always visible)
  const stride = config.cellSize + config.cellGap
  for (const gc of state.gridCells) {
    const color = GRID_COLORS[gc.cell.level] ?? GRID_COLORS[0]!
    // Grid uses its own coordinate system (not sim coords)
    // Place grid in the left portion of the screen
    const gx = config.gridArea.y + gc.cell.x * stride // weeks → screen X (left to right)
    const gy = config.gridArea.x + gc.cell.y * stride  // days → screen Y (top to bottom)
    ctx.fillStyle = color
    ctx.fillRect(gx, gy, config.cellSize, config.cellSize)
  }

  // Darken overlay during active waves
  const hasActiveWave = state.formations.some(
    (f) => f.active && f.invaders.some((i) => !i.destroyed),
  )
  if (hasActiveWave) {
    ctx.fillStyle = OVERLAY_COLOR
    ctx.fillRect(0, 0, screenW, screenH)
  }

  // Formations (invaders) — rotated from sim coords
  for (const formation of state.formations) {
    if (!formation.active && formation.clearedAtFrame !== null) continue

    for (const inv of formation.invaders) {
      if (inv.destroyed) continue

      const worldX = inv.position.x + formation.offset.x
      const worldY = inv.position.y + formation.offset.y
      const { sx, sy } = simToScreen(worldX, worldY, config)
      const half = config.invaderSize / 2

      ctx.fillStyle = INVADER_COLOR
      ctx.fillRect(sx - half, sy - half, config.invaderSize, config.invaderSize)
    }
  }

  // Lasers — rotated
  const laserHalf = config.laserWidth / 2
  ctx.fillStyle = LASER_COLOR
  for (const laser of state.lasers) {
    if (!laser.active) continue
    const { sx, sy } = simToScreen(laser.position.x, laser.position.y, config)
    // Laser is a horizontal line in screen space (travels rightward)
    ctx.fillRect(sx - laserHalf, sy - laserHalf, config.laserWidth, config.laserWidth)
  }

  // Ship — rotated (on left edge of screen)
  const { sx: shipSx, sy: shipSy } = simToScreen(
    state.ship.position.x,
    config.shipY,
    config,
  )
  const shipHalf = config.invaderSize / 2
  ctx.fillStyle = SHIP_COLOR
  ctx.fillRect(shipSx - shipHalf, shipSy - shipHalf, config.invaderSize, config.invaderSize)
}

/**
 * Get the screen dimensions for canvas sizing.
 * Since we rotate 90° CW, width and height swap.
 */
export function getScreenSize(config: SimConfig): { width: number; height: number } {
  return {
    width: config.playArea.height,  // sim vertical → screen horizontal
    height: config.playArea.width,  // sim horizontal → screen vertical
  }
}
