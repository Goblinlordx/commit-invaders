/**
 * Timeline Mapper — converts simulation frames to CSS animation time.
 *
 * All CSS animations share one global animation-duration = totalFrames / fps.
 * Individual entity timing uses animation-delay for spawn offsets.
 */

import type { SimConfig, SimOutput, InflectionPoint, Position } from '../types.js'

/** Convert a frame number to seconds. */
export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps
}

/** Convert a frame number to a percentage of total animation. */
export function frameToPercent(frame: number, totalFrames: number): number {
  return totalFrames > 0 ? (frame / totalFrames) * 100 : 0
}

/** Total animation duration in seconds. */
export function totalDuration(totalFrames: number, fps: number): number {
  return totalFrames / fps
}

// ── Formation keyframe data ──

export interface FormationKeyframePoint {
  percent: number
  x: number
  y: number
}

/**
 * Extract formation oscillation keyframes from inflection points.
 * Maps direction_change and spawn/wave_clear inflections to CSS percentage stops.
 */
export function formationKeyframes(
  formationId: string,
  output: SimOutput,
  config: SimConfig,
): FormationKeyframePoint[] {
  const timeline = output.getInflections(formationId)
  if (timeline.length === 0) return []

  const total = output.totalFrames
  const points: FormationKeyframePoint[] = []

  // simToScreen rotation: screenX = playArea.height - simY, screenY = simX
  // But formation offset is applied to invader positions, not absolute
  // For the <g> group transform, we use the raw offset (screen-rotated)
  function offsetToScreen(offset: Position): { x: number; y: number } {
    // Formation offset is in sim space: offset.x = zigzag, offset.y = row drops
    // In screen space (90° CW): screenDx = -offset.y (row drops move left on screen)
    //                           screenDy = offset.x (zigzag moves vertically on screen)
    // Wait — actually the offset is added to invader positions before simToScreen.
    // So we need to figure out how the offset transforms.
    // simToScreen(invX + offX, invY + offY) = (margin + height - invY - offY, margin + invX + offX)
    // vs simToScreen(invX, invY) = (margin + height - invY, margin + invX)
    // Delta: screenDx = -offY, screenDy = +offX
    return { x: -offset.y, y: offset.x }
  }

  for (const ip of timeline) {
    if (ip.type === 'spawn' || ip.type === 'wave_clear') {
      const screen = offsetToScreen(ip.position)
      points.push({
        percent: frameToPercent(ip.frame, total),
        x: screen.x,
        y: screen.y,
      })
    } else if (ip.type === 'direction_change') {
      // The position already includes the row drop. Insert two stops:
      // 1. Pre-drop: at the edge before dropping (undo the row drop from Y)
      // 2. Post-drop: after the row drop (the recorded position)
      // Offset by tiny epsilon so CSS doesn't discard the duplicate percent.
      const pct = frameToPercent(ip.frame, total)
      const postDrop = offsetToScreen(ip.position)
      const preDrop = offsetToScreen({
        x: ip.position.x,
        y: ip.position.y - config.formationRowDrop,
      })
      points.push({ percent: pct, x: preDrop.x, y: preDrop.y })
      points.push({ percent: pct + 0.01, x: postDrop.x, y: postDrop.y })
    }
  }

  return points
}

// ── Cell lifecycle timing ──

export interface CellLifecycleData {
  cellId: string
  gridScreenX: number
  gridScreenY: number
  targetScreenX: number
  targetScreenY: number
  pluckTime: number // seconds
  travelStartTime: number
  travelEndTime: number
  hatchStartTime: number
  hatchCompleteTime: number
}

/**
 * Extract cell lifecycle timing from inflection points.
 */
