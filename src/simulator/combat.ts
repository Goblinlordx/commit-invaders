import type {
  LaserState,
  InvaderState,
  Position,
  BoundingBox,
} from '../types.js'

export const DEFAULT_LASER_WIDTH = 2
export const DEFAULT_INVADER_SIZE = 11

export interface HitResult {
  laserId: string
  invaderId: string
}

export interface CheckHitsResult {
  hits: HitResult[]
  updatedLasers: LaserState[]
  updatedInvaders: InvaderState[]
  scoreIncrease: number
}

// ── Laser Management ──

export function spawnLaser(
  id: string,
  shipPosition: Position,
  speed: number,
): LaserState {
  return {
    id,
    position: { x: shipPosition.x, y: shipPosition.y },
    speed,
    active: true,
  }
}

export function advanceLasers(
  lasers: readonly LaserState[],
  playArea: BoundingBox,
): LaserState[] {
  const result: LaserState[] = []

  for (const laser of lasers) {
    if (!laser.active) continue

    const newY = laser.position.y - laser.speed

    if (newY < playArea.y) continue

    result.push({
      ...laser,
      position: { x: laser.position.x, y: newY },
    })
  }

  return result
}

// ── Hit Detection & Score ──

function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

export function checkHits(
  lasers: readonly LaserState[],
  invaders: readonly InvaderState[],
  laserWidth: number = DEFAULT_LASER_WIDTH,
  invaderSize: number = DEFAULT_INVADER_SIZE,
): CheckHitsResult {
  const hits: HitResult[] = []
  const consumedLaserIds = new Set<string>()
  const damagedInvaders = new Map<string, { hp: number; destroyed: boolean }>()

  for (const laser of lasers) {
    if (!laser.active || consumedLaserIds.has(laser.id)) continue

    for (const invader of invaders) {
      if (invader.destroyed) continue
      if (damagedInvaders.get(invader.id)?.destroyed) continue

      const hit = aabbOverlap(
        laser.position.x - laserWidth / 2,
        laser.position.y - laserWidth / 2,
        laserWidth,
        laserWidth,
        invader.position.x - invaderSize / 2,
        invader.position.y - invaderSize / 2,
        invaderSize,
        invaderSize,
      )

      if (hit) {
        consumedLaserIds.add(laser.id)

        const currentHp =
          damagedInvaders.get(invader.id)?.hp ?? invader.hp
        const newHp = currentHp - 1

        damagedInvaders.set(invader.id, {
          hp: newHp,
          destroyed: newHp <= 0,
        })

        hits.push({ laserId: laser.id, invaderId: invader.id })
        break // one laser hits one invader
      }
    }
  }

  const updatedLasers = lasers.filter(
    (l) => l.active && !consumedLaserIds.has(l.id),
  )

  let scoreIncrease = 0
  const updatedInvaders = invaders.map((inv) => {
    const damage = damagedInvaders.get(inv.id)
    if (!damage) return inv

    if (damage.destroyed) scoreIncrease++

    return {
      ...inv,
      hp: damage.hp,
      destroyed: damage.destroyed,
    }
  })

  return { hits, updatedLasers, updatedInvaders, scoreIncrease }
}
