import { describe, it, expect } from 'vitest'

import type {
  LaserState,
  InvaderState,
  Position,
  BoundingBox,
  SimConfig,
  ContributionCell,
} from '../types.js'

import {
  spawnLaser,
  advanceLasers,
  checkHits,
  DEFAULT_LASER_WIDTH,
  DEFAULT_INVADER_SIZE,
} from './combat.js'

// ── Factories ──

function makeLaser(overrides: Partial<LaserState> = {}): LaserState {
  return {
    id: 'laser-0',
    position: { x: 50, y: 200 },
    speed: 4,
    active: true,
    ...overrides,
  }
}

function makeCell(overrides: Partial<ContributionCell> = {}): ContributionCell {
  return {
    x: 0,
    y: 0,
    level: 2,
    date: '2026-01-01',
    count: 5,
    ...overrides,
  }
}

function makeInvader(overrides: Partial<InvaderState> = {}): InvaderState {
  return {
    id: 'inv-0',
    cell: makeCell(),
    hp: 1,
    maxHp: 1,
    position: { x: 50, y: 50 },
    destroyed: false,
    destroyedAtFrame: null,
    ...overrides,
  }
}

const playArea: BoundingBox = { x: 0, y: 0, width: 300, height: 400 }

// ── spawnLaser ──

describe('spawnLaser', () => {
  it('creates a laser at the given ship position', () => {
    const ship: Position = { x: 100, y: 350 }
    const laser = spawnLaser('laser-1', ship, 4)

    expect(laser.id).toBe('laser-1')
    expect(laser.position.x).toBe(100)
    expect(laser.position.y).toBe(350)
    expect(laser.speed).toBe(4)
    expect(laser.active).toBe(true)
  })
})

// ── advanceLasers ──

describe('advanceLasers', () => {
  it('moves lasers upward by their speed', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 200 }, speed: 4 })]
    const result = advanceLasers(lasers, playArea)

    expect(result).toHaveLength(1)
    expect(result[0]!.position.y).toBe(196)
  })

  it('removes lasers that leave the play area (y < playArea.y)', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 2 }, speed: 4 })]
    const result = advanceLasers(lasers, playArea)

    expect(result).toHaveLength(0)
  })

  it('keeps lasers at the boundary edge', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 5 }, speed: 4 })]
    const result = advanceLasers(lasers, playArea)

    expect(result).toHaveLength(1)
    expect(result[0]!.position.y).toBe(1)
  })

  it('only removes inactive lasers', () => {
    const lasers = [
      makeLaser({ id: 'a', active: true, position: { x: 50, y: 100 } }),
      makeLaser({ id: 'b', active: false, position: { x: 50, y: 100 } }),
    ]
    const result = advanceLasers(lasers, playArea)

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('a')
  })

  it('handles multiple lasers simultaneously', () => {
    const lasers = [
      makeLaser({ id: 'a', position: { x: 10, y: 100 }, speed: 2 }),
      makeLaser({ id: 'b', position: { x: 20, y: 200 }, speed: 3 }),
      makeLaser({ id: 'c', position: { x: 30, y: 1 }, speed: 4 }),
    ]
    const result = advanceLasers(lasers, playArea)

    expect(result).toHaveLength(2)
    expect(result[0]!.position.y).toBe(98)
    expect(result[1]!.position.y).toBe(197)
  })
})

// ── checkHits ──

describe('checkHits', () => {
  it('detects hit when laser overlaps invader bounding box', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 50 } })]
    const invaders = [makeInvader({ position: { x: 50, y: 50 } })]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]).toEqual({
      laserId: 'laser-0',
      invaderId: 'inv-0',
    })
  })

  it('removes laser on hit', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 50 } })]
    const invaders = [makeInvader({ position: { x: 50, y: 50 } })]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.updatedLasers).toHaveLength(0)
  })

  it('one-hit kill regardless of HP', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 50 } })]
    const invaders = [makeInvader({ hp: 3, maxHp: 3, position: { x: 50, y: 50 } })]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.updatedInvaders[0]!.hp).toBe(0)
    expect(result.updatedInvaders[0]!.destroyed).toBe(true)
  })

  it('marks invader destroyed when HP reaches 0', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 50 } })]
    const invaders = [makeInvader({ hp: 1, maxHp: 1, position: { x: 50, y: 50 } })]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.updatedInvaders[0]!.hp).toBe(0)
    expect(result.updatedInvaders[0]!.destroyed).toBe(true)
  })

  it('increments score by cell.count on each destroy', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 50 } })]
    const invaders = [makeInvader({ hp: 1, position: { x: 50, y: 50 } })]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    // Default cell has count: 5
    expect(result.scoreIncrease).toBe(5)
  })

  it('always increments score on hit (one-hit kill)', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 50 } })]
    const invaders = [makeInvader({ hp: 3, maxHp: 3, position: { x: 50, y: 50 } })]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.scoreIncrease).toBe(5) // cell.count = 5
  })

  it('reports no hits when laser misses all invaders', () => {
    const lasers = [makeLaser({ position: { x: 200, y: 200 } })]
    const invaders = [makeInvader({ position: { x: 50, y: 50 } })]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.hits).toHaveLength(0)
    expect(result.updatedLasers).toHaveLength(1)
    expect(result.updatedInvaders[0]!.hp).toBe(1)
    expect(result.scoreIncrease).toBe(0)
  })

  it('skips already-destroyed invaders', () => {
    const lasers = [makeLaser({ position: { x: 50, y: 50 } })]
    const invaders = [makeInvader({ destroyed: true, hp: 0, position: { x: 50, y: 50 } })]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.hits).toHaveLength(0)
    expect(result.updatedLasers).toHaveLength(1)
  })

  it('one laser hits one invader; second laser and invader unaffected', () => {
    const lasers = [
      makeLaser({ id: 'l1', position: { x: 50, y: 50 } }),
      makeLaser({ id: 'l2', position: { x: 200, y: 200 } }),
    ]
    const invaders = [
      makeInvader({ id: 'i1', hp: 1, position: { x: 50, y: 50 } }),
      makeInvader({ id: 'i2', hp: 1, position: { x: 250, y: 250 } }),
    ]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.hits).toHaveLength(1)
    expect(result.updatedLasers).toHaveLength(1)
    expect(result.updatedLasers[0]!.id).toBe('l2')
    expect(result.scoreIncrease).toBe(5) // cell.count = 5
  })

  it('handles multiple simultaneous destroys', () => {
    const lasers = [
      makeLaser({ id: 'l1', position: { x: 50, y: 50 } }),
      makeLaser({ id: 'l2', position: { x: 150, y: 150 } }),
    ]
    const invaders = [
      makeInvader({ id: 'i1', hp: 1, position: { x: 50, y: 50 } }),
      makeInvader({ id: 'i2', hp: 1, position: { x: 150, y: 150 } }),
    ]

    const result = checkHits(lasers, invaders, DEFAULT_LASER_WIDTH, DEFAULT_INVADER_SIZE)

    expect(result.hits).toHaveLength(2)
    expect(result.updatedLasers).toHaveLength(0)
    expect(result.scoreIncrease).toBe(10) // 2 × cell.count(5)
  })
})
