// Test fixtures for GitHub GraphQL API contribution calendar responses

export interface GitHubContributionDay {
  contributionCount: number
  contributionLevel:
    | 'NONE'
    | 'FIRST_QUARTILE'
    | 'SECOND_QUARTILE'
    | 'THIRD_QUARTILE'
    | 'FOURTH_QUARTILE'
  date: string
}

export interface GitHubContributionWeek {
  contributionDays: GitHubContributionDay[]
}

export interface GitHubContributionCalendar {
  totalContributions: number
  weeks: GitHubContributionWeek[]
}

export interface GitHubGraphQLResponse {
  user: {
    contributionsCollection: {
      contributionCalendar: GitHubContributionCalendar
      contributionYears?: number[]
    }
  }
}

export function makeFixtureResponse(
  weeks: GitHubContributionWeek[],
  totalContributions = 0,
): GitHubGraphQLResponse {
  return {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions,
          weeks,
        },
      },
    },
  }
}

export function makeWeek(
  days: GitHubContributionDay[],
): GitHubContributionWeek {
  return { contributionDays: days }
}

export function makeDay(
  date: string,
  count: number,
  level: GitHubContributionDay['contributionLevel'] = 'NONE',
): GitHubContributionDay {
  return { contributionCount: count, contributionLevel: level, date }
}

// --- Pre-built fixtures ---

/** A minimal 2-week response with known values */
export const FIXTURE_SMALL: GitHubGraphQLResponse = makeFixtureResponse(
  [
    makeWeek([
      makeDay('2025-01-05', 0, 'NONE'),
      makeDay('2025-01-06', 3, 'FIRST_QUARTILE'),
      makeDay('2025-01-07', 7, 'SECOND_QUARTILE'),
      makeDay('2025-01-08', 12, 'THIRD_QUARTILE'),
      makeDay('2025-01-09', 20, 'FOURTH_QUARTILE'),
      makeDay('2025-01-10', 1, 'FIRST_QUARTILE'),
      makeDay('2025-01-11', 0, 'NONE'),
    ]),
    makeWeek([
      makeDay('2025-01-12', 5, 'FIRST_QUARTILE'),
      makeDay('2025-01-13', 0, 'NONE'),
      makeDay('2025-01-14', 15, 'THIRD_QUARTILE'),
      makeDay('2025-01-15', 0, 'NONE'),
      makeDay('2025-01-16', 8, 'SECOND_QUARTILE'),
      makeDay('2025-01-17', 0, 'NONE'),
      makeDay('2025-01-18', 25, 'FOURTH_QUARTILE'),
    ]),
  ],
  96,
)

/** A single-week response (edge case) */
export const FIXTURE_SINGLE_WEEK: GitHubGraphQLResponse = makeFixtureResponse(
  [
    makeWeek([
      makeDay('2025-03-02', 0, 'NONE'),
      makeDay('2025-03-03', 2, 'FIRST_QUARTILE'),
      makeDay('2025-03-04', 0, 'NONE'),
      makeDay('2025-03-05', 0, 'NONE'),
      makeDay('2025-03-06', 10, 'SECOND_QUARTILE'),
      makeDay('2025-03-07', 0, 'NONE'),
      makeDay('2025-03-08', 0, 'NONE'),
    ]),
  ],
  12,
)

/** Empty contribution graph (all NONE) */
export const FIXTURE_EMPTY: GitHubGraphQLResponse = makeFixtureResponse(
  [
    makeWeek([
      makeDay('2025-01-05', 0, 'NONE'),
      makeDay('2025-01-06', 0, 'NONE'),
      makeDay('2025-01-07', 0, 'NONE'),
      makeDay('2025-01-08', 0, 'NONE'),
      makeDay('2025-01-09', 0, 'NONE'),
      makeDay('2025-01-10', 0, 'NONE'),
      makeDay('2025-01-11', 0, 'NONE'),
    ]),
  ],
  0,
)

/** Partial week (GitHub sometimes returns fewer than 7 days in first/last week) */
export const FIXTURE_PARTIAL_WEEK: GitHubGraphQLResponse = makeFixtureResponse(
  [
    makeWeek([
      makeDay('2025-01-09', 5, 'FIRST_QUARTILE'),
      makeDay('2025-01-10', 0, 'NONE'),
      makeDay('2025-01-11', 3, 'FIRST_QUARTILE'),
    ]),
    makeWeek([
      makeDay('2025-01-12', 0, 'NONE'),
      makeDay('2025-01-13', 10, 'SECOND_QUARTILE'),
      makeDay('2025-01-14', 0, 'NONE'),
      makeDay('2025-01-15', 0, 'NONE'),
      makeDay('2025-01-16', 0, 'NONE'),
      makeDay('2025-01-17', 20, 'FOURTH_QUARTILE'),
      makeDay('2025-01-18', 0, 'NONE'),
    ]),
  ],
  38,
)

// --- Error response fixtures ---

export const FIXTURE_ERROR_BAD_TOKEN = {
  message: 'Bad credentials',
  documentation_url:
    'https://docs.github.com/graphql',
}

export const FIXTURE_ERROR_USER_NOT_FOUND = {
  data: { user: null },
  errors: [
    {
      type: 'NOT_FOUND',
      path: ['user'],
      locations: [{ line: 2, column: 3 }],
      message: "Could not resolve to a User with the login of 'nonexistent-user'.",
    },
  ],
}

export const FIXTURE_ERROR_RATE_LIMIT = {
  message: 'API rate limit exceeded for user ID 12345.',
  documentation_url:
    'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
}
