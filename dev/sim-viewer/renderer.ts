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
export const RENDER_MARGIN = 10 // px padding around play area for centered entities at edges

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
  const sx = RENDER_MARGIN + config.playArea.height - simY
  const sy = RENDER_MARGIN + simX
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
    width: config.playArea.height + RENDER_MARGIN * 2,
    height: config.playArea.width + RENDER_MARGIN * 2 + statusBarHeight,
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
  const gridScreenOffsetX = screen.width - config.gridArea.height - RENDER_MARGIN
  const gridScreenOffsetY = RENDER_MARGIN + (config.playArea.width - config.gridArea.width) / 2

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
  // Invaders are drawn centered on their position. Lifecycle cells must transition
  // to match: hatching cells end at exact invader position, size, and color.
  const invHalf = config.invaderSize / 2

  for (const gc of state.gridCells) {
    const status = gc.status
    // Only draw active lifecycle states (plucked/traveling/hatching)
    // Transformed = done, never drawn (formation takes over)
    if (status !== 'plucked' && status !== 'traveling' && status !== 'hatching') continue

    // Grid position (top-left of cell)
    const gridX = gridScreenOffsetX + gc.cell.x * stride
    const gridY = gridScreenOffsetY + gc.cell.y * stride

    // Target position (centered, matching invader draw style)
    let targetCenterX = gridX + config.cellSize / 2
    let targetCenterY = gridY + config.cellSize / 2
    if (gc.targetPosition) {
      const { sx, sy } = simToScreen(gc.targetPosition.x, gc.targetPosition.y, config)
      targetCenterX = sx
      targetCenterY = sy
    }

    if (status === 'plucked') {
      ctx.fillStyle = PLUCK_COLOR
      ctx.fillRect(gridX, gridY, config.cellSize, config.cellSize)
    } else if (status === 'traveling') {
      const t = gc.detachProgress
      const gridCenterX = gridX + config.cellSize / 2
      const gridCenterY = gridY + config.cellSize / 2
      const cx = gridCenterX + (targetCenterX - gridCenterX) * t
      const cy = gridCenterY + (targetCenterY - gridCenterY) * t
      const size = config.cellSize + (config.invaderSize - config.cellSize) * t
      const half = size / 2
      ctx.fillStyle = PLUCK_COLOR
      ctx.fillRect(cx - half, cy - half, size, size)
    } else if (status === 'hatching') {
      // Interpolate color from amber → invader red using detachProgress (0→1)
      const t = gc.detachProgress
      // Lerp RGB: PLUCK_COLOR=#d29922 (210,153,34) → INVADER_COLOR=#ff4444 (255,68,68)
      const r = Math.round(210 + (255 - 210) * t)
      const g = Math.round(153 + (68 - 153) * t)
      const b = Math.round(34 + (68 - 34) * t)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(targetCenterX - invHalf, targetCenterY - invHalf, config.invaderSize, config.invaderSize)
    // transformed cells are not drawn — formation layer handles them
    }
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

  // Ship (fades during ending)
  const isEnding = phase.startsWith('ending_')
  const shipAlpha = phase === 'ending_fadeout' ? 1 - state.wavePhaseProgress : (isEnding ? 0 : 1)
  if (shipAlpha > 0.01) {
    const { sx: shipSx, sy: shipSy } = simToScreen(
      state.ship.position.x,
      state.ship.position.y,
      config,
    )
    const shipHalf = config.invaderSize / 2
    ctx.globalAlpha = shipAlpha
    ctx.fillStyle = SHIP_COLOR
    ctx.fillRect(shipSx - shipHalf, shipSy - shipHalf, config.invaderSize, config.invaderSize)
    ctx.globalAlpha = 1
  }

  // Wave label overlay (center, during transition phases)
  const showWaveLabel = phase === 'brightening' || phase === 'plucking' || phase === 'darkening' || phase === 'traveling' || phase === 'hatching'
  if (showWaveLabel) {
    const gameAreaH = config.playArea.width + RENDER_MARGIN * 2
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

  // Ending: score text with wiggling characters
  const showScore = phase === 'ending_score' || phase === 'ending_hold' || phase === 'ending_blackout'
  if (showScore) {
    const gameAreaH = config.playArea.width + RENDER_MARGIN * 2
    const centerX = screen.width / 2
    const centerY = gameAreaH / 2
    const scoreAlpha = phase === 'ending_score' ? state.wavePhaseProgress : (phase === 'ending_blackout' ? 1 - state.wavePhaseProgress : 1)

    ctx.save()
    ctx.globalAlpha = scoreAlpha
    ctx.font = 'bold 18px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const text = `${state.score} COMMITS DESTROYED`
    const charWidth = 11 // approximate monospace char width
    const totalWidth = text.length * charWidth
    const startX = centerX - totalWidth / 2

    for (let i = 0; i < text.length; i++) {
      // Wiggle: each character bobs up/down with staggered phase
      const wigglePhase = (state.frame * 0.08 + i * 0.5) % (Math.PI * 2)
      const wiggleY = Math.sin(wigglePhase) * 3

      ctx.fillStyle = '#39d353'
      ctx.fillText(text[i]!, startX + i * charWidth, centerY + wiggleY)
    }

    ctx.globalAlpha = 1
    ctx.restore()
  }

  // Ending: blackout overlay
  if (phase === 'ending_blackout') {
    ctx.fillStyle = `rgba(0, 0, 0, ${state.wavePhaseProgress})`
    ctx.fillRect(0, 0, screen.width, screen.height)
  }

  // Ending: reset — fade from black to initial state
  if (phase === 'ending_reset') {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - state.wavePhaseProgress})`
    ctx.fillRect(0, 0, screen.width, screen.height)
  }

  // Status bar (bottom)
  if (statusBarHeight > 0) {
    const gameAreaHeight = config.playArea.width + RENDER_MARGIN * 2 // after rotation + margin
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
