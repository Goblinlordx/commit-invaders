import type { GameState, SimConfig } from '../../src/types.js'

// ── Hitbox colors (must match CSS/SVG renderer for pixel-diff validation) ──

const GRID_COLORS: Record<number, string> = {
  0: '#1a1a2e',
  1: '#0e4429',
  2: '#006d32',
  3: '#26a641',
  4: '#39d353',
}
const INVADER_COLOR = '#ff4444'
const LASER_COLOR = '#ffff00'
const SHIP_COLOR = '#4488ff'
const BG_COLOR = '#0d1117'

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: SimConfig,
): void {
  const { playArea } = config

  // Clear
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, playArea.width, playArea.height)

  // Grid cells
  const stride = config.cellSize + config.cellGap
  for (const gc of state.gridCells) {
    const color = GRID_COLORS[gc.cell.level] ?? GRID_COLORS[0]!
    ctx.fillStyle = color
    ctx.fillRect(
      config.gridArea.x + gc.cell.x * stride,
      config.gridArea.y + gc.cell.y * stride,
      config.cellSize,
      config.cellSize,
    )
  }

  // Formations (invaders)
  for (const formation of state.formations) {
    if (!formation.active && formation.clearedAtFrame !== null) continue

    for (const inv of formation.invaders) {
      if (inv.destroyed) continue

      const worldX = inv.position.x + formation.offset.x
      const worldY = inv.position.y + formation.offset.y
      const half = config.invaderSize / 2

      ctx.fillStyle = INVADER_COLOR
      ctx.fillRect(worldX - half, worldY - half, config.invaderSize, config.invaderSize)
    }
  }

  // Lasers
  const laserHalf = config.laserWidth / 2
  ctx.fillStyle = LASER_COLOR
  for (const laser of state.lasers) {
    if (!laser.active) continue
    ctx.fillRect(
      laser.position.x - laserHalf,
      laser.position.y - laserHalf,
      config.laserWidth,
      config.laserWidth,
    )
  }

  // Ship
  const shipHalf = config.invaderSize / 2
  ctx.fillStyle = SHIP_COLOR
  ctx.fillRect(
    state.ship.position.x - shipHalf,
    config.shipY - shipHalf,
    config.invaderSize,
    config.invaderSize,
  )
}
