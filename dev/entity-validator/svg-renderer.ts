/**
 * Per-entity SVG renderer for validation.
 *
 * Generates a static SVG string that should match the canvas renderEntity()
 * output pixel-for-pixel at a specific frame.
 */

import type { GameState, SimConfig } from '../../src/types.js'
import type { EntityType } from '../../src/animation/render-entity.js'
import {
  gridCellSvg,
  invaderSvg,
  shipSvg,
  laserSvg,
  overlaySvg,
  lifecycleCellSvg,
  GRID_COLORS,
  INVADER_COLOR,
  PLUCK_COLOR,
  BG_COLOR,
} from '../../src/animation/entity-templates.js'

const RENDER_MARGIN = 10

function simToScreen(
  simX: number,
  simY: number,
  config: SimConfig,
): { sx: number; sy: number } {
  return {
    sx: RENDER_MARGIN + config.playArea.height - simY,
    sy: RENDER_MARGIN + simX,
  }
}

export function renderEntitySvg(
  entityType: EntityType,
  state: GameState,
  config: SimConfig,
  width: number,
  height: number,
): string {
  const stride = config.cellSize + config.cellGap
  const gridScreenOffsetX = width - config.gridArea.height - RENDER_MARGIN
  const gridScreenOffsetY = RENDER_MARGIN + (config.playArea.width - config.gridArea.width) / 2
  const elements: string[] = []

  // Background
  elements.push(`<rect width="${width}" height="${height}" fill="${BG_COLOR}" />`)

  switch (entityType) {
    case 'grid': {
      for (const gc of state.gridCells) {
        if (gc.status === 'plucked' || gc.status === 'traveling' || gc.status === 'hatching') continue
        const color = (gc.status === 'transformed' || gc.status === 'destroyed')
          ? GRID_COLORS[0]!
          : (GRID_COLORS[gc.cell.level] ?? GRID_COLORS[0]!)
        const x = gridScreenOffsetX + gc.cell.x * stride
        const y = gridScreenOffsetY + gc.cell.y * stride
        elements.push(`<rect x="${x}" y="${y}" width="${config.cellSize}" height="${config.cellSize}" fill="${color}" />`)
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
          elements.push(`<rect x="${gridX}" y="${gridY}" width="${config.cellSize}" height="${config.cellSize}" fill="${PLUCK_COLOR}" />`)
        } else if (status === 'traveling') {
          const t = gc.detachProgress
          const gridCenterX = gridX + config.cellSize / 2
          const gridCenterY = gridY + config.cellSize / 2
          const cx = gridCenterX + (targetCenterX - gridCenterX) * t
          const cy = gridCenterY + (targetCenterY - gridCenterY) * t
          const size = config.cellSize + (config.invaderSize - config.cellSize) * t
          const half = size / 2
          elements.push(`<rect x="${cx - half}" y="${cy - half}" width="${size}" height="${size}" fill="${PLUCK_COLOR}" />`)
        } else if (status === 'hatching') {
          elements.push(`<rect x="${targetCenterX - invHalf}" y="${targetCenterY - invHalf}" width="${config.invaderSize}" height="${config.invaderSize}" fill="${INVADER_COLOR}" />`)
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
          elements.push(`<rect x="${sx - half}" y="${sy - half}" width="${config.invaderSize}" height="${config.invaderSize}" fill="${INVADER_COLOR}" />`)
        }
      }
      break
    }

    case 'ship': {
      const { sx, sy } = simToScreen(state.ship.position.x, state.ship.position.y, config)
      const half = config.invaderSize / 2
      elements.push(`<rect x="${sx - half}" y="${sy - half}" width="${config.invaderSize}" height="${config.invaderSize}" fill="#4488ff" />`)
      break
    }

    case 'laser': {
      const laserHalf = config.laserWidth / 2
      for (const laser of state.lasers) {
        if (!laser.active) continue
        const { sx, sy } = simToScreen(laser.position.x, laser.position.y, config)
        elements.push(`<rect x="${sx - laserHalf}" y="${sy - laserHalf}" width="${config.laserWidth}" height="${config.laserWidth}" fill="#ffff00" />`)
      }
      break
    }

    case 'overlay': {
      const phase = state.wavePhase
      let alpha = 0
      const hasCompletedWaves = state.formations.length > 0
      if (phase === 'idle' || phase === 'ending_reset') alpha = 0
      else if (phase === 'brightening') alpha = hasCompletedWaves ? 0.6 * (1 - state.wavePhaseProgress) : 0
      else if (phase === 'plucking') alpha = 0
      else if (phase === 'darkening') alpha = 0.6 * state.wavePhaseProgress
      else if (phase === 'ending_blackout') alpha = 0
      else alpha = 0.6

      if (alpha > 0.01) {
        elements.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="rgb(13,17,23)" opacity="${alpha}" />`)
      }
      break
    }
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${elements.join('')}</svg>`
}
