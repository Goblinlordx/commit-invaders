import { describe, it, expect } from 'vitest'

import type { Grid, SimConfig, ContributionLevel } from '../types.js'
import { createPRNG } from '../simulator/prng.js'
import { generateAnimatedSvg } from './svg-compositor.js'
import { INVADER_COLOR, PLUCK_COLOR } from './entity-templates.js'

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

const STRIDE = 13, PADDING = 20
const gridW = 7 * STRIDE + PADDING * 2, gridH = 52 * STRIDE, shipMargin = 24

const config: SimConfig = {
  framesPerSecond: 60, hitChance: 0.85, fireRate: 5,
  waveConfig: {
    weeksPerWave: 4, startDelay: 10, spawnDelay: 0,
    brightenDuration: 10, pluckDuration: 10, darkenDuration: 10,
    travelDuration: 10, hatchDuration: 10,
    endingFadeoutDuration: 10, endingScoreDuration: 10,
    endingScoreOutDuration: 5, endingBoardInDuration: 5,
    endingHoldDuration: 10, endingBlackoutDuration: 10, endingResetDuration: 10,
  },
  playArea: { x: 0, y: 0, width: gridW, height: gridH + shipMargin },
  gridArea: { x: PADDING, y: 0, width: 7 * STRIDE, height: gridH },
  cellSize: 11, cellGap: 2, laserSpeed: 1200, laserWidth: 4, invaderSize: 9,
  shipSpeed: 180, shipY: gridH + shipMargin - 4,
  formationBaseSpeed: 60, formationMaxSpeed: 240, formationRowDrop: 7,
  shipYRange: 30, formationSpread: 10, formationRowStagger: 10,
}

describe('svg-compositor', () => {
  it('generates valid SVG string', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('<style>')
    expect(svg).toContain('@keyframes')
    expect(svg).toContain('viewBox=')
  })

  it('contains grid cells', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    expect(svg).toContain('class="gc"')
  })

  it('contains overlay', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    expect(svg).toContain('overlay')
  })

  it('contains formation groups', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    expect(svg).toContain('osc-') // oscillation keyframes
  })

  it('contains invaders with destroy keyframes', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    expect(svg).toContain('inv-') // invader keyframes
    expect(svg).toContain(INVADER_COLOR)
  })

  it('contains ship', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    expect(svg).toContain('sprite-ship')
    expect(svg).toContain('ship-move')
  })

  it('contains lasers', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    expect(svg).toContain('lsr-') // laser keyframes
    expect(svg).toContain('#ffff00')
  })

  it('contains lifecycle cells', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    // Styled mode: pluck rect + invader sprite hatch
    expect(svg).toContain(PLUCK_COLOR)
    expect(svg).toContain('lc-pluck-')
  })

  it('SVG is GitHub-safe (no script tags)', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('javascript:')
    expect(svg).not.toContain('onclick')
  })

  it('SVG size is reasonable for small grid', () => {
    const grid = makeGrid(4, 'test-svg')
    const svg = generateAnimatedSvg(grid, 'test', config)

    // Small grid should be under 500KB
    expect(svg.length).toBeLessThan(500 * 1024)
    console.log(`  SVG size (4 weeks): ${(svg.length / 1024).toFixed(1)} KB`)
  })
})
