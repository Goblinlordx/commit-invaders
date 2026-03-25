import type { Grid, SimConfig, ContributionLevel } from '../src/types.js'
import { composeSvg, type CompositeSvgOptions } from '../src/animation/svg-compositor.js'
import { simulate } from '../src/simulator/simulate.js'
import { computeScoreboard } from '../src/scoreboard.js'
import { createPRNG } from '../src/simulator/prng.js'
import { totalDuration } from '../src/animation/timeline-mapper.js'

// ── Layout constants ──
const CELL_SIZE = 11
const CELL_GAP = 2
const STRIDE = CELL_SIZE + CELL_GAP
const PADDING = 20
const STATUS_BAR_HEIGHT = 20

function defaultConfig(): SimConfig {
  const gridW = 7 * STRIDE + PADDING * 2
  const gridH = 52 * STRIDE
  const shipMargin = 24
  return {
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
    cellSize: CELL_SIZE, cellGap: CELL_GAP, laserSpeed: 480, laserWidth: 4, invaderSize: 9,
    shipSpeed: 180, shipY: gridH + shipMargin - 4,
    formationBaseSpeed: 60, formationMaxSpeed: 240, formationRowDrop: 14,
    hitChance: 0.85, fireRate: 5, shipYRange: 30, formationSpread: 10, formationRowStagger: 10,
  }
}

// ── State ──
let currentConfig = defaultConfig()
let currentSvgString = ''
let animationDuration = 0 // seconds
let isPlaying = true
let scrubRaf = 0
let playStartTime = 0
let playStartOffset = 0

// ── DOM refs ──
const $ = (sel: string) => document.querySelector(sel)!
const previewContainer = $('#preview-container') as HTMLElement
const previewFrame = $('#preview-frame') as HTMLElement
const scrubber = $('#scrubber') as HTMLInputElement
const playPause = $('#play-pause') as HTMLButtonElement
const timeDisplay = $('#time-display') as HTMLElement
const generateBtn = $('#generate-btn') as HTMLButtonElement
const usernameInput = $('#username') as HTMLInputElement
const statsRow = $('#stats-row') as HTMLElement
const actionsRow = $('#actions-row') as HTMLElement
const debugPanel = $('#debug-panel') as HTMLElement
const debugGrid = $('#debug-grid') as HTMLElement

