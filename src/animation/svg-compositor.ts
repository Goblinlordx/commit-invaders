/**
 * SVG Compositor — assembles the final animated SVG from SimOutput.
 *
 * Pipeline: SimOutput → timeline-mapper → entity-binder → SVG string
 *
 * The output SVG is GitHub-safe: no JavaScript, no external resources.
 * All animation is pure CSS @keyframes with inline styles.
 */

import type { Grid, SimConfig, SimOutput } from '../types.js'
import { simulate } from '../simulator/simulate.js'
import { computeScoreboard, type ScoreboardResult } from '../scoreboard.js'
import {
  totalDuration,
  frameToPercent,
  frameToSeconds,
  formationKeyframes,
  cellLifecycleTimings,
  shipKeyframes,
  laserTimings,
  overlayKeyframeStops,
} from './timeline-mapper.js'
import {
  oscillationKeyframes,
  opacityKeyframes,
  sharedKeyframes,
} from './keyframes.js'
import {
  GRID_COLORS,
  INVADER_COLOR,
  LASER_COLOR,
  SHIP_COLOR,
  PLUCK_COLOR,
  BG_COLOR,
} from './entity-templates.js'

const RENDER_MARGIN = 10

function simToScreen(simX: number, simY: number, config: SimConfig): { sx: number; sy: number } {
  return {
    sx: RENDER_MARGIN + config.playArea.height - simY,
    sy: RENDER_MARGIN + simX,
  }
}

export interface CompositeSvgOptions {
  grid: Grid
  seed: string
  config: SimConfig
  scoreboard?: ScoreboardResult
}

/**
 * Generate the complete animated SVG from simulation data.
 */
