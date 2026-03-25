import type { Grid, SimConfig, SimOutput, ContributionLevel } from '../../src/types.js'
import { simulate } from '../../src/simulator/simulate.js'
import { createPRNG } from '../../src/simulator/prng.js'
import { renderEntity, BG_COLOR, RENDER_MARGIN, type EntityType } from '../../src/animation/render-entity.js'
import { renderEntitySvg } from './svg-renderer.js'

// ── Config (matches sim-viewer defaults) ──

const STRIDE = 13
const PADDING = 20
const gridW = 7 * STRIDE + PADDING * 2
const gridH = 52 * STRIDE
const shipMargin = 24

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

// ── Grid ──

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
let output: SimOutput = simulate(grid, 'validator', config)
let currentFrame = 0
let currentEntity: EntityType = 'grid'

const screenW = config.playArea.height + RENDER_MARGIN * 2
const screenH = config.playArea.width + RENDER_MARGIN * 2

// ── DOM ──

const canvasView = document.getElementById('canvas-view') as HTMLCanvasElement
const svgContainer = document.getElementById('svg-container') as HTMLDivElement
const diffCanvas = document.getElementById('diff-canvas') as HTMLCanvasElement
const entitySelect = document.getElementById('entity-select') as HTMLSelectElement
const frameSlider = document.getElementById('frame-slider') as HTMLInputElement
const frameDisplay = document.getElementById('frame-display')!
const resultSpan = document.getElementById('result')!

canvasView.width = screenW
canvasView.height = screenH
diffCanvas.width = screenW
diffCanvas.height = screenH
const ctx = canvasView.getContext('2d')!
const diffCtx = diffCanvas.getContext('2d')!

frameSlider.max = String(output.totalFrames - 1)

function draw(): void {
  const state = output.peek(currentFrame)

  // Canvas
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, screenW, screenH)
  renderEntity(ctx, currentEntity, state, config)

  // SVG
  const svgString = renderEntitySvg(currentEntity, state, config, screenW, screenH)
  svgContainer.innerHTML = svgString

  frameDisplay.textContent = `${currentFrame} / ${output.totalFrames - 1} (${state.wavePhase})`
}

function pixelDiff(): void {
  // Get canvas pixels
  const canvasData = ctx.getImageData(0, 0, screenW, screenH)

  // Render SVG to an offscreen canvas for comparison
  const svgEl = svgContainer.querySelector('svg')
  if (!svgEl) { resultSpan.textContent = 'No SVG'; return }

  const svgData = new XMLSerializer().serializeToString(svgEl)
  const img = new Image()
  img.onload = () => {
    const offscreen = document.createElement('canvas')
    offscreen.width = screenW
    offscreen.height = screenH
    const offCtx = offscreen.getContext('2d')!
    offCtx.drawImage(img, 0, 0)
    const svgPixels = offCtx.getImageData(0, 0, screenW, screenH)

    // Diff
    let diffCount = 0
    const diffData = diffCtx.createImageData(screenW, screenH)
    for (let i = 0; i < canvasData.data.length; i += 4) {
      const dr = Math.abs(canvasData.data[i]! - svgPixels.data[i]!)
      const dg = Math.abs(canvasData.data[i + 1]! - svgPixels.data[i + 1]!)
      const db = Math.abs(canvasData.data[i + 2]! - svgPixels.data[i + 2]!)
      const diff = dr + dg + db
      if (diff > 10) {
        diffCount++
        diffData.data[i] = 255
        diffData.data[i + 1] = 0
        diffData.data[i + 2] = 0
        diffData.data[i + 3] = 255
      } else {
        diffData.data[i] = canvasData.data[i]! / 3
        diffData.data[i + 1] = canvasData.data[i + 1]! / 3
        diffData.data[i + 2] = canvasData.data[i + 2]! / 3
        diffData.data[i + 3] = 255
      }
    }
    diffCtx.putImageData(diffData, 0, 0)

    const totalPixels = screenW * screenH
    const diffPercent = (diffCount / totalPixels * 100).toFixed(2)
    const pass = diffCount / totalPixels < 0.01
    resultSpan.className = pass ? 'pass' : 'fail'
    resultSpan.textContent = `${diffPercent}% diff (${diffCount}/${totalPixels} px) — ${pass ? 'PASS' : 'FAIL'}`
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData)
}

// ── Controls ──

entitySelect.addEventListener('change', () => {
  currentEntity = entitySelect.value as EntityType
  draw()
})

frameSlider.addEventListener('input', () => {
  currentFrame = parseInt(frameSlider.value, 10)
  draw()
})

document.getElementById('btn-diff')!.addEventListener('click', pixelDiff)

// ── Expose for Playwright ──

interface ValidatorController {
  setEntity(type: EntityType): void
  setFrame(frame: number): void
  getScreenSize(): { width: number; height: number }
  pixelDiff(): Promise<{ diffPercent: number; pass: boolean }>
  getTotalFrames(): number
}

const controller: ValidatorController = {
  setEntity(type: EntityType) {
    currentEntity = type
    entitySelect.value = type
    draw()
  },
  setFrame(frame: number) {
    currentFrame = frame
    frameSlider.value = String(frame)
    draw()
  },
  getScreenSize() { return { width: screenW, height: screenH } },
  async pixelDiff() {
    return new Promise((resolve) => {
      const canvasData = ctx.getImageData(0, 0, screenW, screenH)
      const svgEl = svgContainer.querySelector('svg')
      if (!svgEl) { resolve({ diffPercent: 100, pass: false }); return }

      const svgData = new XMLSerializer().serializeToString(svgEl)
      const img = new Image()
      img.onload = () => {
        const offscreen = document.createElement('canvas')
        offscreen.width = screenW
        offscreen.height = screenH
        const offCtx = offscreen.getContext('2d')!
        offCtx.drawImage(img, 0, 0)
        const svgPixels = offCtx.getImageData(0, 0, screenW, screenH)

        let diffCount = 0
        for (let i = 0; i < canvasData.data.length; i += 4) {
          const diff = Math.abs(canvasData.data[i]! - svgPixels.data[i]!) +
            Math.abs(canvasData.data[i + 1]! - svgPixels.data[i + 1]!) +
            Math.abs(canvasData.data[i + 2]! - svgPixels.data[i + 2]!)
          if (diff > 10) diffCount++
        }
        const diffPercent = diffCount / (screenW * screenH) * 100
        resolve({ diffPercent, pass: diffPercent < 1 })
      }
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData)
    })
  },
  getTotalFrames() { return output.totalFrames },
}

;(window as unknown as { validatorController: ValidatorController }).validatorController = controller

// ── Init ──

draw()
