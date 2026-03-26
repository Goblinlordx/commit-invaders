import { describe, it, expect } from 'vitest'

import { createFormation } from './formation.js'
import type { InvaderState, BoundingBox, ContributionLevel } from '../types.js'

function makeInvader(
  id: string,
  x: number,
  y: number,
  level: ContributionLevel = 2,
  hp = 1,
): InvaderState {
  return {
    id,
    cell: {
      x: Math.floor(x / 20),
      y: Math.floor(y / 20),
      level,
      date: '2026-01-01',
      count: level,
    },
    hp,
    maxHp: hp,
    position: { x, y },
    destroyed: false,
    destroyedAtFrame: null,
  }
}

const defaultPlayArea: BoundingBox = {
  x: 0,
  y: 0,
  width: 400,
  height: 300,
}

const defaultFormationConfig = {
  baseSpeed: 1,
  maxSpeed: 4,
  rowDrop: 20,
  dt: 1, // 1 fps — keeps legacy test values (speed in px/frame)
}

describe('Formation', () => {
  describe('initial positioning', () => {
    it('starts with offset at (0, 0) and direction right', () => {
      const invaders = [makeInvader('inv-0', 100, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      expect(formation.getState().offset).toEqual({ x: 0, y: 0 })
      expect(formation.getState().direction).toBe('right')
    })

    it('tracks all invaders', () => {
      const invaders = [
        makeInvader('inv-0', 100, 20),
        makeInvader('inv-1', 120, 20),
        makeInvader('inv-2', 100, 40),
      ]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      expect(formation.getState().invaders).toHaveLength(3)
    })
  })

  describe('zigzag movement', () => {
    it('moves right on tick', () => {
      const invaders = [makeInvader('inv-0', 100, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      const events = formation.tick(1)
      expect(formation.getState().offset.x).toBeGreaterThan(0)
      expect(formation.getState().direction).toBe('right')
    })

    it('reverses direction at right boundary', () => {
      // Place invader near right edge
      const invaders = [makeInvader('inv-0', 390, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      // Tick until boundary hit
      let reversed = false
      for (let frame = 1; frame <= 20; frame++) {
        formation.tick(frame)
        if (formation.getState().direction === 'left') {
          reversed = true
          break
        }
      }
      expect(reversed).toBe(true)
    })

    it('drops a row when reversing direction', () => {
      // Place invader near right edge
      const invaders = [makeInvader('inv-0', 390, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      // Tick until direction reversal
      for (let frame = 1; frame <= 20; frame++) {
        formation.tick(frame)
        if (formation.getState().direction === 'left') break
      }
      expect(formation.getState().offset.y).toBe(defaultFormationConfig.rowDrop)
    })

    it('reverses direction at left boundary', () => {
      // Place invader near right boundary so it reverses to left quickly
      const invaders = [makeInvader('inv-0', 395, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      // Tick until first reverse (right boundary → left)
      for (let frame = 1; frame <= 20; frame++) {
        formation.tick(frame)
        if (formation.getState().direction === 'left') break
      }
      expect(formation.getState().direction).toBe('left')

      // Now move leftward — keep ticking until left boundary reversal
      for (let frame = 21; frame < 1000; frame++) {
        formation.tick(frame)
        if (formation.getState().direction === 'right') {
          // Reversed at left boundary — should have dropped twice
          expect(formation.getState().offset.y).toBe(defaultFormationConfig.rowDrop * 2)
          return
        }
      }
      expect.unreachable('Should have reversed at left boundary')
    })
  })

  describe('boundary detection', () => {
    it('uses rightmost invader for right boundary', () => {
      const invaders = [
        makeInvader('inv-0', 50, 20),
        makeInvader('inv-1', 380, 20), // rightmost
      ]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      // Rightmost invader at 380, play area is 400 wide
      // Should hit boundary soon
      let reversed = false
      for (let frame = 1; frame <= 30; frame++) {
        formation.tick(frame)
        if (formation.getState().direction === 'left') {
          reversed = true
          break
        }
      }
      expect(reversed).toBe(true)
    })

    it('uses original formation footprint for boundary even after kills', () => {
      const invaders = [makeInvader('inv-0', 50, 20), makeInvader('inv-1', 380, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      // Record steps to reverse with full formation
      let stepsFullFormation = 0
      for (let frame = 1; frame <= 500; frame++) {
        formation.tick(frame)
        stepsFullFormation++
        if (formation.getState().direction === 'left') break
      }

      // Reset by creating new formation, destroy rightmost
      const formation2 = createFormation(
        [makeInvader('inv-0', 50, 20), makeInvader('inv-1', 380, 20)],
        0,
        defaultPlayArea,
        defaultFormationConfig,
      )
      formation2.destroyInvader('inv-1', 0)

      let stepsAfterKill = 0
      for (let frame = 1; frame <= 500; frame++) {
        formation2.tick(frame)
        stepsAfterKill++
        if (formation2.getState().direction === 'left') break
      }
      // Same boundary — same steps to reverse (speed may differ but boundary same)
      // Both should reverse at roughly the same point (boundary = inv-1 at x=380)
      expect(stepsAfterKill).toBeLessThanOrEqual(stepsFullFormation + 5)
    })
  })

  describe('speed increase on kills', () => {
    it('starts at base speed with all invaders alive', () => {
      const invaders = [
        makeInvader('inv-0', 100, 20),
        makeInvader('inv-1', 120, 20),
        makeInvader('inv-2', 140, 20),
        makeInvader('inv-3', 160, 20),
      ]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      expect(formation.getState().speed).toBe(defaultFormationConfig.baseSpeed)
    })

    it('keeps constant speed when invaders are destroyed (for prediction accuracy)', () => {
      const invaders = [
        makeInvader('inv-0', 100, 20),
        makeInvader('inv-1', 120, 20),
        makeInvader('inv-2', 140, 20),
        makeInvader('inv-3', 160, 20),
      ]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      formation.destroyInvader('inv-0', 1)
      formation.destroyInvader('inv-1', 1)

      // Speed stays at baseSpeed — constant for prediction accuracy
      expect(formation.getState().speed).toBe(defaultFormationConfig.baseSpeed)
    })

    it('marks formation cleared when all invaders destroyed', () => {
      const invaders = [makeInvader('inv-0', 100, 20), makeInvader('inv-1', 120, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      formation.destroyInvader('inv-0', 5)
      formation.destroyInvader('inv-1', 10)

      expect(formation.getState().active).toBe(false)
      expect(formation.getState().clearedAtFrame).toBe(10)
    })
  })

  describe('events', () => {
    it('emits formation_move event on tick', () => {
      const invaders = [makeInvader('inv-0', 100, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      const events = formation.tick(1)
      const moveEvent = events.find((e) => e.type === 'formation_move')
      expect(moveEvent).toBeDefined()
    })

    it('emits direction_change event on boundary hit', () => {
      const invaders = [makeInvader('inv-0', 395, 20)]
      const formation = createFormation(invaders, 0, defaultPlayArea, defaultFormationConfig)

      // Tick until boundary hit
      let found = false
      for (let frame = 1; frame <= 20; frame++) {
        const events = formation.tick(frame)
        const dirEvent = events.find((e) => e.type === 'direction_change')
        if (dirEvent) {
          found = true
          break
        }
      }
      expect(found).toBe(true)
    })
  })
})