export function cellLifecycleTimings(
  output: SimOutput,
  config: SimConfig,
): CellLifecycleData[] {
  const fps = config.framesPerSecond
  const results: CellLifecycleData[] = []
  const stride = config.cellSize + config.cellGap
  const RENDER_MARGIN = 10
  const screenW = config.playArea.height + RENDER_MARGIN * 2
  const gridScreenOffsetX = screenW - config.gridArea.height - RENDER_MARGIN
  const gridScreenOffsetY = RENDER_MARGIN + (config.playArea.width - config.gridArea.width) / 2

  const allTimelines = output.getAllInflections()

  for (const [entityId, timeline] of allTimelines) {
    if (timeline.entityType !== 'cell') continue

    const inflections = timeline.inflections
    const pluck = inflections.find((ip) => ip.type === 'pluck')
    const travelStart = inflections.find((ip) => ip.type === 'travel_start')
    const travelEnd = inflections.find((ip) => ip.type === 'travel_end')
    const hatchStart = inflections.find((ip) => ip.type === 'hatch_start')
    const hatchComplete = inflections.find((ip) => ip.type === 'hatch_complete')

    if (!pluck) continue

    // Grid position: cell id format is "cell-{x}-{y}"
    const parts = entityId.split('-')
    const cellX = parseInt(parts[1]!, 10)
    const cellY = parseInt(parts[2]!, 10)
    const gridScreenX = gridScreenOffsetX + cellX * stride
    const gridScreenY = gridScreenOffsetY + cellY * stride

    // Target position (from hatch inflection, in sim space)
    let targetScreenX = gridScreenX
    let targetScreenY = gridScreenY
    if (hatchStart) {
      // simToScreen: sx = MARGIN + height - simY, sy = MARGIN + simX
      targetScreenX = RENDER_MARGIN + config.playArea.height - hatchStart.position.y
      targetScreenY = RENDER_MARGIN + hatchStart.position.x
    }

    results.push({
      cellId: entityId,
      gridScreenX,
      gridScreenY,
      targetScreenX,
      targetScreenY,
      pluckTime: frameToSeconds(pluck.frame, fps),
      travelStartTime: travelStart ? frameToSeconds(travelStart.frame, fps) : 0,
      travelEndTime: travelEnd ? frameToSeconds(travelEnd.frame, fps) : 0,
      hatchStartTime: hatchStart ? frameToSeconds(hatchStart.frame, fps) : 0,
      hatchCompleteTime: hatchComplete ? frameToSeconds(hatchComplete.frame, fps) : 0,
    })
  }

  return results
}

// ── Ship movement data ──

export interface ShipKeyframePoint {
  time: number // seconds
  screenX: number
  screenY: number
}

export function shipKeyframes(
  output: SimOutput,
  config: SimConfig,
): ShipKeyframePoint[] {
  const fps = config.framesPerSecond
  const RENDER_MARGIN = 10
  const timeline = output.getInflections('ship')
  const points: ShipKeyframePoint[] = []

  for (const ip of timeline) {
    const sx = RENDER_MARGIN + config.playArea.height - ip.position.y
    const sy = RENDER_MARGIN + ip.position.x
    points.push({
      time: frameToSeconds(ip.frame, fps),
      screenX: sx,
      screenY: sy,
    })
  }

  return points
}

// ── Laser data ──

export interface LaserData {
  laserId: string
  spawnTime: number // seconds
  screenX: number // fire position (screen X, constant)
  screenY: number // fire position (screen Y)
  travelDistance: number // px to travel if no hit (out of bounds)
  travelDuration: number // seconds for full travel
  despawnTime: number // actual despawn time (hit or out of bounds)
  despawnDistance: number // actual distance traveled before despawn
}

