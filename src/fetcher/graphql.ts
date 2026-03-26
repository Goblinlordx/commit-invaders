import { graphql } from '@octokit/graphql'

import type { GitHubGraphQLResponse } from './fixtures.js'

const CONTRIBUTION_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              contributionLevel
              date
            }
          }
        }
      }
    }
  }
`

export type FetchErrorCode = 'auth' | 'not_found' | 'rate_limit' | 'unknown'

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly code: FetchErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

function classifyError(error: unknown): FetchError {
  if (error instanceof Error) {
    const statusError = error as Error & { status?: number }

    if (statusError.status === 401) {
      return new FetchError(
        'Invalid GitHub token. Check that your token has the read:user scope.',
        'auth',
        error,
      )
    }

    if (statusError.status === 403 || /rate limit/i.test(error.message)) {
      return new FetchError(
        'GitHub API rate limit exceeded. Try again later.',
        'rate_limit',
        error,
      )
    }

    if (/not.found/i.test(error.message) || statusError.status === 404) {
      return new FetchError(
        'GitHub user not found. Check the username.',
        'not_found',
        error,
      )
    }

    return new FetchError(error.message, 'unknown', error)
  }

  return new FetchError('An unknown error occurred', 'unknown', error)
}

export async function fetchContributions(
  token: string,
  username: string,
): Promise<GitHubGraphQLResponse> {
  try {
    const response = await graphql<GitHubGraphQLResponse>(CONTRIBUTION_QUERY, {
      login: username,
      headers: {
        authorization: `token ${token}`,
      },
    })

    return response
  } catch (error: unknown) {
    throw classifyError(error)
  }
}

const CONTRIBUTION_HISTORY_QUERY = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              contributionLevel
              date
            }
          }
        }
      }
    }
  }
`

/**
 * Fetch contribution history for multiple years.
 * Returns an array of yearly responses, newest first.
 */
export async function fetchContributionHistory(
  token: string,
  username: string,
  years: number = 5,
): Promise<GitHubGraphQLResponse[]> {
  const results: GitHubGraphQLResponse[] = []
  const currentYear = new Date().getFullYear()

  for (let i = 0; i < years; i++) {
    const year = currentYear - i
    try {
      const response = await graphql<GitHubGraphQLResponse>(CONTRIBUTION_HISTORY_QUERY, {
        login: username,
        from: `${year}-01-01T00:00:00Z`,
        to: `${year + 1}-01-01T00:00:00Z`,
        headers: {
          authorization: `token ${token}`,
        },
      })
      results.push(response)
    } catch {
      // Stop on error (e.g., account didn't exist yet)
      break
    }
  }

  return results
}
