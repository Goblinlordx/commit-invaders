// ── Contribution Data ──

export type ContributionLevel = 0 | 1 | 2 | 3 | 4

export interface ContributionCell {
  x: number // week index (column)
  y: number // weekday 0-6 (row)
  level: ContributionLevel
  date: string // ISO date string
  count: number
}

export interface Grid {
  width: number // number of weeks
  height: 7
  cells: ContributionCell[]
}

// ── Ship Script ──

export type ShipCommand =
  | { frame: number; action: 'move'; x: number }
  | { frame: number; action: 'fire' }
  | { frame: number; action: 'stop' }

export type ShipScript = ShipCommand[]

// ── Simulation Events ──

export type SimEventType =
  | 'cell_detach'
  | 'cell_transform'
  | 'formation_move'
  | 'direction_change'
  | 'fire_laser'
  | 'laser_move'
  | 'hit'
  | 'damage'
  | 'destroy'
  | 'wave_spawn'
  | 'wave_clear'
  | 'game_end'

export interface SimEvent {
  frame: number
  type: SimEventType
  entityId: string
  position: Position
  data?: Record<string, unknown>
}

// ── Geometry ──

export interface Position {
  x: number
  y: number
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

// ── Entity State ──

export interface CellState {
  cell: ContributionCell
  status: 'in_grid' | 'detaching' | 'transformed' | 'destroyed'
  detachProgress: number // 0-1, used for lerp animation
}

export interface InvaderState {
  id: string
  cell: ContributionCell
  hp: number
  maxHp: number
  position: Position
  destroyed: boolean
  destroyedAtFrame: number | null
}

export interface FormationState {
  waveIndex: number
  invaders: InvaderState[]
  offset: Position // group movement offset
  direction: 'left' | 'right'
  speed: number
  active: boolean
  clearedAtFrame: number | null
}

export interface ShipState {
  position: Position
  targetX: number | null
}

export interface LaserState {
  id: string
  position: Position
  speed: number
  active: boolean
}

export interface EffectState {
  id: string
  type: 'explosion'
  position: Position
  startFrame: number
  duration: number
}

// ── Game State (reconstructable snapshot) ──

export interface GameState {
  frame: number
  score: number
  totalInvaders: number
  gridCells: CellState[]
  formations: FormationState[]
  ship: ShipState
  lasers: LaserState[]
  effects: EffectState[]
  currentWave: number
  totalWaves: number
  events: SimEvent[] // events that occurred THIS frame
}

// ── Inflection Points ──

export type InflectionType =
  | 'spawn'
  | 'direction_change'
  | 'move_start'
  | 'move_end'
  | 'fire'
  | 'hit'
  | 'destroy'
  | 'wave_clear'

export interface InflectionPoint {
  frame: number
  position: Position
  type: InflectionType
}

export interface EntityTimeline {
  entityId: string
  entityType: 'formation' | 'ship' | 'laser' | 'invader' | 'cell'
  inflections: InflectionPoint[]
}

// ── Simulation Output ──

export interface SimOutput {
  events: SimEvent[]
  entityTimelines: Map<string, EntityTimeline>
  totalFrames: number
  config: SimConfig
  finalScore: number
  peek(frame: number): GameState
  getInflections(entityId: string): InflectionPoint[]
  getAllInflections(): Map<string, EntityTimeline>
}

// ── Configuration ──

export interface WaveConfig {
  weeksPerWave: number
  spawnDelay: number // frames between wave clear and next spawn
}

export interface SimConfig {
  waveConfig: WaveConfig
  playArea: BoundingBox
  gridArea: BoundingBox
  cellSize: number
  cellGap: number
  laserSpeed: number
  shipSpeed: number
  shipY: number
  formationBaseSpeed: number
  formationMaxSpeed: number
  formationRowDrop: number
}

// ── PRNG ──

export interface PRNG {
  next(): number // 0-1
  range(min: number, max: number): number // integer in [min, max]
  float(min: number, max: number): number // float in [min, max)
  chance(probability: number): boolean // true with given probability
  pick<T>(array: readonly T[]): T // random element
}
