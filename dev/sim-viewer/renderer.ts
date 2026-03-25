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
export const OVERLAY_COLOR = 'rgba(13, 17, 23, 0.6)'

/**
 * Map sim coordinates to screen coordinates (90° CW rotation).
 *
 * Sim space:
 *   X: 0→playArea.width  (formation zigzag axis)
 *   Y: 0→playArea.height (laser travel axis, 0=top/far, shipY=bottom/near)
 *
 * Screen space (horizontal layout):
 *   screenX: 0→playArea.height (left=ship, right=far end)
 *     ship at left: simY=shipY → screenX near 0
 *     far end at right: simY=0 → screenX near playArea.height
 *   screenY: 0→playArea.width (top→bottom = sim X axis)
 */
function simToScreen(
  simX: number,
  simY: number,
  config: SimConfig,
): { sx: number; sy: number } {
  const sx = config.playArea.height - simY
  const sy = simX
  return { sx, sy }
}

/**
 * Get the screen dimensions for canvas sizing.
 * 90° CW rotation swaps width and height.
 */
export function getScreenSize(config: SimConfig): { width: number; height: number } {
  return {
    width: config.playArea.height,
    height: config.playArea.width,
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: SimConfig,
): void {
  const screen = getScreenSize(config)

  // Clear
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, screen.width, screen.height)

  // Grid cells (background) — rendered directly in screen space
  // Weeks go left→right (screen X), days go top→bottom (screen Y)
  // Grid fills the background; the ship margin is on the left
  const stride = config.cellSize + config.cellGap
  const gridScreenOffsetX = screen.width - config.gridArea.height // push grid to right side, leaving ship margin on left
  for (const gc of state.gridCells) {
    const color = GRID_COLORS[gc.cell.level] ?? GRID_COLORS[0]!
    const screenX = gridScreenOffsetX + gc.cell.x * stride // week → screen X
    const screenY = gc.cell.y * stride                      // day → screen Y
    ctx.fillStyle = color
    ctx.fillRect(screenX, screenY, config.cellSize, config.cellSize)
  }

  // Darken overlay during active waves
  const hasActiveWave = state.formations.some(
    (f) => f.active && f.invaders.some((i) => !i.destroyed),
  )
  if (hasActiveWave) {
    ctx.fillStyle = OVERLAY_COLOR
    ctx.fillRect(0, 0, screen.width, screen.height)
  }

  // Formations (invaders)
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

  // Lasers
  const laserHalf = config.laserWidth / 2
  ctx.fillStyle = LASER_COLOR
  for (const laser of state.lasers) {
    if (!laser.active) continue
    const { sx, sy } = simToScreen(laser.position.x, laser.position.y, config)
    ctx.fillRect(sx - laserHalf, sy - laserHalf, config.laserWidth, config.laserWidth)
  }

  // Ship
  const { sx: shipSx, sy: shipSy } = simToScreen(
    state.ship.position.x,
    config.shipY,
    config,
  )
  const shipHalf = config.invaderSize / 2
  ctx.fillStyle = SHIP_COLOR
  ctx.fillRect(shipSx - shipHalf, shipSy - shipHalf, config.invaderSize, config.invaderSize)
}
