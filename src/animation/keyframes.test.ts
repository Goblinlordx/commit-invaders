import { describe, it, expect } from 'vitest'

import {
  oscillationKeyframes,
  travelKeyframes,
  fadeKeyframes,
  constantVelocityKeyframes,
  wiggleKeyframes,
  opacityKeyframes,
  sharedKeyframes,
} from './keyframes.js'

describe('keyframes', () => {
  it('oscillationKeyframes generates multi-stop transform keyframes', () => {
    const kf = oscillationKeyframes('osc-0', [
      { percent: 0, x: 0, y: 0 },
      { percent: 50, x: 80, y: 0 },
      { percent: 51, x: 80, y: 13 },
      { percent: 100, x: 0, y: 13 },
    ])
    expect(kf).toContain('@keyframes osc-0')
    expect(kf).toContain('0.00%')
    expect(kf).toContain('50.00%')
    expect(kf).toContain('translate(80.0px, 0.0px)')
    expect(kf).toContain('translate(0.0px, 13.0px)')
  })

  it('oscillationKeyframes returns empty for no points', () => {
    expect(oscillationKeyframes('empty', [])).toBe('')
  })

  it('travelKeyframes uses CSS custom properties', () => {
    const kf = travelKeyframes('cell-travel')
    expect(kf).toContain('@keyframes cell-travel')
    expect(kf).toContain('var(--start-x)')
    expect(kf).toContain('var(--end-x)')
    expect(kf).toContain('var(--start-size)')
    expect(kf).toContain('var(--end-size)')
  })

  it('fadeKeyframes generates opacity transition', () => {
    const kf = fadeKeyframes('fade-in', 0, 1)
    expect(kf).toContain('@keyframes fade-in')
    expect(kf).toContain('opacity: 0')
    expect(kf).toContain('opacity: 1')
  })

  it('constantVelocityKeyframes generates translateX', () => {
    const kf = constantVelocityKeyframes('laser-travel')
    expect(kf).toContain('@keyframes laser-travel')
    expect(kf).toContain('translateX(0)')
    expect(kf).toContain('var(--laser-travel)')
  })

  it('wiggleKeyframes generates vertical oscillation', () => {
    const kf = wiggleKeyframes('wiggle-score', 3)
    expect(kf).toContain('@keyframes wiggle-score')
    expect(kf).toContain('translateY(-3px)')
    expect(kf).toContain('translateY(3px)')
    expect(kf).toContain('translateY(0)')
  })

  it('opacityKeyframes generates multi-stop opacity', () => {
    const kf = opacityKeyframes('overlay', [
      { percent: 0, opacity: 0 },
      { percent: 50, opacity: 0.6 },
      { percent: 100, opacity: 0 },
    ])
    expect(kf).toContain('@keyframes overlay')
    expect(kf).toContain('0.00%')
    expect(kf).toContain('opacity: 0.600')
  })

  it('sharedKeyframes returns all base animations', () => {
    const all = sharedKeyframes()
    expect(all).toContain('@keyframes fade-in')
    expect(all).toContain('@keyframes fade-out')
    expect(all).toContain('@keyframes cell-travel')
    expect(all).toContain('@keyframes laser-travel')
    expect(all).toContain('@keyframes wiggle-score')
    expect(all).toContain('@keyframes wiggle-nhs')
  })
})
