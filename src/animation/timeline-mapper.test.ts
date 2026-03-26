import { describe, it, expect } from 'vitest'

import { frameToSeconds, frameToPercent, totalDuration } from './timeline-mapper.js'

describe('timeline-mapper', () => {
  it('frameToSeconds converts correctly', () => {
    expect(frameToSeconds(60, 60)).toBe(1)
    expect(frameToSeconds(120, 60)).toBe(2)
    expect(frameToSeconds(0, 60)).toBe(0)
    expect(frameToSeconds(30, 60)).toBe(0.5)
  })

  it('frameToPercent converts correctly', () => {
    expect(frameToPercent(0, 100)).toBe(0)
    expect(frameToPercent(50, 100)).toBe(50)
    expect(frameToPercent(100, 100)).toBe(100)
    expect(frameToPercent(0, 0)).toBe(0)
  })

  it('totalDuration computes correctly', () => {
    expect(totalDuration(600, 60)).toBe(10)
    expect(totalDuration(1800, 60)).toBe(30)
  })
})
