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
  PALETTE_DARK,
  type ColorPalette,
} from './entity-templates.js'

const RENDER_MARGIN = 10

/**
 * Build a CSS @keyframes string with proper bookended visibility windows.
 * Each window is a [showPct, hidePct] pair where the element is visible.
 * CSS interpolates between stops, so we need explicit opacity:0 stops
 * on BOTH sides of every gap to prevent gradual fade-in/out.
 *
 * @param name - Keyframe name
 * @param windows - Array of [showPct, hidePct] visibility windows (0-100)
 * @param extraStops - Optional additional stops (e.g., transform) keyed by percent
 */
function visibilityKeyframes(
  name: string,
  windows: [number, number][],
  extraStops?: Map<number, string>,
): string {
  // Collect all percent→opacity entries
  const stops = new Map<number, number>()
  const EPSILON = 0.01

  // Determine if any window touches the boundaries
  let startsAt0 = false
  let endsAt100 = false

  for (const [show, hide] of windows) {
    if (show <= EPSILON) startsAt0 = true
    if (hide >= 100 - EPSILON) endsAt100 = true
  }

  // Start hidden (unless a window starts at 0)
  if (!startsAt0) stops.set(0, 0)

  for (const [show, hide] of windows) {
    // Just before show: ensure hidden
    const beforeShow = Math.max(0, show - EPSILON)
    if (!stops.has(beforeShow) && show > EPSILON) stops.set(beforeShow, 0)
    // Show
    stops.set(show, 1)
    // Hold visible until hide
    stops.set(hide, 1)
    // Just after hide: hidden
    if (hide < 100 - EPSILON) {
      const afterHide = Math.min(100, hide + EPSILON)
      if (!stops.has(afterHide)) stops.set(afterHide, 0)
    }
  }

  // End hidden (unless a window ends at 100)
  if (!endsAt100) stops.set(100, 0)

  // Merge and sort
  const sorted = [...stops.entries()].sort((a, b) => a[0] - b[0])

  // Build stops with optional extra properties
  const lines = sorted.map(([pct, opacity]) => {
    const extra = extraStops?.get(pct) ?? ''
    return `  ${pct.toFixed(2)}% { opacity: ${opacity};${extra ? ' ' + extra : ''} }`
  })

  return `@keyframes ${name} {\n${lines.join('\n')}\n}`
}

function simToScreen(simX: number, simY: number, config: SimConfig): { sx: number; sy: number } {
  return {
    sx: RENDER_MARGIN + config.playArea.height - simY,
    sy: RENDER_MARGIN + simX,
  }
}

import type { RenderMode } from './sprites.js'
import { spriteDefs, invaderSpriteId, explosionKeyframes, explosionCss } from './sprites.js'

export interface CompositeSvgOptions {
  grid: Grid
  seed: string
  config: SimConfig
  renderMode?: RenderMode
  scoreboard?: ScoreboardResult
  palette?: ColorPalette
}

/**
 * Generate the complete animated SVG from simulation data.
 */
