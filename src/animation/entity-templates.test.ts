import { describe, it, expect } from 'vitest'

import {
  gridCellSvg,
  invaderSvg,
  shipSvg,
  laserSvg,
  overlaySvg,
  blackoutSvg,
  formationGroupSvg,
  lifecycleCellSvg,
  GRID_COLORS,
  INVADER_COLOR,
  SHIP_COLOR,
  LASER_COLOR,
  PLUCK_COLOR,
} from './entity-templates.js'

describe('entity-templates', () => {
  it('gridCellSvg renders rect with level color', () => {
    const svg = gridCellSvg('cell-0-0', 10, 20, 3, 11)
    expect(svg).toContain('id="cell-0-0"')
    expect(svg).toContain('x="10"')
    expect(svg).toContain('y="20"')
    expect(svg).toContain('width="11"')
    expect(svg).toContain('height="11"')
    expect(svg).toContain(`fill="${GRID_COLORS[3]}"`)
  })

  it('gridCellSvg uses level-0 color for empty cells', () => {
    const svg = gridCellSvg('cell-0-0', 0, 0, 0, 11)
    expect(svg).toContain(`fill="${GRID_COLORS[0]}"`)
  })

  it('invaderSvg renders centered rect', () => {
    const svg = invaderSvg('inv-0', 100, 50, 9)
    expect(svg).toContain('id="inv-0"')
    expect(svg).toContain('x="95.5"')
    expect(svg).toContain('y="45.5"')
    expect(svg).toContain('width="9"')
    expect(svg).toContain(`fill="${INVADER_COLOR}"`)
  })

  it('shipSvg renders centered rect with ship color', () => {
    const svg = shipSvg('ship', 50, 200, 9)
    expect(svg).toContain(`fill="${SHIP_COLOR}"`)
    expect(svg).toContain('x="45.5"')
  })

  it('laserSvg renders centered rect with laser color', () => {
    const svg = laserSvg('laser-0', 100, 150, 4)
    expect(svg).toContain(`fill="${LASER_COLOR}"`)
    expect(svg).toContain('width="4"')
  })

  it('overlaySvg renders full-area rect with opacity', () => {
    const svg = overlaySvg('overlay', 700, 131, 0.6)
    expect(svg).toContain('width="700"')
    expect(svg).toContain('height="131"')
    expect(svg).toContain('opacity="0.6"')
  })

  it('blackoutSvg renders black rect with opacity 0', () => {
    const svg = blackoutSvg('blackout', 700, 131)
    expect(svg).toContain('fill="#000000"')
    expect(svg).toContain('opacity="0"')
  })

  it('formationGroupSvg wraps children in g element', () => {
    const child = invaderSvg('inv-0', 100, 50, 9)
    const svg = formationGroupSvg('formation-0', child)
    expect(svg).toContain('<g id="formation-0"')
    expect(svg).toContain('class="formation"')
    expect(svg).toContain(child)
  })

  it('lifecycleCellSvg renders centered rect with pluck color', () => {
    const svg = lifecycleCellSvg('lc-0', 100, 50, 11, PLUCK_COLOR)
    expect(svg).toContain(`fill="${PLUCK_COLOR}"`)
    expect(svg).toContain('class="lifecycle-cell"')
  })
})
