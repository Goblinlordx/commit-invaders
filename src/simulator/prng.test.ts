import { describe, it, expect } from 'vitest'
import { createPRNG } from './prng.js'

describe('PRNG', () => {
  describe('determinism', () => {
    it('produces identical sequence from same seed', () => {
      const a = createPRNG('test-seed')
      const b = createPRNG('test-seed')

      const seqA = Array.from({ length: 100 }, () => a.next())
      const seqB = Array.from({ length: 100 }, () => b.next())

      expect(seqA).toEqual(seqB)
    })

    it('produces different sequences from different seeds', () => {
      const a = createPRNG('seed-one')
      const b = createPRNG('seed-two')

      const seqA = Array.from({ length: 20 }, () => a.next())
      const seqB = Array.from({ length: 20 }, () => b.next())

      expect(seqA).not.toEqual(seqB)
    })
  })

  describe('next()', () => {
    it('returns values between 0 and 1', () => {
      const rng = createPRNG('bounds-test')

      for (let i = 0; i < 1000; i++) {
        const val = rng.next()
        expect(val).toBeGreaterThanOrEqual(0)
        expect(val).toBeLessThan(1)
      }
    })
  })

  describe('range()', () => {
    it('returns integers within the specified range inclusive', () => {
      const rng = createPRNG('range-test')

      for (let i = 0; i < 500; i++) {
        const val = rng.range(3, 12)
        expect(val).toBeGreaterThanOrEqual(3)
        expect(val).toBeLessThanOrEqual(12)
        expect(Number.isInteger(val)).toBe(true)
      }
    })

    it('returns min when min equals max', () => {
      const rng = createPRNG('range-equal')
      expect(rng.range(5, 5)).toBe(5)
    })

    it('covers the full range over many samples', () => {
      const rng = createPRNG('range-coverage')
      const seen = new Set<number>()

      for (let i = 0; i < 1000; i++) {
        seen.add(rng.range(0, 4))
      }

      expect(seen.size).toBe(5) // 0, 1, 2, 3, 4
    })
  })

  describe('float()', () => {
    it('returns floats within the specified range', () => {
      const rng = createPRNG('float-test')

      for (let i = 0; i < 500; i++) {
        const val = rng.float(-2.5, 2.5)
        expect(val).toBeGreaterThanOrEqual(-2.5)
        expect(val).toBeLessThan(2.5)
      }
    })
  })

  describe('chance()', () => {
    it('returns true roughly at the given probability', () => {
      const rng = createPRNG('chance-test')
      let trueCount = 0
      const trials = 10000

      for (let i = 0; i < trials; i++) {
        if (rng.chance(0.3)) trueCount++
      }

      const ratio = trueCount / trials
      expect(ratio).toBeGreaterThan(0.25)
      expect(ratio).toBeLessThan(0.35)
    })

    it('returns false when probability is 0', () => {
      const rng = createPRNG('chance-zero')
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(0)).toBe(false)
      }
    })

    it('returns true when probability is 1', () => {
      const rng = createPRNG('chance-one')
      for (let i = 0; i < 100; i++) {
        expect(rng.chance(1)).toBe(true)
      }
    })
  })

  describe('pick()', () => {
    it('returns an element from the array', () => {
      const rng = createPRNG('pick-test')
      const items = ['a', 'b', 'c', 'd'] as const

      for (let i = 0; i < 100; i++) {
        const val = rng.pick(items)
        expect(items).toContain(val)
      }
    })

    it('covers all elements over many samples', () => {
      const rng = createPRNG('pick-coverage')
      const items = [1, 2, 3] as const
      const seen = new Set<number>()

      for (let i = 0; i < 500; i++) {
        seen.add(rng.pick(items))
      }

      expect(seen.size).toBe(3)
    })
  })
})
