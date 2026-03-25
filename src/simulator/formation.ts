import type {
  BoundingBox,
  FormationState,
  InvaderState,
  Position,
  SimEvent,
} from '../types.js'

export interface FormationConfig {
  baseSpeed: number // px/s
  maxSpeed: number // px/s
  rowDrop: number
  dt: number // seconds per frame (1 / framesPerSecond)
}

export interface Formation {
  getState(): FormationState
  tick(frame: number): SimEvent[]
  destroyInvader(id: string, frame: number): void
  /** Predict formation offset after N ticks by cloning and fast-forwarding. */
  predictOffset(ticksAhead: number): { x: number; y: number; direction: 'left' | 'right' }
}

export function createFormation(
  invaders: InvaderState[],
  waveIndex: number,
  playArea: BoundingBox,
  config: FormationConfig,
): Formation {
  const totalInvaders = invaders.length
  const state: FormationState = {
    waveIndex,
    invaders: invaders.map((inv) => ({ ...inv })),
    offset: { x: 0, y: 0 },
    direction: 'right',
    speed: config.baseSpeed,
    active: true,
    clearedAtFrame: null,
  }

  function aliveInvaders(): InvaderState[] {
    return state.invaders.filter((inv) => !inv.destroyed)
  }

  function recalcSpeed(): void {
    const remaining = aliveInvaders().length
    if (remaining === 0) return
    const raw = config.baseSpeed * (totalInvaders / remaining)
    state.speed = Math.min(raw, config.maxSpeed)
  }

  function getEffectivePosition(inv: InvaderState): Position {
    return {
      x: inv.position.x + state.offset.x,
      y: inv.position.y + state.offset.y,
    }
  }

  function wouldExceedBoundary(dx: number): boolean {
    // Use ALL invaders (including dead) so the formation oscillates within
    // its original footprint regardless of how many are destroyed.
    for (const inv of state.invaders) {
      const ex = inv.position.x + state.offset.x + dx
      if (ex < playArea.x || ex >= playArea.x + playArea.width) {
        return true
      }
    }
    return false
  }

  return {
    getState(): FormationState {
      return state
    },

    tick(frame: number): SimEvent[] {
      if (!state.active) return []

      const events: SimEvent[] = []
      const speedPerFrame = state.speed * config.dt
      const dx = state.direction === 'right' ? speedPerFrame : -speedPerFrame

      if (wouldExceedBoundary(dx)) {
        // Direction change + row drop
        state.direction = state.direction === 'right' ? 'left' : 'right'
        state.offset.y += config.rowDrop

        events.push({
          frame,
          type: 'direction_change',
          entityId: `formation-${waveIndex}`,
          position: { ...state.offset },
          data: { direction: state.direction },
        })
      } else {
        state.offset.x += dx
      }

      events.push({
        frame,
        type: 'formation_move',
        entityId: `formation-${waveIndex}`,
        position: { ...state.offset },
        data: { direction: state.direction, speed: state.speed },
      })

      return events
    },

    predictOffset(ticksAhead: number): { x: number; y: number; direction: 'left' | 'right' } {
      // Clone current state and tick forward — uses the EXACT same logic as tick()
      let offX = state.offset.x
      let offY = state.offset.y
      let dir = state.direction
      const speedPerFrame = state.speed * config.dt

      for (let t = 0; t < ticksAhead; t++) {
        const dx = dir === 'right' ? speedPerFrame : -speedPerFrame
        let wouldExceed = false
        for (const inv of state.invaders) {
          const ex = inv.position.x + offX + dx
          if (ex < playArea.x || ex >= playArea.x + playArea.width) {
            wouldExceed = true
            break
          }
        }
        if (wouldExceed) {
          dir = dir === 'right' ? 'left' : 'right'
          offY += config.rowDrop
        } else {
          offX += dx
        }
      }

      return { x: offX, y: offY, direction: dir }
    },

    destroyInvader(id: string, frame: number): void {
      const inv = state.invaders.find((i) => i.id === id)
      if (!inv || inv.destroyed) return

      inv.destroyed = true
      inv.destroyedAtFrame = frame

      // Speed stays constant — prediction accuracy depends on it
      // Check if all destroyed
      if (aliveInvaders().length === 0) {
        state.active = false
        state.clearedAtFrame = frame
      }
    },
  }
}
