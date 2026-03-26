import type { ContributionCell, ContributionLevel, Grid } from '../types.js'

import type {
  GitHubContributionDay,
  GitHubGraphQLResponse,
} from './fixtures.js'

const LEVEL_MAP: Record<
  GitHubContributionDay['contributionLevel'],
  ContributionLevel
> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
}

export function parseContributionResponse(
  response: GitHubGraphQLResponse,
): Grid {
  const { weeks } =
    response.user.contributionsCollection.contributionCalendar

  const cells: ContributionCell[] = []

  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
    const week = weeks[weekIndex]!
    for (let dayIndex = 0; dayIndex < week.contributionDays.length; dayIndex++) {
      const day = week.contributionDays[dayIndex]!
      cells.push({
        x: weekIndex,
        y: dayIndex,
        level: LEVEL_MAP[day.contributionLevel],
        date: day.date,
        count: day.contributionCount,
      })
    }
  }

  return {
    width: weeks.length,
    height: 7,
    cells,
  }
}

/**
 * Parse multiple yearly responses into a single combined grid.
 * Used for scoreboard historical data.
 */
export function parseMultiYearResponses(responses: import('./fixtures.js').GitHubGraphQLResponse[]): import('../types.js').Grid {
  const allCells: import('../types.js').Grid['cells'] = []
  const seenDates = new Set<string>()

  for (const response of responses) {
    const calendar = response.user.contributionsCollection.contributionCalendar
    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        if (seenDates.has(day.date)) continue
        seenDates.add(day.date)
        allCells.push({
          x: 0, // will be recomputed
          y: 0,
          level: dayLevelToContributionLevel(day.contributionLevel),
          date: day.date,
          count: day.contributionCount,
        })
      }
    }
  }

  // Sort by date and assign x/y grid positions
  allCells.sort((a, b) => a.date.localeCompare(b.date))
  if (allCells.length === 0) return { width: 0, height: 7, cells: [] }

  const startDate = new Date(allCells[0]!.date)
  for (const cell of allCells) {
    const d = new Date(cell.date)
    const diffDays = Math.round((d.getTime() - startDate.getTime()) / 86400000)
    cell.x = Math.floor(diffDays / 7)
    cell.y = diffDays % 7
  }

  const maxWeek = Math.max(...allCells.map(c => c.x)) + 1
  return { width: maxWeek, height: 7, cells: allCells }
}

function dayLevelToContributionLevel(level: string): import('../types.js').ContributionLevel {
  switch (level) {
    case 'FIRST_QUARTILE': return 1
    case 'SECOND_QUARTILE': return 2
    case 'THIRD_QUARTILE': return 3
    case 'FOURTH_QUARTILE': return 4
    default: return 0
  }
}
