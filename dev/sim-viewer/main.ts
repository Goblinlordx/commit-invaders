import type { Grid, SimConfig, SimOutput, GameState, ContributionLevel } from '../../src/types.js'
import { simulate } from '../../src/simulator/simulate.js'
import { createPRNG } from '../../src/simulator/prng.js'
import { renderFrame, getScreenSize } from './renderer.js'

// ── Default config ──

// ── Layout constants (screen space, exported for renderer) ──

const CELL_SIZE = 11
const CELL_GAP = 2
const STRIDE = CELL_SIZE + CELL_GAP
const PADDING = 20 // extra space around grid for invader oscillation
const STATUS_BAR_HEIGHT = 20

export function getLayoutConstants() {
  return { CELL_SIZE, CELL_GAP, STRIDE, PADDING, STATUS_BAR_HEIGHT }
}

function defaultConfig(): SimConfig {
  // Grid dimensions: 52 weeks × 7 days
  // Sim X axis (oscillation) → screen Y: grid height + padding on top/bottom
  // Sim Y axis (fire/travel) → screen X: grid width + ship margin on left
  const gridW = 7 * STRIDE + PADDING * 2  // sim X range: grid + vertical padding
  const gridH = 52 * STRIDE               // sim Y range: grid width (weeks)
  const shipMargin = 24                    // space for ship on left

  return {
    framesPerSecond: 60,
    waveConfig: {
      weeksPerWave: 4, spawnDelay: 60,
      brightenDuration: 30, pluckDuration: 20, darkenDuration: 20,
      travelDuration: 40, hatchDuration: 20,
    },
    playArea: { x: 0, y: 0, width: gridW, height: gridH + shipMargin },
    gridArea: { x: PADDING, y: 0, width: 7 * STRIDE, height: gridH },
    cellSize: CELL_SIZE,
    cellGap: CELL_GAP,
    laserSpeed: 240,
    laserWidth: 4,
    invaderSize: CELL_SIZE - 1, // 10px — 1px less than cell for slight gap
    shipSpeed: 180,
    shipY: gridH + shipMargin - 4,
    formationBaseSpeed: 60,
    formationMaxSpeed: 240,
    formationRowDrop: STRIDE,
    hitChance: 0.85,
    fireRate: 3, // 3 shots per second
    shipYRange: 30,
    formationSpread: 2, // 2px extra gap between invaders
    formationRowStagger: 3, // 3px offset per row for zigzag look
  }
}

// ── Fixture grids ──

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

const FIXTURES: Record<string, number> = {
  small: 2,
  medium: 8,
  full: 52,
}

// ── DOM refs ──

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const scrubber = document.getElementById('scrubber') as HTMLInputElement
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement
const speedVal = document.getElementById('speed-val')!
const hudFrame = document.getElementById('hud-frame')!
const hudTotal = document.getElementById('hud-total')!
const hudScore = document.getElementById('hud-score')!
const hudWave = document.getElementById('hud-wave')!
const hudInvaders = document.getElementById('hud-invaders')!
const seedInput = document.getElementById('seed-input') as HTMLInputElement
const fixtureSelect = document.getElementById('fixture-select') as HTMLSelectElement
const tuningDiv = document.getElementById('tuning')!

// ── State ──

let config = defaultConfig()
let output: SimOutput
let currentFrame = 0
let playing = false
let speed = 1
let lastTimestamp = 0
let accumulator = 0

// ── Tuning panel ──

interface TuningParam {
  key: keyof SimConfig
  label: string
  min: number
  max: number
  step: number
}

const TUNING_PARAMS: TuningParam[] = [
  { key: 'laserSpeed', label: 'Laser Speed', min: 30, max: 600, step: 10 },
  { key: 'laserWidth', label: 'Laser Size', min: 1, max: 10, step: 1 },
  { key: 'shipSpeed', label: 'Ship Speed', min: 30, max: 600, step: 10 },
  { key: 'invaderSize', label: 'Invader Size', min: 3, max: 15, step: 1 },
  { key: 'formationBaseSpeed', label: 'Form. Speed', min: 10, max: 300, step: 5 },
  { key: 'formationMaxSpeed', label: 'Form. Max', min: 30, max: 600, step: 10 },
  { key: 'formationRowDrop', label: 'Row Drop', min: 5, max: 50, step: 1 },
  { key: 'hitChance', label: 'Hit Chance', min: 0.1, max: 1.0, step: 0.05 },
  { key: 'fireRate', label: 'Fire Rate', min: 1, max: 20, step: 1 },
  { key: 'shipYRange', label: 'Ship Y Range', min: 0, max: 100, step: 5 },
  { key: 'formationSpread', label: 'Spread', min: 0, max: 20, step: 1 },
  { key: 'formationRowStagger', label: 'Row Stagger', min: 0, max: 15, step: 1 },
  { key: 'framesPerSecond', label: 'Sim FPS', min: 10, max: 120, step: 5 },
]

function buildTuningPanel(): void {
  tuningDiv.innerHTML = ''
  for (const p of TUNING_PARAMS) {
    const div = document.createElement('div')
    div.className = 'param'
    const val = config[p.key] as number
    div.innerHTML = `
      <label>${p.label}</label>
      <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}" data-key="${p.key}" />
      <div class="val">${val}</div>
    `
    const input = div.querySelector('input')!
    const valDiv = div.querySelector('.val')!
    input.addEventListener('input', () => {
      const v = parseFloat(input.value)
      ;(config as Record<string, unknown>)[p.key] = v
      valDiv.textContent = String(v)
    })
    tuningDiv.appendChild(div)
  }
}

