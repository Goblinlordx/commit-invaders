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
export const PLUCK_COLOR = '#d29922' // amber/gold for plucked cells
export const HATCH_COLOR = '#e05555' // transitioning to invader red
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
 * 90° CW rotation swaps width and height. Status bar adds to height.
 */
export function getScreenSize(
  config: SimConfig,
  statusBarHeight: number = 0,
): { width: number; height: number } {
  return {
    width: config.playArea.height,
    height: config.playArea.width + statusBarHeight,
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  config: SimConfig,
  statusBarHeight: number = 0,
): void {
  const screen = getScreenSize(config, statusBarHeight)

  // Clear
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, screen.width, screen.height)

  // ── Layer 1: Grid background (in_grid cells only) ──
  const stride = config.cellSize + config.cellGap
  const gridScreenOffsetX = screen.width - config.gridArea.height
  const gridScreenOffsetY = (config.playArea.width - config.gridArea.width) / 2

  for (const gc of state.gridCells) {
    const status = gc.status
    // Background pass: only draw in_grid and transformed/destroyed (as empty)
    if (status === 'plucked' || status === 'traveling' || status === 'hatching') continue

    const color = (status === 'transformed' || status === 'destroyed')
      ? GRID_COLORS[0]!
      : (GRID_COLORS[gc.cell.level] ?? GRID_COLORS[0]!)

    const screenX = gridScreenOffsetX + gc.cell.x * stride
    const screenY = gridScreenOffsetY + gc.cell.y * stride
    ctx.fillStyle = color
    ctx.fillRect(screenX, screenY, config.cellSize, config.cellSize)
  }

  // ── Layer 2: Overlay ──
  const phase = state.wavePhase
  let overlayAlpha = 0
  if (phase === 'idle') overlayAlpha = 0
  else if (phase === 'brightening') overlayAlpha = 0.6 * (1 - state.wavePhaseProgress)
  else if (phase === 'plucking') overlayAlpha = 0
  else if (phase === 'darkening') overlayAlpha = 0.6 * state.wavePhaseProgress
  else overlayAlpha = 0.6

  if (overlayAlpha > 0.01) {
    ctx.fillStyle = `rgba(13, 17, 23, ${overlayAlpha})`
    ctx.fillRect(0, 0, screen.width, screen.height)
  }

  // ── Layer 3: Lifecycle cells (plucked/traveling/hatching) — above overlay, below ship/lasers ──
  for (const gc of state.gridCells) {
    const status = gc.status
    if (status !== 'plucked' && status !== 'traveling' && status !== 'hatching') continue

    let color = PLUCK_COLOR
    let screenX = gridScreenOffsetX + gc.cell.x * stride
    let screenY = gridScreenOffsetY + gc.cell.y * stride

    if (status === 'traveling' && gc.targetPosition) {
      const { sx: targetSx, sy: targetSy } = simToScreen(gc.targetPosition.x, gc.targetPosition.y, config)
      const t = gc.detachProgress
      screenX = screenX + (targetSx - screenX) * t
      screenY = screenY + (targetSy - screenY) * t
    }

    if (status === 'hatching' && gc.targetPosition) {
      const { sx, sy } = simToScreen(gc.targetPosition.x, gc.targetPosition.y, config)
      screenX = sx
      screenY = sy
      color = HATCH_COLOR
    }

    ctx.fillStyle = color
    ctx.fillRect(screenX, screenY, config.cellSize, config.cellSize)
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
    state.ship.position.y,
    config,
  )
  const shipHalf = config.invaderSize / 2
  ctx.fillStyle = SHIP_COLOR
  ctx.fillRect(shipSx - shipHalf, shipSy - shipHalf, config.invaderSize, config.invaderSize)

  // Wave label overlay (center, during transition phases)
  const showWaveLabel = phase === 'brightening' || phase === 'plucking' || phase === 'darkening' || phase === 'traveling' || phase === 'hatching'
  if (showWaveLabel) {
    const gameAreaH = config.playArea.width
    ctx.save()
    ctx.fillStyle = '#e6edf3'
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      `WAVE ${state.currentWave + 1}`,
      screen.width / 2,
      gameAreaH / 2,
    )
    ctx.restore()
  }

  // Status bar (bottom)
  if (statusBarHeight > 0) {
    const gameAreaHeight = config.playArea.width // after rotation
    ctx.fillStyle = '#161b22'
    ctx.fillRect(0, gameAreaHeight, screen.width, statusBarHeight)

    // Wave indicator (left)
    ctx.fillStyle = '#8b949e'
    ctx.font = '11px monospace'
    ctx.textBaseline = 'middle'
    const waveText = state.formations.length > 0
      ? `WAVE ${state.currentWave}/${state.totalWaves}`
      : 'READY'
    ctx.fillText(waveText, 8, gameAreaHeight + statusBarHeight / 2)

    // Score counter (right) — commit value
    ctx.fillStyle = '#39d353'
    ctx.textAlign = 'right'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(
      `${state.score} COMMITS`,
      screen.width - 8,
      gameAreaHeight + statusBarHeight / 2,
    )
    ctx.textAlign = 'left' // reset
  }
}
