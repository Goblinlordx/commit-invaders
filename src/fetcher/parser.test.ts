import { describe, it, expect } from 'vitest'

import type { ContributionLevel, Grid } from '../types.js'

import {
  FIXTURE_EMPTY,
  FIXTURE_PARTIAL_WEEK,
  FIXTURE_SINGLE_WEEK,
  FIXTURE_SMALL,
} from './fixtures.js'
import { parseContributionResponse } from './parser.js'

describe('parseContributionResponse', () => {
  describe('cell count and dimensions', () => {
    it('produces correct number of cells for a 2-week response', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      expect(grid.cells).toHaveLength(14)
    })

    it('has width equal to number of weeks', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      expect(grid.width).toBe(2)
    })

    it('always has height 7', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      expect(grid.height).toBe(7)
    })

    it('handles a single-week response', () => {
      const grid = parseContributionResponse(FIXTURE_SINGLE_WEEK)
      expect(grid.width).toBe(1)
      expect(grid.height).toBe(7)
      expect(grid.cells).toHaveLength(7)
    })

    it('handles partial weeks correctly', () => {
      const grid = parseContributionResponse(FIXTURE_PARTIAL_WEEK)
      expect(grid.width).toBe(2)
      // Partial first week has 3 days, second has 7 = 10 cells
      expect(grid.cells).toHaveLength(10)
    })
  })

  describe('level mapping', () => {
    it('maps NONE to 0', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      const noneCell = grid.cells.find((c) => c.date === '2025-01-05')
      expect(noneCell?.level).toBe(0 satisfies ContributionLevel)
    })

    it('maps FIRST_QUARTILE to 1', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      const cell = grid.cells.find((c) => c.date === '2025-01-06')
      expect(cell?.level).toBe(1 satisfies ContributionLevel)
    })

    it('maps SECOND_QUARTILE to 2', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      const cell = grid.cells.find((c) => c.date === '2025-01-07')
      expect(cell?.level).toBe(2 satisfies ContributionLevel)
    })

    it('maps THIRD_QUARTILE to 3', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      const cell = grid.cells.find((c) => c.date === '2025-01-08')
      expect(cell?.level).toBe(3 satisfies ContributionLevel)
    })

    it('maps FOURTH_QUARTILE to 4', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      const cell = grid.cells.find((c) => c.date === '2025-01-09')
      expect(cell?.level).toBe(4 satisfies ContributionLevel)
    })
  })

  describe('coordinate mapping', () => {
    it('assigns x as week index', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      const week0Cells = grid.cells.filter((c) => c.x === 0)
      const week1Cells = grid.cells.filter((c) => c.x === 1)
      expect(week0Cells).toHaveLength(7)
      expect(week1Cells).toHaveLength(7)
    })

    it('assigns y as day index within the week', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      // First week: days 0-6
      const firstWeek = grid.cells.filter((c) => c.x === 0)
      const yValues = firstWeek.map((c) => c.y).sort((a, b) => a - b)
      expect(yValues).toEqual([0, 1, 2, 3, 4, 5, 6])
    })
  })

  describe('cell data', () => {
    it('preserves date strings', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      const dates = grid.cells.map((c) => c.date)
      expect(dates).toContain('2025-01-05')
      expect(dates).toContain('2025-01-18')
    })

    it('preserves contribution counts', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      const cell = grid.cells.find((c) => c.date === '2025-01-09')
      expect(cell?.count).toBe(20)
    })
  })

  describe('edge cases', () => {
    it('handles empty contribution graph', () => {
      const grid = parseContributionResponse(FIXTURE_EMPTY)
      expect(grid.width).toBe(1)
      expect(grid.cells.every((c) => c.level === 0)).toBe(true)
    })

    it('returns a valid Grid type', () => {
      const grid = parseContributionResponse(FIXTURE_SMALL)
      // Type check: Grid has height 7
      const typedGrid: Grid = grid
      expect(typedGrid.height).toBe(7)
    })
  })
})
