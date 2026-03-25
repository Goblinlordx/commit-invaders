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
  const STATUS_BAR_HEIGHT = 20
  const screenW = config.playArea.height + RENDER_MARGIN * 2
  const gameAreaH = config.playArea.width + RENDER_MARGIN * 2
  const screenH = gameAreaH + STATUS_BAR_HEIGHT
  const stride = config.cellSize + config.cellGap
  const gridOffX = screenW - config.gridArea.height - RENDER_MARGIN
  const gridOffY = RENDER_MARGIN + (config.playArea.width - config.gridArea.width) / 2

  const elements: string[] = []
  const cssRules: string[] = []

  // ── Shared keyframes ──
  cssRules.push(sharedKeyframes())

  // ── Background ──
  elements.push(`<rect width="${screenW}" height="${screenH}" fill="${BG_COLOR}" />`)

  // ── Compute ending timeline (needed for grid cell restoration) ──
  const gameEndEvent = output.events.find((e) => e.type === 'game_end')
  let resetRestorePct = 100 // default: end of animation
  if (gameEndEvent) {
    const wc = config.waveConfig
    const blackoutEndFrame = gameEndEvent.frame + wc.endingFadeoutDuration +
      wc.endingScoreDuration + wc.endingScoreOutDuration +
      wc.endingBoardInDuration + wc.endingHoldDuration + wc.endingBlackoutDuration
    // Cells restore midway through reset phase
    const restoreFrame = blackoutEndFrame + Math.floor(wc.endingResetDuration * 0.5)
    resetRestorePct = frameToPercent(restoreFrame, output.totalFrames)
  }

  // ── Grid cells (background layer) ──
  // Build pluck-time lookup for cells that get plucked (so they despawn)
  const cellData = cellLifecycleTimings(output, config)
  const pluckTimeByCell = new Map<string, number>()
  for (const cd of cellData) {
    // cellId format: "cell-{x}-{y}" → grid key "{x},{y}"
    const parts = cd.cellId.split('-')
    pluckTimeByCell.set(`${parts[1]},${parts[2]}`, cd.pluckTime)
  }

  for (const cell of grid.cells) {
    const color = GRID_COLORS[cell.level] ?? GRID_COLORS[0]!
    const x = gridOffX + cell.x * stride
    const y = gridOffY + cell.y * stride
    const pluckTime = pluckTimeByCell.get(`${cell.x},${cell.y}`)

    if (pluckTime !== undefined) {
      // This cell gets plucked — fade out over ~2.5s, restore with fade during ending reset
      const fadeSec = 2.5
      const fadePct = (fadeSec / dur) * 100
      const pluckPct = (pluckTime / dur) * 100
      const fadeOutStart = Math.max(0, pluckPct - fadePct)
      const restoreFadeEnd = Math.min(100, resetRestorePct + fadePct)
      const gcKfName = `gc-hide-${cell.x}-${cell.y}`
      cssRules.push(`@keyframes ${gcKfName} {
  ${fadeOutStart.toFixed(2)}% { opacity: 1; }
  ${pluckPct.toFixed(2)}% { opacity: 0; }
  ${resetRestorePct.toFixed(2)}% { opacity: 0; }
  ${restoreFadeEnd.toFixed(2)}% { opacity: 1; }
}`)
      elements.push(
        `<rect class="gc" x="${x}" y="${y}" width="${config.cellSize}" height="${config.cellSize}" fill="${color}" ` +
        `style="animation: ${gcKfName} ${dur}s linear infinite" />`
      )
    } else {
      elements.push(`<rect class="gc" x="${x}" y="${y}" width="${config.cellSize}" height="${config.cellSize}" fill="${color}" />`)
    }
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

  // ── Lasers (despawn on hit or out-of-bounds) ──
  const laserData = laserTimings(output, config)
  for (const ld of laserData) {
    const spawnPct = (ld.spawnTime / dur) * 100
    const despawnPct = (ld.despawnTime / dur) * 100
    const laserKfName = `lsr-${ld.laserId.replace(/[^a-z0-9]/g, '-')}`

    cssRules.push(`@keyframes ${laserKfName} {
  ${Math.max(0, spawnPct - 0.01).toFixed(2)}% { opacity: 0; transform: translateX(0); }
  ${spawnPct.toFixed(2)}% { opacity: 1; transform: translateX(0); }
  ${Math.min(100, despawnPct).toFixed(2)}% { opacity: 1; transform: translateX(${ld.despawnDistance.toFixed(1)}px); }
  ${Math.min(100, despawnPct + 0.01).toFixed(2)}% { opacity: 0; }
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
    // Initial ship position (screen coords)
    const shipInitX = RENDER_MARGIN + config.playArea.height - config.shipY
    const shipInitY = RENDER_MARGIN + config.playArea.width / 2

    // Build movement keyframe stops with opacity for ending fade
    const shipStops: string[] = []

    // Hold at initial position until first movement
    const firstPoint = shipKfPoints[0]!
    const firstPct = (firstPoint.time / dur) * 100
    if (firstPct > 0.02) {
      shipStops.push(`0% { transform: translate(${shipInitX.toFixed(1)}px, ${shipInitY.toFixed(1)}px); opacity: 1; }`)
      shipStops.push(`${(firstPct - 0.01).toFixed(2)}% { transform: translate(${shipInitX.toFixed(1)}px, ${shipInitY.toFixed(1)}px); opacity: 1; }`)
    }

    // Movement stops
    for (const p of shipKfPoints) {
      const pct = (p.time / dur) * 100
      shipStops.push(`${pct.toFixed(2)}% { transform: translate(${p.screenX.toFixed(1)}px, ${p.screenY.toFixed(1)}px); opacity: 1; }`)
    }

    // Ending fade: ship fades out during ending_fadeout, stays hidden, restores at reset
    if (gameEndEvent) {
      const wc = config.waveConfig
      const fadeStartPct = frameToPercent(gameEndEvent.frame, output.totalFrames)
      const fadeEndPct = frameToPercent(gameEndEvent.frame + wc.endingFadeoutDuration, output.totalFrames)
      const resetStartPct = resetRestorePct
      const resetEndPct = Math.min(100, resetRestorePct + (2.5 / dur) * 100)
      shipStops.push(`${fadeStartPct.toFixed(2)}% { opacity: 1; }`)
      shipStops.push(`${fadeEndPct.toFixed(2)}% { opacity: 0; transform: translate(${shipInitX.toFixed(1)}px, ${shipInitY.toFixed(1)}px); }`)
      shipStops.push(`${resetStartPct.toFixed(2)}% { opacity: 0; transform: translate(${shipInitX.toFixed(1)}px, ${shipInitY.toFixed(1)}px); }`)
      shipStops.push(`${resetEndPct.toFixed(2)}% { opacity: 1; transform: translate(${shipInitX.toFixed(1)}px, ${shipInitY.toFixed(1)}px); }`)
    }

    cssRules.push(`@keyframes ship-move {\n  ${shipStops.join('\n  ')}\n}`)

    const half = config.invaderSize / 2
    elements.push(
      `<rect class="ship" x="${-half}" y="${-half}" width="${config.invaderSize}" height="${config.invaderSize}" ` +
      `fill="${SHIP_COLOR}" style="animation: ship-move ${dur}s linear infinite" />`
    )
  }

  // ── Wave Labels ("WAVE N/M") ──
  // Show after previous wave is cleared (or from start for wave 1) until next wave spawns
  const totalWaves = waveSpawns.length
  const waveSpawnFrames = waveSpawns.map((ws) => ws.frame)
  for (let wi = 0; wi < waveSpawns.length; wi++) {
    const spawnFrame = waveSpawnFrames[wi]!
    // Start: after previous wave clear (or frame 0 for wave 1)
    let labelStart: number
    if (wi === 0) {
      labelStart = 0
    } else {
      const prevClear = output.events.find(
        (e) => e.type === 'wave_clear' && (e.data as { waveIndex: number }).waveIndex === wi - 1,
      )
      labelStart = prevClear ? prevClear.frame : 0
    }
    // End: when this wave spawns (invaders appear)
    const labelEnd = spawnFrame
    const startPct = frameToPercent(labelStart, output.totalFrames)
    const endPct = frameToPercent(labelEnd, output.totalFrames)

    const waveLabelKf = `wave-label-${wi}`
    cssRules.push(`@keyframes ${waveLabelKf} {
  ${Math.max(0, startPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${startPct.toFixed(2)}% { opacity: 1; }
  ${endPct.toFixed(2)}% { opacity: 1; }
  ${Math.min(100, endPct + 0.01).toFixed(2)}% { opacity: 0; }
}`)
    elements.push(
      `<text x="${screenW / 2}" y="${gameAreaH / 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="16" fill="#e6edf3" opacity="0" ` +
      `style="animation: ${waveLabelKf} ${dur}s linear infinite">WAVE ${wi + 1}/${totalWaves}</text>`
    )
  }

  // ── Status Bar ──
  const statusY = gameAreaH + STATUS_BAR_HEIGHT / 2 + 1
  const finalScore = output.finalScore

  // Status bar background
  elements.push(`<rect x="0" y="${gameAreaH}" width="${screenW}" height="${STATUS_BAR_HEIGHT}" fill="#161b22" />`)

  // Wave label (left): "READY" → "WAVE N/M" at each wave spawn → "READY" at reset
  // Score label (right): increments at each hit event
  // Since CSS can't change text, we layer text elements that show/hide at the right times

  // Collect score change points: at each hit, wave_spawn, wave_clear, game_end
  const scoreChangeFrames: { frame: number; score: number }[] = []
  scoreChangeFrames.push({ frame: 0, score: 0 })
  for (const ev of output.events) {
    if (ev.type === 'hit' || ev.type === 'wave_spawn' || ev.type === 'wave_clear') {
      const state = output.peek(ev.frame)
      scoreChangeFrames.push({ frame: ev.frame, score: state.score })
    }
  }
  if (gameEndEvent) {
    scoreChangeFrames.push({ frame: gameEndEvent.frame, score: finalScore })
  }
  // Deduplicate by frame, keep last score per frame
  const scoreByFrame = new Map<number, number>()
  for (const sc of scoreChangeFrames) scoreByFrame.set(sc.frame, sc.score)
  const sortedScoreFrames = [...scoreByFrame.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([frame, score]) => ({ frame, score }))

  // Score text layers (right side)
  function fmtScore(n: number): string {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
    if (n >= 1e5) return (n / 1e3).toFixed(1) + 'k'
    if (n >= 1e4) return (n / 1e3).toFixed(2) + 'k'
    return String(n)
  }

  // Deduplicate by score value — only create a new layer when score text changes
  const scoreLayers: { score: number; startFrame: number; endFrame: number }[] = []
  for (let i = 0; i < sortedScoreFrames.length; i++) {
    const cur = sortedScoreFrames[i]!
    const next = sortedScoreFrames[i + 1]
    const endFrame = next ? next.frame : output.totalFrames
    if (scoreLayers.length > 0 && scoreLayers[scoreLayers.length - 1]!.score === cur.score) {
      scoreLayers[scoreLayers.length - 1]!.endFrame = endFrame
    } else {
      scoreLayers.push({ score: cur.score, startFrame: cur.frame, endFrame: endFrame })
    }
  }

  // Ending fadeout frame for status bar
  const endingFadeoutStart = gameEndEvent ? gameEndEvent.frame : output.totalFrames
  const endingFadeoutEnd = gameEndEvent ? gameEndEvent.frame + config.waveConfig.endingFadeoutDuration : output.totalFrames

  for (let i = 0; i < scoreLayers.length; i++) {
    const layer = scoreLayers[i]!
    const startPct = frameToPercent(layer.startFrame, output.totalFrames)
    const endPct = frameToPercent(Math.min(layer.endFrame, endingFadeoutEnd), output.totalFrames)
    // Clamp to ending fadeout
    if (startPct >= frameToPercent(endingFadeoutEnd, output.totalFrames)) continue
    const kfName = `score-${i}`
    cssRules.push(`@keyframes ${kfName} {
  ${Math.max(0, startPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${startPct.toFixed(2)}% { opacity: 1; }
  ${endPct.toFixed(2)}% { opacity: 1; }
  ${Math.min(100, endPct + 0.01).toFixed(2)}% { opacity: 0; }
}`)
    elements.push(
      `<text x="${screenW - 8}" y="${statusY}" text-anchor="end" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="12" fill="#39d353" opacity="0" ` +
      `style="animation: ${kfName} ${dur}s linear infinite">${fmtScore(layer.score)} COMMITS</text>`
    )
  }

  // Wave label layers (left side): "READY" before first wave, "WAVE N/M" during each wave
  // "READY" at start
  const firstWaveLifecycleStart = waveSpawns.length > 0
    ? Math.max(0, waveSpawnFrames[0]! - (config.waveConfig.brightenDuration + config.waveConfig.pluckDuration +
        config.waveConfig.darkenDuration + config.waveConfig.travelDuration + config.waveConfig.hatchDuration))
    : output.totalFrames
  const readyStartPct = 0
  const readyEndPct = frameToPercent(firstWaveLifecycleStart, output.totalFrames)
  cssRules.push(`@keyframes status-ready-start {
  0% { opacity: 1; }
  ${readyEndPct.toFixed(2)}% { opacity: 1; }
  ${Math.min(100, readyEndPct + 0.01).toFixed(2)}% { opacity: 0; }
  100% { opacity: 0; }
}`)
  elements.push(
    `<text x="8" y="${statusY}" dominant-baseline="middle" ` +
    `font-family="monospace" font-size="11" fill="#8b949e" ` +
    `style="animation: status-ready-start ${dur}s linear infinite">READY</text>`
  )

  // "WAVE N/M" for each wave — visible from wave spawn to wave clear
  for (let wi = 0; wi < waveSpawns.length; wi++) {
    const spawnFrame = waveSpawnFrames[wi]!
    const waveClear = output.events.find(
      (e) => e.type === 'wave_clear' && (e.data as { waveIndex: number }).waveIndex === wi,
    )
    const clearFrame = waveClear ? waveClear.frame : (gameEndEvent ? gameEndEvent.frame : output.totalFrames)
    const endFrame = Math.min(clearFrame, endingFadeoutEnd)
    const spawnPct = frameToPercent(spawnFrame, output.totalFrames)
    const endPct = frameToPercent(endFrame, output.totalFrames)
    const waveKf = `status-wave-${wi}`
    cssRules.push(`@keyframes ${waveKf} {
  ${Math.max(0, spawnPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${spawnPct.toFixed(2)}% { opacity: 1; }
  ${endPct.toFixed(2)}% { opacity: 1; }
  ${Math.min(100, endPct + 0.01).toFixed(2)}% { opacity: 0; }
}`)
    elements.push(
      `<text x="8" y="${statusY}" dominant-baseline="middle" ` +
      `font-family="monospace" font-size="11" fill="#8b949e" opacity="0" ` +
      `style="animation: ${waveKf} ${dur}s linear infinite">WAVE ${wi + 1}/${totalWaves}</text>`
    )
  }

  // "READY" during ending_reset (fade in with reset)
  if (gameEndEvent) {
    const resetStartPct = resetRestorePct
    const resetEndPct = Math.min(100, resetRestorePct + (2.5 / dur) * 100)
    cssRules.push(`@keyframes status-ready-reset {
  ${Math.max(0, resetStartPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${resetEndPct.toFixed(2)}% { opacity: 1; }
}`)
    elements.push(
      `<text x="8" y="${statusY}" dominant-baseline="middle" ` +
      `font-family="monospace" font-size="11" fill="#8b949e" opacity="0" ` +
      `style="animation: status-ready-reset ${dur}s linear infinite">READY</text>`
    )
    // "0 COMMITS" during reset
    cssRules.push(`@keyframes status-score-reset {
  ${Math.max(0, resetStartPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${resetEndPct.toFixed(2)}% { opacity: 1; }
}`)
    elements.push(
      `<text x="${screenW - 8}" y="${statusY}" text-anchor="end" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="12" fill="#39d353" opacity="0" ` +
      `style="animation: status-score-reset ${dur}s linear infinite">0 COMMITS</text>`
    )
  }

  // ── Ending: Score Display ("N COMMITS") ──
  if (gameEndEvent) {
    const endFrame = gameEndEvent.frame
    const wc = config.waveConfig
    const scoreStartFrame = endFrame + wc.endingFadeoutDuration
    const scoreEndFrame = scoreStartFrame + wc.endingScoreDuration
    const scoreOutEndFrame = scoreEndFrame + wc.endingScoreOutDuration
    const boardInFrame = scoreOutEndFrame
    const boardEndFrame = boardInFrame + wc.endingBoardInDuration + wc.endingHoldDuration
    const blackoutEndFrame = boardEndFrame + wc.endingBlackoutDuration
    const resetEndFrame = blackoutEndFrame + wc.endingResetDuration

    // Score text
    const scoreStartPct = frameToPercent(scoreStartFrame, output.totalFrames)
    const scoreEndPct = frameToPercent(scoreEndFrame, output.totalFrames)
    const scoreOutPct = frameToPercent(scoreOutEndFrame, output.totalFrames)
    const scoreKf = 'ending-score-text'
    cssRules.push(`@keyframes ${scoreKf} {
  ${Math.max(0, scoreStartPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${(scoreStartPct + (scoreEndPct - scoreStartPct) * 0.15).toFixed(2)}% { opacity: 1; }
  ${scoreEndPct.toFixed(2)}% { opacity: 1; }
  ${scoreOutPct.toFixed(2)}% { opacity: 0; }
}`)
    const scoreText = `${fmtScore(finalScore)} COMMITS`
    elements.push(
      `<g style="animation: wiggle-score 0.6s ease-in-out infinite">` +
      `<text x="${screenW / 2}" y="${gameAreaH / 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="14" fill="#39d353" opacity="0" ` +
      `style="animation: ${scoreKf} ${dur}s linear infinite">${scoreText}</text></g>`
    )

    // Scoreboard
    if (options.scoreboard && options.scoreboard.entries.length > 0) {
      const boardStartPct = frameToPercent(boardInFrame, output.totalFrames)
      const boardHoldPct = frameToPercent(boardEndFrame, output.totalFrames)
      const boardFadePct = frameToPercent(boardEndFrame + wc.endingBlackoutDuration, output.totalFrames)
      const boardKf = 'ending-board'
      cssRules.push(`@keyframes ${boardKf} {
  ${Math.max(0, boardStartPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${frameToPercent(boardInFrame + wc.endingBoardInDuration, output.totalFrames).toFixed(2)}% { opacity: 1; }
  ${boardHoldPct.toFixed(2)}% { opacity: 1; }
  ${Math.min(100, boardFadePct).toFixed(2)}% { opacity: 0; }
}`)

      const boardElements: string[] = []
      boardElements.push(
        `<text x="${screenW / 2}" y="12" text-anchor="middle" dominant-baseline="middle" ` +
        `font-family="monospace" font-weight="bold" font-size="10" fill="#39d353">HIGH SCORES</text>`
      )

      if (options.scoreboard.isNewHighScore) {
        boardElements.push(
          `<text x="${screenW / 2}" y="24" text-anchor="middle" dominant-baseline="middle" ` +
          `font-family="monospace" font-weight="bold" font-size="8" fill="#ffff00">★ NEW HIGH SCORE! ★</text>`
        )
      }

      const entryStartY = options.scoreboard.isNewHighScore ? 36 : 26
      for (let i = 0; i < options.scoreboard.entries.length; i++) {
        const entry = options.scoreboard.entries[i]!
        const col = i < 5 ? 0 : 1
        const row = i < 5 ? i : i - 5
        const colX = col === 0 ? screenW * 0.25 : screenW * 0.75
        const y = entryStartY + row * 11
        const isCurrent = entry.isCurrent
        const rankColor = isCurrent ? '#ffff00' : '#8b949e'
        const dateColor = isCurrent ? '#e6edf3' : '#8b949e'
        const scoreColor = isCurrent ? '#39d353' : '#58a6ff'
        const fw = isCurrent ? 'bold' : 'normal'

        boardElements.push(
          `<text x="${colX - 50}" y="${y}" font-family="monospace" font-weight="${fw}" font-size="8" fill="${rankColor}">${String(entry.rank).padStart(2, ' ')}.</text>` +
          `<text x="${colX - 35}" y="${y}" font-family="monospace" font-weight="${fw}" font-size="8" fill="${dateColor}">${entry.date}</text>` +
          `<text x="${colX + 55}" y="${y}" text-anchor="end" font-family="monospace" font-weight="${fw}" font-size="8" fill="${scoreColor}">${fmtScore(entry.score)}</text>`
        )
      }

      elements.push(
        `<g opacity="0" style="animation: ${boardKf} ${dur}s linear infinite">${boardElements.join('')}</g>`
      )
    }

    // Blackout overlay
    const blackoutStartPct = frameToPercent(boardEndFrame, output.totalFrames)
    const blackoutFullPct = frameToPercent(blackoutEndFrame, output.totalFrames)
    const resetDonePct = frameToPercent(resetEndFrame, output.totalFrames)
    const blackoutKf = 'ending-blackout'
    cssRules.push(`@keyframes ${blackoutKf} {
  ${Math.max(0, blackoutStartPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${blackoutFullPct.toFixed(2)}% { opacity: 1; }
  ${Math.min(100, resetDonePct).toFixed(2)}% { opacity: 0; }
}`)
    elements.push(
      `<rect x="0" y="0" width="${screenW}" height="${screenH}" fill="#000000" opacity="0" ` +
      `style="animation: ${blackoutKf} ${dur}s linear infinite" />`
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
