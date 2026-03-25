import type { Grid, SimConfig, ContributionLevel } from '../src/types.js'
import { composeSvg } from '../src/animation/svg-compositor.js'
import { simulate } from '../src/simulator/simulate.js'
import { computeScoreboard } from '../src/scoreboard.js'
import { createPRNG } from '../src/simulator/prng.js'
import { PALETTE_DARK, PALETTE_LIGHT, PALETTE_CLASSIC, type ColorPalette } from '../src/animation/entity-templates.js'

const PALETTES: Record<string, ColorPalette> = {
  dark: PALETTE_DARK,
  light: PALETTE_LIGHT,
  classic: PALETTE_CLASSIC,
}

// ── Layout constants ──
const CELL_SIZE = 11
const CELL_GAP = 2
const STRIDE = CELL_SIZE + CELL_GAP
const PADDING = 20

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
let currentTheme = 'dark'
let animDuration = 0
let isPlaying = true
let playRaf = 0
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
const usernameInput = $('#gh-user') as HTMLInputElement
const statsRow = $('#stats-row') as HTMLElement
const actionsRow = $('#actions-row') as HTMLElement
const debugPanel = $('#debug-panel') as HTMLElement
const debugGrid = $('#debug-grid') as HTMLElement

// ── Fetch real GitHub contributions ──
async function fetchContributionGrid(username: string): Promise<Grid | null> {
  try {
    // Try multiple fetch strategies:
    // 1. Vite dev proxy (dev mode)
    // 2. CORS proxy (production)
    const urls = [
      `/api/contributions/${username}`,
      `https://corsproxy.io/?url=${encodeURIComponent(`https://github.com/users/${username}/contributions`)}`,
    ]
    let res: Response | null = null
    for (const url of urls) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (r.ok) { res = r; break }
      } catch { /* try next */ }
    }
    if (!res) return null
    const html = await res.text()

    // Parse contribution calendar from HTML
    // Each day is a <td> with data-date and data-level attributes
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const days = doc.querySelectorAll('td[data-date][data-level]')
    if (days.length === 0) return null

    const cells: Grid['cells'] = []
    const dateToWeekDay = new Map<string, { week: number; day: number }>()

    // Collect all dates and sort to determine week/day mapping
    const dates: string[] = []
    days.forEach(td => {
      const date = td.getAttribute('data-date')!
      dates.push(date)
    })
    dates.sort()

    // Map dates to week/day grid positions
    const startDate = new Date(dates[0]!)
    for (const date of dates) {
      const d = new Date(date)
      const diffDays = Math.round((d.getTime() - startDate.getTime()) / 86400000)
      const week = Math.floor(diffDays / 7)
      const day = diffDays % 7
      dateToWeekDay.set(date, { week, day })
    }

    days.forEach(td => {
      const date = td.getAttribute('data-date')!
      const level = parseInt(td.getAttribute('data-level') || '0', 10) as ContributionLevel
      const pos = dateToWeekDay.get(date)
      if (!pos) return

      // Count from tooltip text or estimate from level
      let count = 0
      const tooltip = td.querySelector('.sr-only')?.textContent || td.getAttribute('aria-label') || ''
      const match = tooltip.match(/(\d+)\s+contribution/)
      if (match) count = parseInt(match[1]!, 10)
      else count = level === 0 ? 0 : level * 3

      cells.push({ x: pos.week, y: pos.day, level, date, count })
    })

    const maxWeek = Math.max(...cells.map(c => c.x)) + 1
    return { width: maxWeek, height: 7, cells }
  } catch {
    return null
  }
}

// ── Fixture grid (fallback) ──
function makeFixtureGrid(weeks: number, seed: string): Grid {
  const prng = createPRNG(seed)
  const cells = []
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const roll = prng.next()
      let level: ContributionLevel
      // ~19% active — matches typical real GitHub profiles
      if (roll < 0.81) level = 0
      else if (roll < 0.89) level = 1
      else if (roll < 0.94) level = 2
      else if (roll < 0.98) level = 3
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

// ── SVG Scrubber ──
// Animations are now class-based (not inline style), so we can override with !important.
// Inject a <style> inside the SVG to pause and seek.

function getScrubStyle(): HTMLStyleElement | null {
  const svg = previewContainer.querySelector('svg')
  if (!svg) return null
  let el = svg.querySelector('#scrub') as HTMLStyleElement
  if (!el) {
    el = document.createElementNS('http://www.w3.org/2000/svg', 'style') as any
    el.id = 'scrub'
    svg.appendChild(el)
  }
  return el
}

function seekTo(timeSec: number) {
  if (!animDuration || !isFinite(timeSec)) return
  const clamped = Math.max(0, Math.min(animDuration - 0.001, timeSec))
  const s = getScrubStyle()
  if (!s) return
  s.textContent = `* { animation-play-state: paused !important; animation-delay: -${clamped.toFixed(3)}s !important; }`
  updateTimeDisplay(clamped)
}

function clearScrub() {
  const s = getScrubStyle()
  if (s) s.textContent = ''
}

function startPlaying() {
  isPlaying = true
  playPause.textContent = '⏸'

  const curTime = (parseInt(scrubber.value) / 1000) * animDuration
  playStartOffset = curTime
  playStartTime = performance.now()

  cancelAnimationFrame(playRaf)
  const tick = () => {
    if (!isPlaying) return
    const elapsed = (performance.now() - playStartTime) / 1000
    const t = (playStartOffset + elapsed) % animDuration
    // Drive the animation by setting delay — always paused, always in sync
    seekTo(t)
    scrubber.value = String(Math.floor((t / animDuration) * 1000))
    playRaf = requestAnimationFrame(tick)
  }
  playRaf = requestAnimationFrame(tick)
}

function pausePlayback() {
  isPlaying = false
  playPause.textContent = '▶'
  cancelAnimationFrame(playRaf)
}

function updateTimeDisplay(t: number) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  timeDisplay.textContent = `${fmt(t)} / ${fmt(animDuration)}`
}

