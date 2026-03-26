/**
 * Single-entity canvas renderer for validation.
 *
 * Draws one entity type at a time from GameState, using the same
 * positioning and colors as the full renderer. Used for per-entity
 * pixel-diff validation against CSS/SVG equivalents.
 */

import type { GameState, SimConfig, Position } from '../types.js'

// Colors matching the full renderer
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
export const PLUCK_COLOR = '#d29922'
export const RENDER_MARGIN = 10

export type EntityType =
  | 'grid'
  | 'invader'
  | 'ship'
  | 'laser'
  | 'overlay'
  | 'lifecycle'
  | 'formation'

function simToScreen(simX: number, simY: number, config: SimConfig): { sx: number; sy: number } {
  return {
    sx: RENDER_MARGIN + config.playArea.height - simY,
    sy: RENDER_MARGIN + simX,
  }
}

/**
 * Render a single entity type to a canvas context.
 * The canvas should be pre-cleared to BG_COLOR.
 */
export function renderEntity(
  ctx: CanvasRenderingContext2D,
  entityType: EntityType,
  state: GameState,
  config: SimConfig,
): void {
  const screenW = config.playArea.height + RENDER_MARGIN * 2
  const screenH = config.playArea.width + RENDER_MARGIN * 2
  const stride = config.cellSize + config.cellGap
  const gridScreenOffsetX = screenW - config.gridArea.height - RENDER_MARGIN
  const gridScreenOffsetY = RENDER_MARGIN + (config.playArea.width - config.gridArea.width) / 2

  switch (entityType) {
    case 'grid': {
      for (const gc of state.gridCells) {
        if (gc.status === 'plucked' || gc.status === 'traveling' || gc.status === 'hatching')
          continue
        const color =
          gc.status === 'transformed' || gc.status === 'destroyed'
            ? GRID_COLORS[0]!
            : (GRID_COLORS[gc.cell.level] ?? GRID_COLORS[0]!)
        ctx.fillStyle = color
        ctx.fillRect(
          gridScreenOffsetX + gc.cell.x * stride,
          gridScreenOffsetY + gc.cell.y * stride,
          config.cellSize,
          config.cellSize,
        )
      }
      break
    }

    case 'lifecycle': {
      const invHalf = config.invaderSize / 2
      for (const gc of state.gridCells) {
        const status = gc.status
        if (status !== 'plucked' && status !== 'traveling' && status !== 'hatching') continue

        const gridX = gridScreenOffsetX + gc.cell.x * stride
        const gridY = gridScreenOffsetY + gc.cell.y * stride

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
          ctx.fillStyle = INVADER_COLOR
          ctx.fillRect(
            targetCenterX - invHalf,
            targetCenterY - invHalf,
            config.invaderSize,
            config.invaderSize,
          )
        }
      }
      break
    }

    case 'invader':
    case 'formation': {
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
      break
    }

    case 'ship': {
      const { sx, sy } = simToScreen(state.ship.position.x, state.ship.position.y, config)
      const half = config.invaderSize / 2
      ctx.fillStyle = SHIP_COLOR
      ctx.fillRect(sx - half, sy - half, config.invaderSize, config.invaderSize)
      break
    }

    case 'laser': {
      const laserHalf = config.laserWidth / 2
      ctx.fillStyle = LASER_COLOR
      for (const laser of state.lasers) {
        if (!laser.active) continue
        const { sx, sy } = simToScreen(laser.position.x, laser.position.y, config)
        ctx.fillRect(sx - laserHalf, sy - laserHalf, config.laserWidth, config.laserWidth)
      }
      break
    }

    case 'overlay': {
      const phase = state.wavePhase
      let alpha = 0
      const hasCompletedWaves = state.formations.length > 0
      if (phase === 'idle' || phase === 'ending_reset') alpha = 0
      else if (phase === 'brightening')
        alpha = hasCompletedWaves ? 0.6 * (1 - state.wavePhaseProgress) : 0
      else if (phase === 'plucking') alpha = 0
      else if (phase === 'darkening') alpha = 0.6 * state.wavePhaseProgress
      else if (phase === 'ending_blackout') alpha = 0
      else alpha = 0.6

      if (alpha > 0.01) {
        ctx.fillStyle = `rgba(13, 17, 23, ${alpha})`
        ctx.fillRect(0, 0, screenW, screenH)
      }
      break
    }
  }
}