// ── Fixture grid (used when no GitHub token) ──
function makeFixtureGrid(weeks: number, seed: string): Grid {
  const prng = createPRNG(seed)
  const cells = []
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const roll = prng.next()
      let level: ContributionLevel
      // Distribution ~30% active — denser than typical but tests solver robustness
      if (roll < 0.70) level = 0
      else if (roll < 0.82) level = 1
      else if (roll < 0.91) level = 2
      else if (roll < 0.97) level = 3
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

// ── GitHub API (via public contributions endpoint) ──
async function fetchContributionGrid(username: string): Promise<Grid | null> {
  // Try GitHub GraphQL via CORS — won't work without token, fall back to fixture
  // For the demo, we use a fixture grid seeded by the username
  return null
}

// ── SVG Generation ──
function generateSvg(grid: Grid, seed: string, config: SimConfig): { svg: string; stats: { cells: number; commits: number; waves: number; duration: number; size: number } } {
  const output = simulate(grid, seed, config)
  const dur = totalDuration(output.totalFrames, config.framesPerSecond)
  const lastDate = grid.cells.reduce((max, c) => (c.date > max ? c.date : max), '')
  const scoreboard = computeScoreboard(grid, lastDate, grid.width * 7, 10)
  const svg = composeSvg({ grid, seed, config, scoreboard })
  const activeCells = grid.cells.filter(c => c.level > 0).length
  const totalCommits = grid.cells.reduce((sum, c) => sum + c.count, 0)
  const waveCount = output.events.filter(e => e.type === 'wave_spawn').length
  return {
    svg,
    stats: { cells: activeCells, commits: totalCommits, waves: waveCount, duration: dur, size: svg.length },
  }
}

// ── Scrubber / Animation Control ──
function setSvgContent(svgString: string) {
  currentSvgString = svgString
  previewContainer.innerHTML = svgString
  const svgEl = previewContainer.querySelector('svg')
  if (!svgEl) return

  // Set animation to playing state
  setupAnimationControl(svgEl)
}

function setupAnimationControl(svgEl: SVGSVGElement) {
  // CSS animation scrubbing: pause all animations and use negative animation-delay to seek
  const style = document.createElement('style')
  style.id = 'scrub-style'
  svgEl.prepend(style)

  if (isPlaying) {
    startPlaying()
  } else {
    pauseAnimation()
  }
}

function seekTo(timeSec: number) {
  const svgEl = previewContainer.querySelector('svg')
  if (!svgEl) return
  const style = svgEl.querySelector('#scrub-style') as HTMLStyleElement
  if (!style) return

  // Pause animations and use negative delay to seek
  style.textContent = `svg * { animation-play-state: paused !important; animation-delay: ${-timeSec}s !important; }`
  updateTimeDisplay(timeSec)
}

function startPlaying() {
  isPlaying = true
  playPause.textContent = '⏸'

  const svgEl = previewContainer.querySelector('svg')
  if (!svgEl) return
  const style = svgEl.querySelector('#scrub-style') as HTMLStyleElement
  if (!style) return

  // Get current scrubber position as start offset
  const currentTime = (parseInt(scrubber.value) / 1000) * animationDuration
  playStartOffset = currentTime
  playStartTime = performance.now()

  // Remove pause override — let animations play
  style.textContent = ''

  // Re-inject the SVG to restart animations from the right point
  // Actually, we need to keep the seek approach for scrubbing
  // Use requestAnimationFrame to update scrubber position
  cancelAnimationFrame(scrubRaf)
  const tick = () => {
    if (!isPlaying) return
    const elapsed = (performance.now() - playStartTime) / 1000
    const time = (playStartOffset + elapsed) % animationDuration
    const pct = (time / animationDuration) * 1000
    scrubber.value = String(Math.floor(pct))
    updateTimeDisplay(time)
    scrubRaf = requestAnimationFrame(tick)
  }

  // Let animations run from current position via negative delay
  style.textContent = `svg * { animation-delay: ${-currentTime}s !important; }`
  // Small delay then remove pause
  requestAnimationFrame(() => {
    style.textContent = ''
    scrubRaf = requestAnimationFrame(tick)
  })
}

function pauseAnimation() {
  isPlaying = false
  playPause.textContent = '▶'
  cancelAnimationFrame(scrubRaf)

  const currentTime = (parseInt(scrubber.value) / 1000) * animationDuration
  seekTo(currentTime)
}

function updateTimeDisplay(timeSec: number) {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }
  timeDisplay.textContent = `${fmt(timeSec)} / ${fmt(animationDuration)}`
}

// ── Theme ──
let currentTheme = 'dark'

function setTheme(theme: string) {
  currentTheme = theme
  document.querySelectorAll('.btn-theme').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === theme)
  })
  previewFrame.classList.toggle('classic', theme === 'classic')

  // Regenerate if we have content
  if (currentSvgString) {
    triggerGenerate()
  }
}

// ── Debug Panel ──
const PARAM_DEFS = [
  { key: 'hitChance', label: 'Hit Chance', min: 0.1, max: 1, step: 0.05 },
  { key: 'fireRate', label: 'Fire Rate', min: 1, max: 20, step: 1 },
  { key: 'laserSpeed', label: 'Laser Speed', min: 60, max: 600, step: 10 },
  { key: 'shipSpeed', label: 'Ship Speed', min: 30, max: 400, step: 10 },
  { key: 'formationBaseSpeed', label: 'Formation Speed', min: 10, max: 200, step: 5 },
  { key: 'formationRowDrop', label: 'Row Drop', min: 1, max: 50, step: 1 },
  { key: 'formationSpread', label: 'Spread', min: 0, max: 40, step: 1 },
  { key: 'formationRowStagger', label: 'Stagger', min: 0, max: 30, step: 1 },
  { key: 'invaderSize', label: 'Invader Size', min: 5, max: 20, step: 1 },
  { key: 'shipYRange', label: 'Ship Y Range', min: 0, max: 80, step: 5 },
  { key: 'waveConfig.weeksPerWave', label: 'Weeks/Wave', min: 1, max: 13, step: 1 },
  { key: 'waveConfig.brightenDuration', label: 'Brighten Dur', min: 10, max: 120, step: 5 },
  { key: 'waveConfig.pluckDuration', label: 'Pluck Dur', min: 5, max: 60, step: 5 },
  { key: 'waveConfig.darkenDuration', label: 'Darken Dur', min: 10, max: 120, step: 5 },
  { key: 'waveConfig.travelDuration', label: 'Travel Dur', min: 10, max: 120, step: 5 },
  { key: 'waveConfig.hatchDuration', label: 'Hatch Dur', min: 5, max: 60, step: 5 },
]