export function laserTimings(
  output: SimOutput,
  config: SimConfig,
): LaserData[] {
  const fps = config.framesPerSecond
  const dt = 1 / fps
  const RENDER_MARGIN = 10
  const results: LaserData[] = []

  const allTimelines = output.getAllInflections()

  for (const [entityId, timeline] of allTimelines) {
    if (timeline.entityType !== 'laser') continue

    const fire = timeline.inflections.find((ip) => ip.type === 'fire')
    if (!fire) continue

    const sx = RENDER_MARGIN + config.playArea.height - fire.position.y
    const sy = RENDER_MARGIN + fire.position.x

    // Laser travels from shipY toward Y=0 in sim space
    // In screen space that's rightward (increasing screenX)
    const travelDistSim = fire.position.y // sim Y from fire to Y=0
    const travelDistScreen = travelDistSim // screen X = height - simY, so travel = simY
    const travelFrames = Math.ceil(travelDistSim / (config.laserSpeed * dt))
    const travelDur = frameToSeconds(travelFrames, fps)

    // Check if this laser hit something (find hit event referencing this laser)
    const hitEvent = output.events.find(
      (e) => e.type === 'hit' && (e.data as { laserId?: string })?.laserId === entityId,
    )

    let despawnTime: number
    let despawnDistance: number
    if (hitEvent) {
      // Laser despawns on hit
      despawnTime = frameToSeconds(hitEvent.frame, fps)
      const hitFrames = hitEvent.frame - fire.frame
      despawnDistance = hitFrames * config.laserSpeed * dt
    } else {
      // Laser despawns at out of bounds
      despawnTime = frameToSeconds(fire.frame, fps) + travelDur
      despawnDistance = travelDistScreen
    }

    results.push({
      laserId: entityId,
      spawnTime: frameToSeconds(fire.frame, fps),
      screenX: sx,
      screenY: sy,
      travelDistance: travelDistScreen,
      travelDuration: travelDur,
      despawnTime,
      despawnDistance,
    })
  }

  return results
}

// ── Overlay opacity stops ──

export interface OverlayStop {
  percent: number
  opacity: number
}

export function overlayKeyframeStops(
  output: SimOutput,
  config: SimConfig,
): OverlayStop[] {
  const total = output.totalFrames
  const stops: OverlayStop[] = []

  // Sample overlay at key frames AND within transition phases
  const samplePoints = new Set<number>()
  samplePoints.add(0)
  samplePoints.add(total - 1)

  // Add wave phase change events + intermediate samples within transition phases
  const phaseChangeFrames: number[] = []
  for (const ev of output.events) {
    if (ev.type === 'wave_phase_change' || ev.type === 'wave_spawn' || ev.type === 'wave_clear' || ev.type === 'game_end') {
      samplePoints.add(ev.frame)
      if (ev.frame > 0) samplePoints.add(ev.frame - 1)
      if (ev.frame < total - 1) samplePoints.add(ev.frame + 1)
      if (ev.type === 'wave_phase_change') phaseChangeFrames.push(ev.frame)
    }
  }

  // Add intermediate samples within brightening/darkening phases (10 samples each)
  for (const startFrame of phaseChangeFrames) {
    const state = output.peek(startFrame)
    if (state.wavePhase === 'brightening' || state.wavePhase === 'darkening') {
      const phaseDur = state.wavePhase === 'brightening'
        ? config.waveConfig.brightenDuration
        : config.waveConfig.darkenDuration
      for (let s = 1; s <= 10; s++) {
        const f = startFrame + Math.floor((phaseDur * s) / 10)
        if (f < total) samplePoints.add(f)
      }
    }
  }

  const sorted = [...samplePoints].sort((a, b) => a - b)

  for (const frame of sorted) {
    const state = output.peek(frame)
    const phase = state.wavePhase
    const progress = state.wavePhaseProgress
    const hasWaves = state.formations.length > 0

    let alpha = 0
    if (phase === 'idle' || phase === 'ending_reset') alpha = 0
    else if (phase === 'brightening') alpha = hasWaves ? 0.6 * (1 - progress) : 0
    else if (phase === 'plucking') alpha = 0
    else if (phase === 'darkening') alpha = 0.6 * progress
    else if (phase === 'ending_blackout') alpha = 0
    else alpha = 0.6

    stops.push({
      percent: frameToPercent(frame, total),
      opacity: alpha,
    })
  }

  return stops
}
