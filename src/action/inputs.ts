/**
 * Parse and validate GitHub Action inputs.
 */
import * as core from '@actions/core'
import type { SimConfig } from '../types.js'

export interface ActionInputs {
  githubToken: string
  username: string
  outputBranch: string
  outputFile: string
  /** Optional: fetch historical data for scoreboard (requires token with full repo access) */
  noScoreboard: boolean
  /** Number of years to look back for scoreboard historical data */
  /** Animation duration override (0 = auto) */
  animationDuration: number
  /** Weeks per wave */
}

export function parseInputs(): ActionInputs {
  return {
    githubToken: core.getInput('github_token', { required: true }),
    username: core.getInput('github_user_name', { required: true }),
    outputBranch: core.getInput('output_branch') || 'output',
    outputFile: core.getInput('output_file') || 'commit-invaders.svg',
    noScoreboard: core.getBooleanInput('no_scoreboard'),
    animationDuration: parseInt(core.getInput('animation_duration') || '0', 10),
  }
}

export function buildConfig(inputs: ActionInputs): SimConfig {
  const CELL_SIZE = 11
  const CELL_GAP = 2
  const STRIDE = CELL_SIZE + CELL_GAP
  const PADDING = 20
  const gridW = 7 * STRIDE + PADDING * 2
  const gridH = 52 * STRIDE
  const shipMargin = 24

  return {
    framesPerSecond: 60,
    waveConfig: {
      weeksPerWave: 4,
      startDelay: 60, spawnDelay: 0,
      brightenDuration: 60, pluckDuration: 20, darkenDuration: 60,
      travelDuration: 40, hatchDuration: 20,
      endingFadeoutDuration: 60, endingScoreDuration: 180,
      endingScoreOutDuration: 30,
      endingBoardInDuration: inputs.noScoreboard ? 0 : 30,
      endingHoldDuration: inputs.noScoreboard ? 0 : 300,
      endingBlackoutDuration: 60, endingResetDuration: 60,
    },
    playArea: { x: 0, y: 0, width: gridW, height: gridH + shipMargin },
    gridArea: { x: PADDING, y: 0, width: 7 * STRIDE, height: gridH },
    cellSize: CELL_SIZE, cellGap: CELL_GAP, laserSpeed: 1200, laserWidth: 4, invaderSize: 9,
    shipSpeed: 180, shipY: gridH + shipMargin - 4,
    formationBaseSpeed: 60, formationMaxSpeed: 240, formationRowDrop: 14,
    hitChance: 0.85, fireRate: 5, shipYRange: 30,
    formationSpread: 10, formationRowStagger: 10,
  }
}
