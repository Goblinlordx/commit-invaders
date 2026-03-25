import type { GameState, SimConfig } from '../../src/types.js'
import type { ScoreboardResult } from '../../src/scoreboard.js'

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

/** Format large numbers compactly: 999 → "999", 1234 → "1.234k", 1234567 → "1.235M" */
function formatScore(n: number): string {
  if (n >= 1e15) return (n / 1e15).toFixed(3).replace(/\.?0+$/, '') + 'Q??'
  if (n >= 1e12) return (n / 1e12).toFixed(3).replace(/\.?0+$/, '') + 'T'
  if (n >= 1e9) return (n / 1e9).toFixed(3).replace(/\.?0+$/, '') + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(3).replace(/\.?0+$/, '') + 'M'
  if (n >= 1e4) return (n / 1e3).toFixed(2).replace(/\.?0+$/, '') + 'k'
  if (n >= 1e3) return (n / 1e3).toFixed(3).replace(/\.?0+$/, '') + 'k'
  return String(n)
}

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
  scoreboardData?: ScoreboardResult,
): void {
  const screen = getScreenSize(config, statusBarHeight)

  // Clear
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, screen.width, screen.height)

  // ── Layer 1: Grid background (in_grid cells only) ──
  const phase = state.wavePhase
  const stride = config.cellSize + config.cellGap
  const gridScreenOffsetX = screen.width - config.gridArea.height - RENDER_MARGIN
  const gridScreenOffsetY = RENDER_MARGIN + (config.playArea.width - config.gridArea.width) / 2

  // During ending_reset, draw all cells at original colors (grid restores)
  const resetGrid = phase === 'ending_reset'

  for (const gc of state.gridCells) {
    const status = gc.status

    if (resetGrid) {
      // Show full original grid
      ctx.fillStyle = GRID_COLORS[gc.cell.level] ?? GRID_COLORS[0]!
    } else {
      // Background pass: only draw in_grid and transformed/destroyed (as empty)
      if (status === 'plucked' || status === 'traveling' || status === 'hatching') continue

      ctx.fillStyle = (status === 'transformed' || status === 'destroyed')
        ? GRID_COLORS[0]!
        : (GRID_COLORS[gc.cell.level] ?? GRID_COLORS[0]!)
    }

    const screenX = gridScreenOffsetX + gc.cell.x * stride
    const screenY = gridScreenOffsetY + gc.cell.y * stride
    ctx.fillRect(screenX, screenY, config.cellSize, config.cellSize)
  }

  // ── Layer 2: Overlay ──
  let overlayAlpha = 0
  const hasCompletedWaves = state.formations.length > 0
  if (phase === 'idle' || phase === 'ending_reset') overlayAlpha = 0
  else if (phase === 'brightening') overlayAlpha = hasCompletedWaves ? 0.6 * (1 - state.wavePhaseProgress) : 0
  else if (phase === 'plucking') overlayAlpha = 0
  else if (phase === 'darkening') overlayAlpha = 0.6 * state.wavePhaseProgress
  else if (phase === 'ending_blackout') overlayAlpha = 0
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
      // Simple: invader color at invader size/position (matches invader exactly)
      ctx.fillStyle = INVADER_COLOR
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
  let shipAlpha = 1
  if (phase === 'ending_fadeout') shipAlpha = 1 - state.wavePhaseProgress
  else if (phase === 'ending_reset') shipAlpha = state.wavePhaseProgress
  else if (isEnding) shipAlpha = 0
  if (shipAlpha > 0.01) {
    // During reset, draw at initial position (must match frame 0)
    const shipSimX = phase === 'ending_reset' ? config.playArea.width / 2 : state.ship.position.x
    const shipSimY = phase === 'ending_reset' ? config.shipY : state.ship.position.y
    const { sx: shipSx, sy: shipSy } = simToScreen(shipSimX, shipSimY, config)
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

  // Ending: scoreboard display
  const showScore = phase === 'ending_score' || phase === 'ending_hold' || phase === 'ending_blackout'
  if (showScore && scoreboardData) {
    const gameAreaH = config.playArea.width + RENDER_MARGIN * 2
    const centerX = screen.width / 2
    const scoreAlpha = phase === 'ending_score' ? state.wavePhaseProgress : (phase === 'ending_blackout' ? 1 - state.wavePhaseProgress : 1)

    ctx.save()
    ctx.globalAlpha = scoreAlpha

    // Scale sizes relative to game area height to fill the space
    const h = gameAreaH
    const titleSize = Math.max(10, Math.floor(h * 0.1))
    const nhsSize = Math.max(8, Math.floor(h * 0.08))
    const fontSize = Math.max(9, Math.floor(h * 0.09))
    const rowHeight = Math.floor(h * 0.11)

    // Title with wiggle
    const title = 'HIGH SCORES'
    const titleY = Math.floor(h * 0.08)
    ctx.font = `bold ${titleSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const titleCharW = titleSize * 0.62
    const titleStartX = centerX - (title.length * titleCharW) / 2

    for (let i = 0; i < title.length; i++) {
      const wiggle = Math.sin((state.frame * 0.08 + i * 0.4) % (Math.PI * 2)) * 2.5
      ctx.fillStyle = '#39d353'
      ctx.fillText(title[i]!, titleStartX + i * titleCharW, titleY + wiggle)
    }

    // "New High Score!" indicator
    let tableStartY = Math.floor(h * 0.18)
    if (scoreboardData.isNewHighScore) {
      ctx.font = `bold ${nhsSize}px monospace`
      ctx.fillStyle = '#ffff00'
      ctx.textAlign = 'center'
      const nhsY = Math.floor(h * 0.17)
      const nhsText = '★ NEW HIGH SCORE! ★'
      const nhsCharW = nhsSize * 0.62
      const nhsStartX = centerX - (nhsText.length * nhsCharW) / 2
      for (let i = 0; i < nhsText.length; i++) {
        const wiggle = Math.sin((state.frame * 0.12 + i * 0.6) % (Math.PI * 2)) * 2
        ctx.fillText(nhsText[i]!, nhsStartX + i * nhsCharW, nhsY + wiggle)
      }
      tableStartY = Math.floor(h * 0.26)
    }

    // Scoreboard table — 2 columns of 5
    const colWidth = screen.width * 0.44
    const colGap = screen.width * 0.04
    const colOffsets = [centerX - colGap / 2 - colWidth / 2, centerX + colGap / 2 + colWidth / 2]
    ctx.textBaseline = 'middle'

    for (let i = 0; i < scoreboardData.entries.length; i++) {
      const entry = scoreboardData.entries[i]!
      const col = i < 5 ? 0 : 1
      const row = i < 5 ? i : i - 5
      const colX = colOffsets[col]!
      const y = tableStartY + row * rowHeight
      const isCurrent = entry.isCurrent

      // Highlight current entry
      if (isCurrent) {
        ctx.fillStyle = 'rgba(57, 211, 83, 0.15)'
        ctx.fillRect(colX - colWidth / 2 - 4, y - rowHeight / 2, colWidth + 8, rowHeight)
      }

      // Rank
      ctx.textAlign = 'left'
      ctx.fillStyle = isCurrent ? '#ffff00' : '#8b949e'
      ctx.font = isCurrent ? `bold ${fontSize}px monospace` : `${fontSize}px monospace`
      ctx.fillText(`${String(entry.rank).padStart(2, ' ')}.`, colX - colWidth / 2, y)

      // Date (short: MM-DD)
      ctx.fillStyle = isCurrent ? '#e6edf3' : '#8b949e'
      const shortDate = entry.date.slice(5) // "MM-DD" from "YYYY-MM-DD"
      ctx.fillText(shortDate, colX - colWidth / 2 + fontSize * 2.8, y)

      // Score (formatted)
      ctx.textAlign = 'right'
      ctx.fillStyle = isCurrent ? '#39d353' : '#58a6ff'
      ctx.font = isCurrent ? `bold ${fontSize}px monospace` : `${fontSize}px monospace`
      ctx.fillText(formatScore(entry.score), colX + colWidth / 2, y)
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

    // Status bar alpha during ending phases
    let statusAlpha = 1
    if (phase === 'ending_fadeout') statusAlpha = 1 - state.wavePhaseProgress
    else if (phase === 'ending_score' || phase === 'ending_hold') statusAlpha = 0
    else if (phase === 'ending_blackout') statusAlpha = 0
    else if (phase === 'ending_reset') statusAlpha = state.wavePhaseProgress

    // Wave indicator (left)
    ctx.font = '11px monospace'
    ctx.textBaseline = 'middle'

    if (phase === 'ending_reset') {
      // Reset: fade in "READY"
      ctx.globalAlpha = statusAlpha
      ctx.fillStyle = '#8b949e'
      ctx.fillText('READY', 8, gameAreaHeight + statusBarHeight / 2)
      // Reset: fade in "0 COMMITS"
      ctx.fillStyle = '#39d353'
      ctx.textAlign = 'right'
      ctx.font = 'bold 12px monospace'
      ctx.fillText('0 COMMITS', screen.width - 8, gameAreaHeight + statusBarHeight / 2)
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'
    } else {
      ctx.globalAlpha = statusAlpha
      ctx.fillStyle = '#8b949e'
      const waveText = state.formations.length > 0
        ? `WAVE ${state.currentWave}/${state.totalWaves}`
        : 'READY'
      ctx.fillText(waveText, 8, gameAreaHeight + statusBarHeight / 2)

      // Score counter (right)
      ctx.fillStyle = '#39d353'
      ctx.textAlign = 'right'
      ctx.font = 'bold 12px monospace'
      ctx.fillText(
        `${state.score} COMMITS`,
        screen.width - 8,
        gameAreaHeight + statusBarHeight / 2,
      )
      ctx.globalAlpha = 1
      ctx.textAlign = 'left'
    }
  }
}