// ── Simulation ──

function runSim(): void {
  const fixture = fixtureSelect.value
  const weeks = FIXTURES[fixture] ?? 8
  const seed = seedInput.value || 'demo-seed'
  const grid = makeGrid(weeks, seed + '-grid')

  const screen = getScreenSize(config, STATUS_BAR_HEIGHT)
  canvas.width = screen.width
  canvas.height = screen.height

  output = simulate(grid, seed, config)
  currentFrame = 0
  scrubber.max = String(output.totalFrames - 1)
  scrubber.value = '0'
  hudTotal.textContent = String(output.totalFrames)
  draw()
}

// ── Drawing ──

function draw(): void {
  const state = output.peek(currentFrame)
  renderFrame(ctx, state, config, STATUS_BAR_HEIGHT)
  updateHud(state)
}

function updateHud(state: GameState): void {
  hudFrame.textContent = String(state.frame)
  hudScore.textContent = String(state.score)
  hudWave.textContent = String(state.currentWave)
  const alive = state.formations.reduce(
    (n, f) => n + f.invaders.filter((i) => !i.destroyed).length,
    0,
  )
  hudInvaders.textContent = String(alive)
  scrubber.value = String(currentFrame)
}

// ── Playback ──

function tick(timestamp: number): void {
  if (!playing) return

  if (lastTimestamp === 0) lastTimestamp = timestamp
  const delta = (timestamp - lastTimestamp) / 1000 // seconds
  lastTimestamp = timestamp

  accumulator += delta * speed * config.framesPerSecond
  const framesToAdvance = Math.floor(accumulator)
  accumulator -= framesToAdvance

  if (framesToAdvance > 0) {
    currentFrame = Math.min(currentFrame + framesToAdvance, output.totalFrames - 1)
    draw()
    if (currentFrame >= output.totalFrames - 1) {
      playing = false
      document.getElementById('btn-play')!.textContent = 'Play'
      return
    }
  }

  requestAnimationFrame(tick)
}

function togglePlay(): void {
  playing = !playing
  document.getElementById('btn-play')!.textContent = playing ? 'Pause' : 'Play'
  if (playing) {
    lastTimestamp = 0
    accumulator = 0
    requestAnimationFrame(tick)
  }
}

function seek(frame: number): void {
  currentFrame = Math.max(0, Math.min(frame, output.totalFrames - 1))
  draw()
}

// ── Controls ──

document.getElementById('btn-play')!.addEventListener('click', togglePlay)
document.getElementById('btn-restart')!.addEventListener('click', () => seek(0))
document.getElementById('btn-back10')!.addEventListener('click', () => seek(currentFrame - 10))
document.getElementById('btn-back1')!.addEventListener('click', () => seek(currentFrame - 1))
document.getElementById('btn-fwd1')!.addEventListener('click', () => seek(currentFrame + 1))
document.getElementById('btn-fwd10')!.addEventListener('click', () => seek(currentFrame + 10))
scrubber.addEventListener('input', () => seek(parseInt(scrubber.value, 10)))
speedSlider.addEventListener('input', () => {
  speed = parseFloat(speedSlider.value)
  speedVal!.textContent = `${speed}x`
})
document.getElementById('btn-rerun')!.addEventListener('click', runSim)

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  switch (e.key) {
    case ' ': e.preventDefault(); togglePlay(); break
    case 'ArrowLeft': seek(currentFrame - (e.shiftKey ? 10 : 1)); break
    case 'ArrowRight': seek(currentFrame + (e.shiftKey ? 10 : 1)); break
    case 'Home': seek(0); break
    case 'End': seek(output.totalFrames - 1); break
  }
})

// ── window.simController API (for Playwright) ──

interface SimController {
  seekToFrame(n: number): void
  play(): void
  pause(): void
  step(delta: number): void
  setSpeed(mult: number): void
  restart(): void
  getFrame(): number
  getTotalFrames(): number
  getState(): GameState
  rerun(newConfig?: Partial<SimConfig>, newSeed?: string): void
}

const simController: SimController = {
  seekToFrame(n: number) { seek(n) },
  play() { if (!playing) togglePlay() },
  pause() { if (playing) togglePlay() },
  step(delta: number) { seek(currentFrame + delta) },
  setSpeed(mult: number) { speed = mult; speedSlider.value = String(mult); speedVal!.textContent = `${mult}x` },
  restart() { seek(0) },
  getFrame() { return currentFrame },
  getTotalFrames() { return output.totalFrames },
  getState() { return output.peek(currentFrame) },
  rerun(newConfig?: Partial<SimConfig>, newSeed?: string) {
    if (newConfig) config = { ...config, ...newConfig }
    if (newSeed) seedInput.value = newSeed
    playing = false
    document.getElementById('btn-play')!.textContent = 'Play'
    buildTuningPanel()
    runSim()
  },
}

;(window as unknown as { simController: SimController }).simController = simController

// ── Init ──

buildTuningPanel()
runSim()