export function composeSvg(options: CompositeSvgOptions): string {
  const { grid, seed, config, renderMode = 'styled', palette: pal = PALETTE_DARK } = options
  const styled = renderMode === 'styled'
  // Color aliases from palette
  const BG_COLOR = pal.bg
  const PLUCK_COLOR = pal.pluck
  const INVADER_COLOR = pal.invader
  const LASER_COLOR = pal.laser
  const SHIP_COLOR = pal.ship
  const GRID_COLORS = pal.grid
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

  // Intro scoreboard total duration (used by ship/status bar to stay hidden during intro)
  const introTotal = config.waveConfig.introScoreboardFadeIn + config.waveConfig.introScoreboardHold + config.waveConfig.introScoreboardFadeOut

  const elements: string[] = []
  const cssRules: string[] = []

  // Class-based animation helper — enables CSS scrubbing via !important overrides.
  // Instead of inline ${anim(`...`)}, each element gets a class with the
  // animation rule in the <style> block.
  let animId = 0
  /** Returns class="aX" attribute string. Pass extra classes to merge. */
  function anim(animation: string, extraClasses?: string): string {
    const cls = `a${animId++}`
    // Use longhand properties instead of shorthand so animation-delay
    // can be overridden by !important for scrubbing
    const parts = animation.split(' ')
    const name = parts[0]!
    const duration = parts[1] ?? '0s'
    const timing = parts[2] ?? 'linear'
    const iteration = parts[3] ?? 'infinite'
    cssRules.push(`.${cls} { animation-name: ${name}; animation-duration: ${duration}; animation-timing-function: ${timing}; animation-iteration-count: ${iteration}; animation-fill-mode: both; }`)
    return extraClasses ? `class="${extraClasses} ${cls}"` : `class="${cls}"`
  }

  // ── Shared keyframes ──
  cssRules.push(sharedKeyframes())
  if (styled) {
    cssRules.push(explosionKeyframes())
    cssRules.push(explosionCss())
  }

  // ── Sprite defs (styled mode only) ──
  const defsBlock = styled ? spriteDefs(config.invaderSize, config.laserWidth) : ''

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
        `<rect x="${x}" y="${y}" width="${config.cellSize}" height="${config.cellSize}" fill="${color}" ` +
        `${anim(`${gcKfName} ${dur}s linear infinite`, 'gc')} />`
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
    `<rect x="0" y="0" width="${screenW}" height="${screenH}" fill="${BG_COLOR}" ` +
    `${anim(`${overlayKfName} ${dur}s linear infinite`, 'overlay')} />`
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
      `0.00% { opacity: 0; }`,
      `${Math.max(0, pluckPct - 0.01).toFixed(2)}% { opacity: 0; transform: translate(${gridCenterX}px, ${gridCenterY}px); }`,
      `${pluckPct.toFixed(2)}% { opacity: 1; transform: translate(${gridCenterX}px, ${gridCenterY}px); fill: ${PLUCK_COLOR}; }`,
      `${travelStartPct.toFixed(2)}% { transform: translate(${gridCenterX}px, ${gridCenterY}px); fill: ${PLUCK_COLOR}; }`,
      `${travelEndPct.toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); fill: ${PLUCK_COLOR}; }`,
      `${hatchStartPct.toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); fill: ${INVADER_COLOR}; }`,
      `${Math.min(100, despawnPct).toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); fill: ${INVADER_COLOR}; opacity: 1; }`,
      `${Math.min(100, despawnPct + 0.01).toFixed(2)}% { opacity: 0; }`,
      `100.00% { opacity: 0; }`,
    ]

    cssRules.push(`@keyframes ${cellKfName} {\n  ${kfStops.join('\n  ')}\n}`)

    if (styled) {
      // Pluck rect (visible during pluck+travel, hidden at hatch)
      const pluckKfName = `lc-pluck-${cd.cellId.replace(/[^a-z0-9]/g, '-')}`
      const pluckStops = [
        `0.00% { opacity: 0; }`,
        `${Math.max(0, pluckPct - 0.01).toFixed(2)}% { opacity: 0; transform: translate(${gridCenterX}px, ${gridCenterY}px); }`,
        `${pluckPct.toFixed(2)}% { opacity: 1; transform: translate(${gridCenterX}px, ${gridCenterY}px); }`,
        `${travelStartPct.toFixed(2)}% { transform: translate(${gridCenterX}px, ${gridCenterY}px); }`,
        `${travelEndPct.toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); }`,
        `${hatchStartPct.toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); opacity: 1; }`,
        `${Math.min(100, hatchStartPct + 0.01).toFixed(2)}% { opacity: 0; }`,
        `100.00% { opacity: 0; }`,
      ]
      cssRules.push(`@keyframes ${pluckKfName} {\n  ${pluckStops.join('\n  ')}\n}`)
      elements.push(
        `<rect x="${-invHalf}" y="${-invHalf}" width="${config.invaderSize}" height="${config.invaderSize}" fill="${PLUCK_COLOR}" opacity="0" ` +
        `${anim(`${pluckKfName} ${dur}s linear infinite`)} />`
      )

      // Invader sprite (fades in at hatch, visible until despawn)
      // Get level from cell ID — need to find the matching cell in grid
      const parts = cd.cellId.split('-')
      const cellX = parseInt(parts[1]!, 10)
      const cellY = parseInt(parts[2]!, 10)
      const gridCell = grid.cells.find((c) => c.x === cellX && c.y === cellY)
      const level = gridCell ? gridCell.level : 1
      const spriteId = invaderSpriteId(level)

      const hatchKfName = `lc-hatch-${cd.cellId.replace(/[^a-z0-9]/g, '-')}`
      const hatchStops = [
        `0.00% { opacity: 0; }`,
        `${Math.max(0, hatchStartPct - 0.01).toFixed(2)}% { opacity: 0; transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); }`,
        `${hatchStartPct.toFixed(2)}% { opacity: 0; transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); }`,
        `${Math.min(100, (hatchStartPct + despawnPct) / 2).toFixed(2)}% { opacity: 1; transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); }`,
        `${Math.min(100, despawnPct).toFixed(2)}% { transform: translate(${cd.targetScreenX}px, ${cd.targetScreenY}px); opacity: 1; }`,
        `${Math.min(100, despawnPct + 0.01).toFixed(2)}% { opacity: 0; }`,
        `100.00% { opacity: 0; }`,
      ]
      cssRules.push(`@keyframes ${hatchKfName} {\n  ${hatchStops.join('\n  ')}\n}`)
      elements.push(
        `<use href="#${spriteId}" x="${-invHalf}" y="${-invHalf}" width="${config.invaderSize}" height="${config.invaderSize}" opacity="0" ` +
        `${anim(`${hatchKfName} ${dur}s linear infinite`)} />`
      )
    } else {
      elements.push(
        `<rect x="${-invHalf}" y="${-invHalf}" width="${config.invaderSize}" height="${config.invaderSize}" fill="${PLUCK_COLOR}" opacity="0" ` +
        `${anim(`${cellKfName} ${dur}s linear infinite`, 'lc')} />`
      )
    }
  }

  // ── Formations + Invaders ──
  const explosionData: { startPct: number; endPct: number; cx: number; cy: number }[] = []
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
      cssRules.push(visibilityKeyframes(invKfName, [[spawnPct, Math.min(100, destroyPct)]]))

      if (styled) {
        const spriteId = invaderSpriteId(inv.cell.level)
        // Invader sprite + explosion on destroy
        invaderElements.push(
          `<use href="#${spriteId}" x="${sx - half}" y="${sy - half}" width="${config.invaderSize}" height="${config.invaderSize}" ` +
          `opacity="0" ${anim(`${invKfName} ${dur}s linear infinite`)} />`
        )
        // Collect explosion data for pooling (placed outside formation group)
        if (destroyIp) {
          const destroyState = output.peek(destroyIp.frame)
          const destroyFormation = destroyState.formations.find((f) => f.waveIndex === waveIdx)
          const destroyInv = destroyFormation?.invaders.find((i) => i.id === inv.id)
          if (destroyInv) {
            const { sx: dsx, sy: dsy } = simToScreen(
              destroyInv.position.x + (destroyFormation?.offset.x ?? 0),
              destroyInv.position.y + (destroyFormation?.offset.y ?? 0),
              config,
            )
            const startPct = frameToPercent(destroyIp.frame, output.totalFrames)
            explosionData.push({
              startPct,
              endPct: Math.min(100, startPct + (0.3 / dur) * 100),
              cx: dsx,
              cy: dsy,
            })
          }
        }
      } else {
        invaderElements.push(
          `<rect x="${sx - half}" y="${sy - half}" width="${config.invaderSize}" height="${config.invaderSize}" ` +
          `fill="${INVADER_COLOR}" opacity="0" ${anim(`${invKfName} ${dur}s linear infinite`)} />`
        )
      }
    }

    // Formation group with oscillation
    elements.push(
      `<g ${anim(`${fmKfName} ${dur}s linear infinite`)}>${invaderElements.join('')}</g>`
    )
  }

  // ── Explosions (pooled, outside formation groups) ──
  // ── Explosions (individual, absolute positions) ──
  // Each explosion is a <g> translated to the destroy position, with
  // opacity + scale animated via CSS. Using transform on <g> is reliable
  // across browsers (unlike animating x/y/width on <use>).
  if (styled) {
    const s = config.invaderSize
    const half = s / 2
    for (let i = 0; i < explosionData.length; i++) {
      const ev = explosionData[i]!
      const kfName = `exp-${i}`
      const mid = (ev.startPct + ev.endPct) / 2
      cssRules.push(`@keyframes ${kfName} {
  0.00% { opacity: 0; transform: translate(${ev.cx.toFixed(1)}px, ${ev.cy.toFixed(1)}px) scale(1); }
  ${Math.max(0, ev.startPct - 0.01).toFixed(2)}% { opacity: 0; transform: translate(${ev.cx.toFixed(1)}px, ${ev.cy.toFixed(1)}px) scale(1); }
  ${ev.startPct.toFixed(2)}% { opacity: 1; transform: translate(${ev.cx.toFixed(1)}px, ${ev.cy.toFixed(1)}px) scale(1); }
  ${mid.toFixed(2)}% { opacity: 0.7; transform: translate(${ev.cx.toFixed(1)}px, ${ev.cy.toFixed(1)}px) scale(1.8); }
  ${ev.endPct.toFixed(2)}% { opacity: 0; transform: translate(${ev.cx.toFixed(1)}px, ${ev.cy.toFixed(1)}px) scale(2.5); }
  ${Math.min(100, ev.endPct + 0.01).toFixed(2)}% { opacity: 0; }
  100.00% { opacity: 0; }
}`)
      elements.push(
        `<use href="#sprite-explosion" x="${-half}" y="${-half}" width="${s}" height="${s}" ` +
        `opacity="0" ${anim(`${kfName} ${dur}s linear infinite`)} />`
      )
    }
  }

  // ── Lasers (individual) ──
  const laserData = laserTimings(output, config)
  for (const ld of laserData) {
    const spawnPct = (ld.spawnTime / dur) * 100
    const despawnPct = Math.min(100, (ld.despawnTime / dur) * 100)
    const laserKfName = `lsr-${ld.laserId.replace(/[^a-z0-9]/g, '-')}`

    const laserExtra = new Map<number, string>()
    laserExtra.set(spawnPct, `transform: translateX(0);`)
    laserExtra.set(despawnPct, `transform: translateX(${ld.despawnDistance.toFixed(1)}px);`)
    cssRules.push(visibilityKeyframes(laserKfName, [[spawnPct, despawnPct]], laserExtra))

    const half = config.laserWidth / 2
    if (styled) {
      elements.push(
        `<use href="#sprite-laser" x="${ld.screenX - half}" y="${ld.screenY - half}" width="${config.laserWidth}" height="${config.laserWidth}" ` +
        `opacity="0" ${anim(`${laserKfName} ${dur}s linear infinite`)} />`
      )
    } else {
      elements.push(
        `<rect x="${ld.screenX - half}" y="${ld.screenY - half}" width="${config.laserWidth}" height="${config.laserWidth}" ` +
        `fill="${LASER_COLOR}" opacity="0" ${anim(`${laserKfName} ${dur}s linear infinite`)} />`
      )
    }
  }

  // ── Ship ──
  const shipKfPoints = shipKeyframes(output, config)
  if (shipKfPoints.length > 0) {
    // Initial ship position (screen coords)
    const shipInitX = RENDER_MARGIN + config.playArea.height - config.shipY
    const shipInitY = RENDER_MARGIN + config.playArea.width / 2

    // Build movement keyframe stops with opacity for intro/ending transitions
    const shipStops: string[] = []
    const initTransform = `translate(${shipInitX.toFixed(1)}px, ${shipInitY.toFixed(1)}px)`

    // When intro scoreboard is active, ship starts hidden and fades in after it
    const firstPoint = shipKfPoints[0]!
    const firstPct = (firstPoint.time / dur) * 100
    if (introTotal > 0) {
      const introEndPct = frameToPercent(introTotal, output.totalFrames)
      const shipFadeInPct = Math.min(introEndPct + (1.0 / dur) * 100, firstPct - 0.01)
      shipStops.push(`0% { transform: ${initTransform}; opacity: 0; }`)
      shipStops.push(`${introEndPct.toFixed(2)}% { transform: ${initTransform}; opacity: 0; }`)
      shipStops.push(`${shipFadeInPct.toFixed(2)}% { transform: ${initTransform}; opacity: 1; }`)
      if (firstPct > shipFadeInPct + 0.02) {
        shipStops.push(`${(firstPct - 0.01).toFixed(2)}% { transform: ${initTransform}; opacity: 1; }`)
      }
    } else if (firstPct > 0.02) {
      shipStops.push(`0% { transform: ${initTransform}; opacity: 1; }`)
      shipStops.push(`${(firstPct - 0.01).toFixed(2)}% { transform: ${initTransform}; opacity: 1; }`)
    }

    // Movement stops
    for (const p of shipKfPoints) {
      const pct = (p.time / dur) * 100
      shipStops.push(`${pct.toFixed(2)}% { transform: translate(${p.screenX.toFixed(1)}px, ${p.screenY.toFixed(1)}px); opacity: 1; }`)
    }

    // Ending fade: ship fades out during ending_fadeout
    if (gameEndEvent) {
      const ewc = config.waveConfig
      const fadeStartPct = frameToPercent(gameEndEvent.frame, output.totalFrames)
      const fadeEndPct = frameToPercent(gameEndEvent.frame + ewc.endingFadeoutDuration, output.totalFrames)
      shipStops.push(`${fadeStartPct.toFixed(2)}% { opacity: 1; }`)
      shipStops.push(`${fadeEndPct.toFixed(2)}% { opacity: 0; transform: ${initTransform}; }`)
      if (introTotal > 0) {
        // Stay hidden through reset — loops back to intro scoreboard
        shipStops.push(`100% { opacity: 0; transform: ${initTransform}; }`)
      } else {
        // No intro: restore ship at reset for seamless loop
        const resetStartPct = resetRestorePct
        const resetEndPct = Math.min(100, resetRestorePct + (2.5 / dur) * 100)
        shipStops.push(`${resetStartPct.toFixed(2)}% { opacity: 0; transform: ${initTransform}; }`)
        shipStops.push(`${resetEndPct.toFixed(2)}% { opacity: 1; transform: ${initTransform}; }`)
      }
    }

    cssRules.push(`@keyframes ship-move {\n  ${shipStops.join('\n  ')}\n}`)

    const half = config.invaderSize / 2
    if (styled) {
      elements.push(
        `<use href="#sprite-ship" x="${-half}" y="${-half}" width="${config.invaderSize}" height="${config.invaderSize}" ` +
        `${anim(`ship-move ${dur}s linear infinite`)} />`
      )
    } else {
      elements.push(
        `<rect x="${-half}" y="${-half}" width="${config.invaderSize}" height="${config.invaderSize}" ` +
        `fill="${SHIP_COLOR}" ${anim(`ship-move ${dur}s linear infinite`, 'ship')} />`
      )
    }
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
    cssRules.push(visibilityKeyframes(waveLabelKf, [[startPct, endPct]]))
    elements.push(
      `<text x="${screenW / 2}" y="${gameAreaH / 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="16" fill="${pal.text}" opacity="0" ` +
      `${anim(`${waveLabelKf} ${dur}s linear infinite`)}>WAVE ${wi + 1}/${totalWaves}</text>`
    )
  }

  // ── Status Bar ──
  const statusY = gameAreaH + STATUS_BAR_HEIGHT / 2 + 1
  const finalScore = output.finalScore

  // Status bar background
  elements.push(`<rect x="0" y="${gameAreaH}" width="${screenW}" height="${STATUS_BAR_HEIGHT}" fill="${pal.bg}" />`)

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

  const fadeoutStartPct = frameToPercent(endingFadeoutStart, output.totalFrames)
  const fadeoutEndPct = frameToPercent(endingFadeoutEnd, output.totalFrames)

  for (let i = 0; i < scoreLayers.length; i++) {
    const layer = scoreLayers[i]!
    const startPct = frameToPercent(layer.startFrame, output.totalFrames)
    const rawEndPct = frameToPercent(layer.endFrame, output.totalFrames)
    // Skip layers that start after the fadeout
    if (startPct >= fadeoutEndPct) continue
    const kfName = `score-${i}`

    // If this layer spans the ending fadeout, add a gradual fade-out
    if (rawEndPct > fadeoutStartPct && gameEndEvent) {
      cssRules.push(`@keyframes ${kfName} {
  0.00% { opacity: 0; }
  ${Math.max(0, startPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${startPct.toFixed(2)}% { opacity: 1; }
  ${fadeoutStartPct.toFixed(2)}% { opacity: 1; }
  ${fadeoutEndPct.toFixed(2)}% { opacity: 0; }
  100.00% { opacity: 0; }
}`)
    } else {
      cssRules.push(visibilityKeyframes(kfName, [[startPct, Math.min(rawEndPct, fadeoutEndPct)]]))
    }
    elements.push(
      `<text x="${screenW - 8}" y="${statusY}" text-anchor="end" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="12" fill="${pal.scoreText}" opacity="0" ` +
      `${anim(`${kfName} ${dur}s linear infinite`)}>${fmtScore(layer.score)} COMMITS</text>`
    )
  }

  // ── Intro Scoreboard (shown at animation start) ──
  if (options.scoreboard && options.scoreboard.entries.length > 0 && introTotal > 0) {
    const wc = config.waveConfig
    const fp = (f: number) => frameToPercent(f, output.totalFrames)
    const boardVisiblePct = fp(wc.introScoreboardFadeIn)
    const boardHoldEndPct = fp(wc.introScoreboardFadeIn + wc.introScoreboardHold)
    const boardFadeOutPct = fp(introTotal)
    cssRules.push(`@keyframes intro-board {
  0.00% { opacity: 0; }
  ${boardVisiblePct.toFixed(2)}% { opacity: 1; }
  ${boardHoldEndPct.toFixed(2)}% { opacity: 1; }
  ${boardFadeOutPct.toFixed(2)}% { opacity: 0; }
  100.00% { opacity: 0; }
}`)

    const boardElements: string[] = []
    boardElements.push(
      `<text x="${screenW / 2}" y="12" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="10" fill="${pal.scoreText}">HIGH SCORES</text>`
    )

    if (options.scoreboard.isNewHighScore) {
      boardElements.push(
        `<text x="${screenW / 2}" y="24" text-anchor="middle" dominant-baseline="middle" ` +
        `font-family="monospace" font-weight="bold" font-size="8" fill="${pal.laser}">★ NEW HIGH SCORE! ★</text>`
      )
    }

    const entryStartY = options.scoreboard.isNewHighScore ? 36 : 26
    for (let i = 0; i < options.scoreboard.entries.length; i++) {
      const entry = options.scoreboard.entries[i]!
      const col = i < 5 ? 0 : 1
      const row = i < 5 ? i : i - 5
      const colX = col === 0 ? screenW * 0.35 : screenW * 0.65
      const y = entryStartY + row * 11
      const isCurrent = entry.isCurrent
      const rankColor = isCurrent ? pal.laser : pal.textMuted
      const dateColor = isCurrent ? pal.text : pal.textMuted
      const scoreColor = isCurrent ? pal.scoreText : pal.ship
      const fw = isCurrent ? 'bold' : 'normal'

      boardElements.push(
        `<text x="${colX - 50}" y="${y}" font-family="monospace" font-weight="${fw}" font-size="8" fill="${rankColor}">${String(entry.rank).padStart(2, ' ')}.</text>` +
        `<text x="${colX - 35}" y="${y}" font-family="monospace" font-weight="${fw}" font-size="8" fill="${dateColor}">${entry.date}</text>` +
        `<text x="${colX + 55}" y="${y}" text-anchor="end" font-family="monospace" font-weight="${fw}" font-size="8" fill="${scoreColor}">${fmtScore(entry.score)}</text>`
      )
    }

    elements.push(
      `<g opacity="0" ${anim(`intro-board ${dur}s linear infinite`)}>${boardElements.join('')}</g>`
    )
  }

  // Wave label layers (left side): "READY" before first wave, "WAVE N/M" during each wave
  // "READY" at start (after intro scoreboard fades out)
  const firstWaveLifecycleStart = waveSpawns.length > 0
    ? Math.max(0, waveSpawnFrames[0]! - (config.waveConfig.brightenDuration + config.waveConfig.pluckDuration +
        config.waveConfig.darkenDuration + config.waveConfig.travelDuration + config.waveConfig.hatchDuration))
    : output.totalFrames
  const readyStartPct = introTotal > 0 ? frameToPercent(introTotal, output.totalFrames) : 0
  const readyEndPct = frameToPercent(firstWaveLifecycleStart, output.totalFrames)
  cssRules.push(visibilityKeyframes('status-ready-start', [[0, readyEndPct]]))
  elements.push(
    `<text x="8" y="${statusY}" dominant-baseline="middle" ` +
    `font-family="monospace" font-size="11" fill="${pal.textMuted}" ` +
    `${anim(`status-ready-start ${dur}s linear infinite`)}>READY</text>`
  )

  // "WAVE N/M" for each wave — visible from wave spawn to wave clear
  for (let wi = 0; wi < waveSpawns.length; wi++) {
    const spawnFrame = waveSpawnFrames[wi]!
    const waveClear = output.events.find(
      (e) => e.type === 'wave_clear' && (e.data as { waveIndex: number }).waveIndex === wi,
    )
    const clearFrame = waveClear ? waveClear.frame : (gameEndEvent ? gameEndEvent.frame : output.totalFrames)
    const spawnPct = frameToPercent(spawnFrame, output.totalFrames)
    const waveKf = `status-wave-${wi}`

    // If this wave is active during ending, fade out gradually
    if (!waveClear && gameEndEvent) {
      cssRules.push(`@keyframes ${waveKf} {
  0.00% { opacity: 0; }
  ${Math.max(0, spawnPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${spawnPct.toFixed(2)}% { opacity: 1; }
  ${fadeoutStartPct.toFixed(2)}% { opacity: 1; }
  ${fadeoutEndPct.toFixed(2)}% { opacity: 0; }
  100.00% { opacity: 0; }
}`)
    } else {
      const endPct = frameToPercent(Math.min(clearFrame, endingFadeoutEnd), output.totalFrames)
      cssRules.push(visibilityKeyframes(waveKf, [[spawnPct, endPct]]))
    }
    elements.push(
      `<text x="8" y="${statusY}" dominant-baseline="middle" ` +
      `font-family="monospace" font-size="11" fill="${pal.textMuted}" opacity="0" ` +
      `${anim(`${waveKf} ${dur}s linear infinite`)}>WAVE ${wi + 1}/${totalWaves}</text>`
    )
  }

  // "READY" during ending_reset (fade in gradually with reset)
  // When intro scoreboard is active, don't restore — the next loop iteration
  // shows intro scoreboard first, then READY appears via status-ready-start
  if (gameEndEvent && introTotal === 0) {
    const resetStartPct = resetRestorePct
    const resetEndPct = Math.min(100, resetRestorePct + (2.5 / dur) * 100)
    // Fade in from resetStart to resetEnd, stay visible to 100%
    cssRules.push(`@keyframes status-ready-reset {
  0.00% { opacity: 0; }
  ${resetStartPct.toFixed(2)}% { opacity: 0; }
  ${resetEndPct.toFixed(2)}% { opacity: 1; }
  100.00% { opacity: 1; }
}`)
    elements.push(
      `<text x="8" y="${statusY}" dominant-baseline="middle" ` +
      `font-family="monospace" font-size="11" fill="${pal.textMuted}" opacity="0" ` +
      `${anim(`status-ready-reset ${dur}s linear infinite`)}>READY</text>`
    )
    // "0 COMMITS" during reset — same fade
    cssRules.push(`@keyframes status-score-reset {
  0.00% { opacity: 0; }
  ${resetStartPct.toFixed(2)}% { opacity: 0; }
  ${resetEndPct.toFixed(2)}% { opacity: 1; }
  100.00% { opacity: 1; }
}`)
    elements.push(
      `<text x="${screenW - 8}" y="${statusY}" text-anchor="end" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="12" fill="${pal.scoreText}" opacity="0" ` +
      `${anim(`status-score-reset ${dur}s linear infinite`)}>0 COMMITS</text>`
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

    // Helper: convert frame to percent
    const fp = (f: number) => frameToPercent(f, output.totalFrames)

    // Score text — fade in over scoreStart→15% into score phase, hold, fade out over scoreOut
    const scoreStartPct = fp(scoreStartFrame)
    const scoreFadeInDonePct = scoreStartPct + (fp(scoreEndFrame) - scoreStartPct) * 0.15
    const scoreEndPct = fp(scoreEndFrame)
    const scoreOutPct = fp(scoreOutEndFrame)
    cssRules.push(`@keyframes ending-score-text {
  0.00% { opacity: 0; }
  ${(scoreStartPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${scoreStartPct.toFixed(2)}% { opacity: 0; }
  ${scoreFadeInDonePct.toFixed(2)}% { opacity: 1; }
  ${scoreEndPct.toFixed(2)}% { opacity: 1; }
  ${scoreOutPct.toFixed(2)}% { opacity: 0; }
  100.00% { opacity: 0; }
}`)
    const scoreText = `${fmtScore(finalScore)} COMMITS`
    elements.push(
      `<g ${anim(`wiggle-score 0.6s ease-in-out infinite`)}>` +
      `<text x="${screenW / 2}" y="${gameAreaH / 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="monospace" font-weight="bold" font-size="14" fill="${pal.scoreText}" opacity="0" ` +
      `${anim(`ending-score-text ${dur}s linear infinite`)}>${scoreText}</text></g>`
    )

    // Scoreboard removed from ending — now rendered at intro (see intro-board above)

    // Blackout overlay — fade in over blackoutDuration, hold, fade out over resetDuration
    const blackoutStartPct = fp(boardEndFrame)
    const blackoutFullPct = fp(blackoutEndFrame)
    const resetDonePct = fp(resetEndFrame)
    cssRules.push(`@keyframes ending-blackout {
  0.00% { opacity: 0; }
  ${(blackoutStartPct - 0.01).toFixed(2)}% { opacity: 0; }
  ${blackoutStartPct.toFixed(2)}% { opacity: 0; }
  ${blackoutFullPct.toFixed(2)}% { opacity: 1; }
  ${Math.min(100, resetDonePct).toFixed(2)}% { opacity: 0; }
  100.00% { opacity: 0; }
}`)
    elements.push(
      `<rect x="0" y="0" width="${screenW}" height="${screenH}" fill="${pal.bg}" opacity="0" ` +
      `${anim(`ending-blackout ${dur}s linear infinite`)} />`
    )
  }

  // ── Assemble SVG ──
  const css = cssRules.join('\n\n')

  return `<svg viewBox="0 0 ${screenW} ${screenH}" width="${screenW}" height="${screenH}" xmlns="http://www.w3.org/2000/svg">
${defsBlock}
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
  palette?: ColorPalette,
): string {
  const lastDate = grid.cells.reduce((max, c) => (c.date > max ? c.date : max), '')
  const scoreboard = computeScoreboard(grid, lastDate, grid.width * 7, 10)
  return composeSvg({ grid, seed, config, scoreboard, palette })
}