// ── Generation ──
async function doGenerate() {
  const username = usernameInput.value.trim() || 'demo'
  generateBtn.disabled = true
  generateBtn.textContent = '...'
  previewContainer.innerHTML = '<p class="preview-placeholder" style="color: var(--accent); font-family: var(--font-display); font-size: 0.7rem;">Fetching contributions...</p>'

  try {
    // Try fetching real GitHub data, fall back to fixture
    let grid = await fetchContributionGrid(username)
    if (!grid) {
      previewContainer.innerHTML = '<p class="preview-placeholder" style="color: var(--accent); font-family: var(--font-display); font-size: 0.7rem;">Generating...</p>'
      grid = makeFixtureGrid(53, username)
    }

    await new Promise(r => setTimeout(r, 10)) // yield for UI update

    try {
        const seed = `${username}-${new Date().toISOString().slice(0, 10)}`
        const output = simulate(grid, seed, currentConfig)
        const lastDate = grid.cells.reduce((max, c) => (c.date > max ? c.date : max), '')
        const scoreboard = computeScoreboard(grid, lastDate, grid.width * 7, 10)

        const palette = PALETTES[currentTheme] ?? PALETTE_DARK
        currentSvgString = composeSvg({ grid, seed, config: currentConfig, scoreboard, palette })
        animDuration = output.totalFrames / currentConfig.framesPerSecond

        // Insert SVG with animations paused — JS drives the time
        previewContainer.innerHTML = currentSvgString
        seekTo(0)
        playStartOffset = 0

        const activeCells = grid.cells.filter(c => c.level > 0).length
        const totalCommits = grid.cells.reduce((sum, c) => sum + c.count, 0)
        const waveCount = output.events.filter(e => e.type === 'wave_spawn').length
        $('#stat-cells')!.textContent = `${activeCells} cells`
        $('#stat-commits')!.textContent = `${totalCommits} commits`
        $('#stat-waves')!.textContent = `${waveCount} waves`
        $('#stat-duration')!.textContent = `${animDuration.toFixed(1)}s`
        $('#stat-size')!.textContent = `${(currentSvgString.length / 1024).toFixed(1)} KB`
        statsRow.style.display = 'flex'
        actionsRow.style.display = 'flex'

        scrubber.value = '0'
        updateTimeDisplay(0)
        isPlaying = true
        startPlaying()
    } catch (e) {
      previewContainer.innerHTML = `<p class="preview-placeholder" style="color:#ff4444">Error: ${(e as Error).message}</p>`
    }
  } catch (e) {
    previewContainer.innerHTML = `<p class="preview-placeholder" style="color:#ff4444">Error: ${(e as Error).message}</p>`
  }
  generateBtn.disabled = false
  generateBtn.textContent = 'Generate'
}

// ── Theme ──
function setTheme(theme: string) {
  currentTheme = theme
  document.querySelectorAll('.btn-theme').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === theme)
  })
  previewFrame.classList.toggle('classic', theme === 'classic')
  // Regenerate SVG with new palette
  if (currentSvgString) doGenerate()
}

// ── Debug Panel ──
const PARAM_DEFS = [
  { key: 'hitChance', label: 'Hit Chance', min: 0.1, max: 1, step: 0.05 },
  { key: 'fireRate', label: 'Fire Rate', min: 1, max: 20, step: 1 },
  { key: 'laserSpeed', label: 'Laser Speed', min: 60, max: 960, step: 10 },
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
      span.textContent = input.value
      setNestedValue(currentConfig, def.key, parseFloat(input.value))
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

// ── Event Listeners ──
generateBtn.addEventListener('click', doGenerate)
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doGenerate() })

playPause.addEventListener('click', () => {
  if (isPlaying) pausePlayback()
  else startPlaying()
})

scrubber.addEventListener('input', () => {
  if (isPlaying) {
    isPlaying = false
    playPause.textContent = '▶'
    cancelAnimationFrame(playRaf)
  }
  seekTo((parseInt(scrubber.value) / 1000) * animDuration)
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
  doGenerate()
})

// ── Init ──
doGenerate()