function buildDebugPanel() {
  debugGrid.innerHTML = ''
  for (const def of PARAM_DEFS) {
    const val = getNestedValue(currentConfig, def.key)
    const div = document.createElement('div')
    div.className = 'param'
    div.innerHTML = `
      <label>${def.label}</label>
      <div class="param-row">
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" data-key="${def.key}" />
        <span class="param-value">${val}</span>
      </div>`
    const input = div.querySelector('input')!
    const span = div.querySelector('.param-value')!
    input.addEventListener('input', () => {
      const v = parseFloat(input.value)
      span.textContent = String(v)
      setNestedValue(currentConfig, def.key, v)
    })
    debugGrid.appendChild(div)
  }
}

function getNestedValue(obj: any, path: string): number {
  return path.split('.').reduce((o, k) => o?.[k], obj) ?? 0
}

function setNestedValue(obj: any, path: string, val: number) {
  const parts = path.split('.')
  let o = obj
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]!]
  o[parts[parts.length - 1]!] = val
}

// ── Generate ──
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function triggerGenerate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(doGenerate, 300)
}

function doGenerate() {
  const username = usernameInput.value.trim() || 'demo'
  generateBtn.disabled = true
  generateBtn.textContent = '...'
  previewContainer.classList.add('loading')

  // Use requestAnimationFrame to let the UI update before heavy work
  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        const grid = makeFixtureGrid(53, username)
        const seed = `${username}-${new Date().toISOString().slice(0, 10)}`
        const result = generateSvg(grid, seed, currentConfig)

        animationDuration = result.stats.duration
        setSvgContent(result.svg)
        previewContainer.classList.remove('loading')

        // Stats
        $('#stat-cells')!.textContent = `${result.stats.cells} cells`
        $('#stat-commits')!.textContent = `${result.stats.commits} commits`
        $('#stat-waves')!.textContent = `${result.stats.waves} waves`
        $('#stat-duration')!.textContent = `${result.stats.duration.toFixed(1)}s`
        $('#stat-size')!.textContent = `${(result.stats.size / 1024).toFixed(1)} KB`
        statsRow.style.display = 'flex'
        actionsRow.style.display = 'flex'

        // Reset scrubber
        scrubber.value = '0'
        updateTimeDisplay(0)
        if (isPlaying) startPlaying()
      } catch (e) {
        previewContainer.classList.remove('loading')
        previewContainer.innerHTML = `<p class="preview-placeholder" style="color:#ff4444">Error: ${(e as Error).message}</p>`
      }
      generateBtn.disabled = false
      generateBtn.textContent = 'Generate'
    }, 50)
  })
}

// ── Event Listeners ──
generateBtn.addEventListener('click', doGenerate)
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doGenerate() })

playPause.addEventListener('click', () => {
  if (isPlaying) pauseAnimation()
  else startPlaying()
})

scrubber.addEventListener('input', () => {
  const time = (parseInt(scrubber.value) / 1000) * animationDuration
  if (isPlaying) {
    pauseAnimation()
  }
  seekTo(time)
})

document.querySelectorAll('.btn-theme').forEach(btn => {
  btn.addEventListener('click', () => setTheme((btn as HTMLElement).dataset.theme!))
})

$('#download-svg')!.addEventListener('click', () => {
  if (!currentSvgString) return
  const blob = new Blob([currentSvgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `commit-invaders-${usernameInput.value.trim() || 'demo'}.svg`
  a.click()
  URL.revokeObjectURL(url)
})

$('#toggle-debug')!.addEventListener('click', () => {
  const visible = debugPanel.style.display !== 'none'
  debugPanel.style.display = visible ? 'none' : 'block'
  if (!visible) buildDebugPanel()
})

$('#reset-params')?.addEventListener('click', () => {
  currentConfig = defaultConfig()
  buildDebugPanel()
  triggerGenerate()
})

// ── Init ──
// Auto-generate on load with default username
doGenerate()
