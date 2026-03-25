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