export function composeSvg(options: CompositeSvgOptions): string {
  const { grid, seed, config } = options
  const output = simulate(grid, seed, config)
  const fps = config.framesPerSecond
  const dur = totalDuration(output.totalFrames, fps)
  const screenW = config.playArea.height + RENDER_MARGIN * 2
  const screenH = config.playArea.width + RENDER_MARGIN * 2
  const stride = config.cellSize + config.cellGap
  const gridOffX = screenW - config.gridArea.height - RENDER_MARGIN
  const gridOffY = RENDER_MARGIN + (config.playArea.width - config.gridArea.width) / 2

  const elements: string[] = []
  const cssRules: string[] = []

  // ── Shared keyframes ──
  cssRules.push(sharedKeyframes())

  // ── Background ──
  elements.push(`<rect width="${screenW}" height="${screenH}" fill="${BG_COLOR}" />`)

  // ── Grid cells (background layer) ──
  for (const cell of grid.cells) {
    const color = GRID_COLORS[cell.level] ?? GRID_COLORS[0]!
    const x = gridOffX + cell.x * stride
    const y = gridOffY + cell.y * stride
    elements.push(`<rect class="gc" x="${x}" y="${y}" width="${config.cellSize}" height="${config.cellSize}" fill="${color}" />`)
  }

  // ── Overlay ──
  const overlayStops = overlayKeyframeStops(output, config)
  const overlayKfName = 'overlay-opacity'
  cssRules.push(opacityKeyframes(overlayKfName, overlayStops))
  elements.push(
    `<rect class="overlay" x="0" y="0" width="${screenW}" height="${screenH}" fill="${BG_COLOR}" ` +
    `style="animation: ${overlayKfName} ${dur}s linear infinite" />`
  )

  // ── Lifecycle cells ──
  const cellData = cellLifecycleTimings(output, config)
  for (const cd of cellData) {
    // Each cell: appears at pluckTime, travels, hatches, despawns at hatchCompleteTime
    const pluckDelay = cd.pluckTime
    const travelDelay = cd.travelStartTime
    const travelDur = cd.travelEndTime - cd.travelStartTime
    const hatchDelay = cd.hatchStartTime
    const despawnTime = cd.hatchCompleteTime
    const invHalf = config.invaderSize / 2

    // Plucked cell: appears at grid position
    // Travel: moves to target position
    // Hatch: at target position, invader color
    // We use multiple animation segments via CSS

    const cellKfName = `lc-${cd.cellId.replace(/[^a-z0-9]/g, '-')}`
    const gridCenterX = cd.gridScreenX + config.cellSize / 2
    const gridCenterY = cd.gridScreenY + config.cellSize / 2

    // Combined keyframe: 0% at grid, transition to target, hold, then hide
    const pluckPct = frameToPercent(cd.pluckTime * fps, output.totalFrames)
    const travelStartPct = frameToPercent(cd.travelStartTime * fps, output.totalFrames)
    const travelEndPct = frameToPercent(cd.travelEndTime * fps, output.totalFrames)
    const hatchStartPct = frameToPercent(cd.hatchStartTime * fps, output.totalFrames)
    const despawnPct = frameToPercent(cd.hatchCompleteTime * fps, output.totalFrames)

    const kfStops = [
      `${Math.max(0, pluckPct - 0.01).toFixed(2)}% { opacity: 0; transform: translate(${gridCenterX}px, ${gridCenterY}px); width: ${config.cellSize}px; height: ${config.cellSize}px; }`,
      `${pluckPct.toFixed(2)}% { opacity: 1; transform: translate(${gridCenterX}px, ${gridCenterY}px); fill: ${PLUCK_COLOR}; }`,
      `${travelStartPct.toFixed(2)}% { transform: translate(${gridCenterX}px, ${gridCenterY}px); fill: ${PLUCK_COLOR}; }`,
      `${travelEndPct.toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); fill: ${PLUCK_COLOR}; }`,
      `${hatchStartPct.toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); fill: ${INVADER_COLOR}; }`,
      `${Math.min(100, despawnPct).toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); fill: ${INVADER_COLOR}; opacity: 1; }`,
      `${Math.min(100, despawnPct + 0.01).toFixed(2)}% { opacity: 0; }`,
    ]

    cssRules.push(`@keyframes ${cellKfName} {\n  ${kfStops.join('\n  ')}\n}`)
    elements.push(
      `<rect class="lc" x="${-invHalf}" y="${-invHalf}" width="${config.invaderSize}" height="${config.invaderSize}" fill="${PLUCK_COLOR}" opacity="0" ` +
      `style="animation: ${cellKfName} ${dur}s linear infinite" />`
    )
  }

  // ── Formations + Invaders ──
  const waveSpawns = output.events.filter((e) => e.type === 'wave_spawn')
  for (const ws of waveSpawns) {
    const waveIdx = (ws.data as { waveIndex: number }).waveIndex
    const formationId = `formation-${waveIdx}`

    // Formation oscillation keyframes
    const fmKfPoints = formationKeyframes(formationId, output, config)
    const fmKfName = `osc-${waveIdx}`
    cssRules.push(oscillationKeyframes(fmKfName, fmKfPoints))

    const spawnPct = frameToPercent(ws.frame, output.totalFrames)
    const waveClear = output.events.find(
      (e) => e.type === 'wave_clear' && (e.data as { waveIndex: number }).waveIndex === waveIdx,
    )
    const clearPct = waveClear ? frameToPercent(waveClear.frame, output.totalFrames) : 100

    // Get invader state at spawn frame
    const spawnState = output.peek(ws.frame)
    const formation = spawnState.formations.find((f) => f.waveIndex === waveIdx)
    if (!formation) continue

    const invaderElements: string[] = []
    for (const inv of formation.invaders) {
      const { sx, sy } = simToScreen(inv.position.x, inv.position.y, config)
      const half = config.invaderSize / 2

      // Find destroy frame for this invader
      const invTimeline = output.getInflections(inv.id)
      const destroyIp = invTimeline.find((ip) => ip.type === 'destroy')
      const destroyPct = destroyIp ? frameToPercent(destroyIp.frame, output.totalFrames) : clearPct

      const invKfName = `inv-${inv.id.replace(/[^a-z0-9]/g, '-')}`
      cssRules.push(`@keyframes ${invKfName} {
  ${Math.max(0, spawnPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${spawnPct.toFixed(2)}% { opacity: 1; }
  ${Math.min(100, destroyPct).toFixed(2)}% { opacity: 1; }
  ${Math.min(100, destroyPct + 0.01).toFixed(2)}% { opacity: 0; }
}`)

      invaderElements.push(
        `<rect x="${sx - half}" y="${sy - half}" width="${config.invaderSize}" height="${config.invaderSize}" ` +
        `fill="${INVADER_COLOR}" opacity="0" style="animation: ${invKfName} ${dur}s linear infinite" />`
      )
    }

    // Formation group with oscillation
    elements.push(
      `<g style="animation: ${fmKfName} ${dur}s linear infinite">${invaderElements.join('')}</g>`
    )
  }

  // ── Lasers ──
  const laserData = laserTimings(output, config)
  for (const ld of laserData) {
    const spawnPct = (ld.spawnTime / dur) * 100
    const endPct = ((ld.spawnTime + ld.travelDuration) / dur) * 100
    const laserKfName = `lsr-${ld.laserId.replace(/[^a-z0-9]/g, '-')}`

    cssRules.push(`@keyframes ${laserKfName} {
  ${Math.max(0, spawnPct - 0.01).toFixed(2)}% { opacity: 0; transform: translateX(0); }
  ${spawnPct.toFixed(2)}% { opacity: 1; transform: translateX(0); }
  ${Math.min(100, endPct).toFixed(2)}% { opacity: 1; transform: translateX(${ld.travelDistance}px); }
  ${Math.min(100, endPct + 0.01).toFixed(2)}% { opacity: 0; }
}`)

    const half = config.laserWidth / 2
    elements.push(
      `<rect x="${ld.screenX - half}" y="${ld.screenY - half}" width="${config.laserWidth}" height="${config.laserWidth}" ` +
      `fill="${LASER_COLOR}" opacity="0" style="animation: ${laserKfName} ${dur}s linear infinite" />`
    )
  }

  // ── Ship ──
  const shipKfPoints = shipKeyframes(output, config)
  if (shipKfPoints.length > 0) {
    const shipStops = shipKfPoints.map((p) => {
      const pct = (p.time / dur) * 100
      return `${pct.toFixed(2)}% { transform: translate(${p.screenX.toFixed(1)}px, ${p.screenY.toFixed(1)}px); }`
    })
    cssRules.push(`@keyframes ship-move {\n  ${shipStops.join('\n  ')}\n}`)

    const half = config.invaderSize / 2
    elements.push(
      `<rect class="ship" x="${-half}" y="${-half}" width="${config.invaderSize}" height="${config.invaderSize}" ` +
      `fill="${SHIP_COLOR}" style="animation: ship-move ${dur}s linear infinite" />`
    )
  }

  // ── Assemble SVG ──
  const css = cssRules.join('\n\n')

  return `<svg viewBox="0 0 ${screenW} ${screenH}" width="${screenW}" height="${screenH}" xmlns="http://www.w3.org/2000/svg">
<style>
${css}
</style>
${elements.join('\n')}
</svg>`
}

/**
 * Generate animated SVG from grid data and seed.
 * Convenience function that runs simulation + composition.
 */
export function generateAnimatedSvg(
  grid: Grid,
  seed: string,
  config: SimConfig,
): string {
  const lastDate = grid.cells.reduce((max, c) => (c.date > max ? c.date : max), '')
  const scoreboard = computeScoreboard(grid, lastDate, grid.width * 7, 10)
  return composeSvg({ grid, seed, config, scoreboard })
}
