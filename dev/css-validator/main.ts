import type { Grid, SimConfig, ContributionLevel } from '../../src/types.js'
import { simulate } from '../../src/simulator/simulate.js'
import { createPRNG } from '../../src/simulator/prng.js'
import { renderFrame, getScreenSize, RENDER_MARGIN } from '../sim-viewer/renderer.js'
import { generateAnimatedSvg } from '../../src/animation/svg-compositor.js'
import { totalDuration } from '../../src/animation/timeline-mapper.js'

// ── Config (matches sim-viewer) ──

const STRIDE = 13, PADDING = 20
const gridW = 7 * STRIDE + PADDING * 2, gridH = 52 * STRIDE, shipMargin = 24
const STATUS_BAR_HEIGHT = 0 // no status bar for CSS comparison

const config: SimConfig = {
  framesPerSecond: 60,
  waveConfig: {
    weeksPerWave: 4, startDelay: 60, spawnDelay: 0,
    brightenDuration: 60, pluckDuration: 20, darkenDuration: 60,
    travelDuration: 40, hatchDuration: 20,
    endingFadeoutDuration: 60, endingScoreDuration: 180,
    endingScoreOutDuration: 30, endingBoardInDuration: 30,
    endingHoldDuration: 300, endingBlackoutDuration: 60, endingResetDuration: 60,
  },
  playArea: { x: 0, y: 0, width: gridW, height: gridH + shipMargin },
  gridArea: { x: PADDING, y: 0, width: 7 * STRIDE, height: gridH },
  cellSize: 11, cellGap: 2, laserSpeed: 480, laserWidth: 4, invaderSize: 9,
  shipSpeed: 180, shipY: gridH + shipMargin - 4,
  formationBaseSpeed: 60, formationMaxSpeed: 240, formationRowDrop: 7,
  hitChance: 0.85, fireRate: 5, shipYRange: 30,
  formationSpread: 10, formationRowStagger: 10,
}

function makeGrid(weeks: number, seed: string): Grid {
  const prng = createPRNG(seed)
  const cells = []
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const roll = prng.next()
      let level: ContributionLevel
      if (roll < 0.3) level = 0
      else if (roll < 0.6) level = 1
      else if (roll < 0.8) level = 2
      else if (roll < 0.92) level = 3
      else level = 4
      cells.push({
        x: w, y: d, level,
        date: `2025-${String(Math.floor(w / 4) + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`,
        count: level === 0 ? 0 : Math.floor(level * 3 + prng.next() * 10),
      })
    }
  }
  return { width: weeks, height: 7, cells }
}

// ── State ──

const grid = makeGrid(8, 'validator-grid')
const output = simulate(grid, 'validator', config)
const svgString = generateAnimatedSvg(grid, 'validator', config)
const dur = totalDuration(output.totalFrames, config.framesPerSecond)
let currentFrame = 0

const screenW = config.playArea.height + RENDER_MARGIN * 2
const screenH = config.playArea.width + RENDER_MARGIN * 2

// ── DOM ──

const canvasView = document.getElementById('canvas-view') as HTMLCanvasElement
const svgContainer = document.getElementById('svg-container') as HTMLDivElement
const frameSlider = document.getElementById('frame-slider') as HTMLInputElement
const frameDisplay = document.getElementById('frame-display')!
const resultSpan = document.getElementById('result')!
const svgOutputDiv = document.getElementById('svg-output')!

canvasView.width = screenW
canvasView.height = screenH
const ctx = canvasView.getContext('2d')!
frameSlider.max = String(output.totalFrames - 1)

// Insert SVG
svgContainer.innerHTML = svgString

// Pause all animations and use animation-delay for seeking
const svgEl = svgContainer.querySelector('svg')!
const seekStyle = document.createElement('style')
seekStyle.textContent = `svg * { animation-play-state: paused !important; }`
svgEl.prepend(seekStyle)

function seekSvg(frame: number): void {
  const seekTime = frame / config.framesPerSecond
  // Set negative animation-delay to seek
  svgEl.querySelectorAll('[style*="animation"]').forEach((el) => {
    const htmlEl = el as HTMLElement
    const currentStyle = htmlEl.getAttribute('style') || ''
    // Extract animation name and duration, override delay
    htmlEl.style.animationDelay = `-${seekTime}s`
  })
}

function draw(): void {
  const state = output.peek(currentFrame)
  // Render canvas (full frame, no status bar for cleaner comparison)
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, screenW, screenH)
  renderFrame(ctx, state, config, 0)

  // Seek SVG
  seekSvg(currentFrame)

  frameDisplay.textContent = `${currentFrame} / ${output.totalFrames - 1} (${state.wavePhase})`
}

// ── Controls ──

frameSlider.addEventListener('input', () => {
  currentFrame = parseInt(frameSlider.value, 10)
  draw()
})

document.getElementById('btn-export')!.addEventListener('click', () => {
  svgOutputDiv.style.display = 'block'
  svgOutputDiv.textContent = svgString
  console.log(`SVG size: ${(svgString.length / 1024).toFixed(1)} KB`)
})

document.getElementById('btn-diff')!.addEventListener('click', () => {
  // Pixel diff canvas vs SVG (rendered to offscreen canvas)
  const svgData = new XMLSerializer().serializeToString(svgEl)
  const img = new Image()
  img.onload = () => {
    const off = document.createElement('canvas')
    off.width = screenW
    off.height = screenH
    const offCtx = off.getContext('2d')!
    offCtx.drawImage(img, 0, 0)
    const canvasPixels = ctx.getImageData(0, 0, screenW, screenH)
    const svgPixels = offCtx.getImageData(0, 0, screenW, screenH)

    let diffCount = 0
    for (let i = 0; i < canvasPixels.data.length; i += 4) {
      const diff = Math.abs(canvasPixels.data[i]! - svgPixels.data[i]!) +
        Math.abs(canvasPixels.data[i + 1]! - svgPixels.data[i + 1]!) +
        Math.abs(canvasPixels.data[i + 2]! - svgPixels.data[i + 2]!)
      if (diff > 15) diffCount++
    }
    const pct = (diffCount / (screenW * screenH) * 100).toFixed(2)
    const pass = diffCount / (screenW * screenH) < 0.05 // 5% threshold for animated SVG
    resultSpan.className = pass ? 'pass' : 'fail'
    resultSpan.textContent = `${pct}% diff — ${pass ? 'PASS' : 'FAIL'}`
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData)
})

// ── Expose for Playwright ──

;(window as any).cssValidator = {
  setFrame(f: number) { currentFrame = Math.min(f, output.totalFrames - 1); frameSlider.value = String(currentFrame); draw() },
  getTotalFrames() { return output.totalFrames },
  getSvgSize() { return svgString.length },
  ready: true,
}

draw()
