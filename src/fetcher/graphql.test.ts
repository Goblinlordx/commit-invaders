import { beforeEach, describe, it, expect, vi } from 'vitest'

import {
  FIXTURE_ERROR_BAD_TOKEN,
  FIXTURE_ERROR_RATE_LIMIT,
  FIXTURE_ERROR_USER_NOT_FOUND,
  FIXTURE_SMALL,
} from './fixtures.js'
import { fetchContributions, fetchContributionHistory, FetchError } from './graphql.js'

// Mock @octokit/graphql
vi.mock('@octokit/graphql', () => ({
  graphql: vi.fn(),
}))

async function getMockedGraphql() {
  const mod = await import('@octokit/graphql')
  return mod.graphql as unknown as ReturnType<typeof vi.fn>
}

beforeEach(async () => {
  const mockGraphql = await getMockedGraphql()
  mockGraphql.mockReset()
})

describe('fetchContributions', () => {
  it('returns parsed response on success', async () => {
    const mockGraphql = await getMockedGraphql()
    mockGraphql.mockResolvedValueOnce(FIXTURE_SMALL)

    const result = await fetchContributions('ghp_test_token', 'testuser')

    expect(result.user.contributionsCollection.contributionCalendar.totalContributions).toBe(96)
    expect(mockGraphql).toHaveBeenCalledOnce()
  })

  it('passes correct query variables', async () => {
    const mockGraphql = await getMockedGraphql()
    mockGraphql.mockResolvedValueOnce(FIXTURE_SMALL)

    await fetchContributions('ghp_test_token', 'myuser')

    const callArgs = mockGraphql.mock.calls[0] as unknown[]
    expect(callArgs[1]).toMatchObject({
      login: 'myuser',
      headers: {
        authorization: 'token ghp_test_token',
      },
    })
  })

  describe('error handling', () => {
    it('throws FetchError with "auth" code for bad credentials', async () => {
      const mockGraphql = await getMockedGraphql()
      const error = Object.assign(new Error('Bad credentials'), {
        status: 401,
        response: FIXTURE_ERROR_BAD_TOKEN,
      })
      mockGraphql.mockRejectedValueOnce(error)

      await expect(fetchContributions('bad_token', 'testuser')).rejects.toThrow(FetchError)

      try {
        await fetchContributions('bad_token', 'testuser')
      } catch (e) {
        expect(e).toBeInstanceOf(FetchError)
        expect((e as FetchError).code).toBe('auth')
      }
    })

    it('throws FetchError with "not_found" code for unknown user', async () => {
      const mockGraphql = await getMockedGraphql()
      const error = Object.assign(new Error('NOT_FOUND'), {
        status: 200,
        response: FIXTURE_ERROR_USER_NOT_FOUND,
      })
      mockGraphql.mockRejectedValueOnce(error)

      await expect(fetchContributions('ghp_token', 'nonexistent-user')).rejects.toThrow(FetchError)

      try {
        await fetchContributions('ghp_token', 'nonexistent-user')
      } catch (e) {
        expect(e).toBeInstanceOf(FetchError)
        expect((e as FetchError).code).toBe('not_found')
      }
    })

    it('throws FetchError with "rate_limit" code when rate limited', async () => {
      const mockGraphql = await getMockedGraphql()
      const error = Object.assign(new Error('rate limit'), {
        status: 403,
        response: FIXTURE_ERROR_RATE_LIMIT,
      })
      mockGraphql.mockRejectedValueOnce(error)

      await expect(fetchContributions('ghp_token', 'testuser')).rejects.toThrow(FetchError)

      try {
        await fetchContributions('ghp_token', 'testuser')
      } catch (e) {
        expect(e).toBeInstanceOf(FetchError)
        expect((e as FetchError).code).toBe('rate_limit')
      }
    })

    it('throws FetchError with "unknown" code for unexpected errors', async () => {
      const mockGraphql = await getMockedGraphql()
      mockGraphql.mockRejectedValueOnce(new Error('network failure'))

      await expect(fetchContributions('ghp_token', 'testuser')).rejects.toThrow(FetchError)

      try {
        await fetchContributions('ghp_token', 'testuser')
      } catch (e) {
        expect(e).toBeInstanceOf(FetchError)
        expect((e as FetchError).code).toBe('unknown')
      }
    })
  })
})

describe('fetchContributionHistory', () => {
  it('fetches all specified years concurrently', async () => {
    const mockGraphql = await getMockedGraphql()
    mockGraphql.mockResolvedValue(FIXTURE_SMALL)

    const results = await fetchContributionHistory('ghp_token', 'testuser', [2024, 2025, 2026])

    expect(results).toHaveLength(3)
    expect(mockGraphql).toHaveBeenCalledTimes(3)
  })

  it('returns results sorted newest first', async () => {
    const mockGraphql = await getMockedGraphql()
    const calls: string[] = []
    mockGraphql.mockImplementation((_query: string, opts: { from: string }) => {
      calls.push(opts.from)
      return Promise.resolve(FIXTURE_SMALL)
    })

    await fetchContributionHistory('ghp_token', 'testuser', [2020, 2025, 2022])

    expect(calls[0]).toContain('2025')
    expect(calls[1]).toContain('2022')
    expect(calls[2]).toContain('2020')
  })

  it('returns empty array for empty years list', async () => {
    const results = await fetchContributionHistory('ghp_token', 'testuser', [])

    expect(results).toHaveLength(0)
  })

  it('retries on transient failure then succeeds', async () => {
    const mockGraphql = await getMockedGraphql()
    mockGraphql
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(FIXTURE_SMALL)

    const results = await fetchContributionHistory('ghp_token', 'testuser', [2025])

    expect(results).toHaveLength(1)
    expect(mockGraphql).toHaveBeenCalledTimes(2)
  })
})
