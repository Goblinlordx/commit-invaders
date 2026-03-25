import type { PRNG } from '../types.js'

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash >>> 0 // Ensure unsigned
}

// Mulberry32 — fast, high-quality 32-bit PRNG
function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createPRNG(seed: string): PRNG {
  const raw = mulberry32(hashString(seed))

  return {
    next: raw,

    range(min: number, max: number): number {
      if (min === max) return min
      return min + Math.floor(raw() * (max - min + 1))
    },

    float(min: number, max: number): number {
      return min + raw() * (max - min)
    },

    chance(probability: number): boolean {
      if (probability <= 0) return false
      if (probability >= 1) return true
      return raw() < probability
    },

    pick<T>(array: readonly T[]): T {
      return array[Math.floor(raw() * array.length)] as T
    },
  }
}
