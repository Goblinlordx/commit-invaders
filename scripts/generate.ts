#!/usr/bin/env npx tsx
/**
 * Generate an animated SVG from a GitHub user's contribution graph.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... npx tsx scripts/generate.ts <username> [output.svg]
 *
 * Requires a GitHub personal access token with read:user scope.
 */

import { writeFileSync } from 'node:fs'
import { fetchContributions, fetchContributionHistory } from '../src/fetcher/graphql.js'
import { parseContributionResponse, parseMultiYearResponses } from '../src/fetcher/parser.js'
import { composeSvg } from '../src/animation/svg-compositor.js'
import { simulate } from '../src/simulator/simulate.js'
import { computeScoreboard } from '../src/scoreboard.js'
import { PALETTE_DARK } from '../src/animation/entity-templates.js'
import type { SimConfig } from '../src/types.js'

const STRIDE = 13
const PADDING = 20
const gridW = 7 * STRIDE + PADDING * 2
const gridH = 52 * STRIDE
const shipMargin = 24

const defaultConfig: SimConfig = {
  framesPerSecond: 60,
  waveConfig: {
    weeksPerWave: 4,
    introScoreboardFadeIn: 30, introScoreboardHold: 300, introScoreboardFadeOut: 30,
    startDelay: 480, spawnDelay: 0,
    brightenDuration: 60, pluckDuration: 20, darkenDuration: 60,
    travelDuration: 40, hatchDuration: 20,
    endingFadeoutDuration: 60, endingScoreDuration: 180,
    endingScoreOutDuration: 30, endingBoardInDuration: 0,
    endingHoldDuration: 0, endingBlackoutDuration: 60, endingResetDuration: 60,
  },
  playArea: { x: 0, y: 0, width: gridW, height: gridH + shipMargin },
  gridArea: { x: PADDING, y: 0, width: 7 * STRIDE, height: gridH },
  cellSize: 11, cellGap: 2, laserSpeed: 1200, laserWidth: 4, invaderSize: 9,
  shipSpeed: 180, shipY: gridH + shipMargin - 4,
  formationBaseSpeed: 60, formationMaxSpeed: 240, formationRowDrop: 14,
  hitChance: 0.85, fireRate: 5, shipYRange: 30,
  formationSpread: 10, formationRowStagger: 10,
}

async function main() {
  const username = process.argv[2]
  const outputFile = process.argv[3] ?? 'commit-invaders.svg'
  const noScoreboard = process.argv.includes('--no-scoreboard')

  if (!username) {
    console.error('Usage: GITHUB_TOKEN=ghp_... npx tsx scripts/generate.ts <username> [output.svg]')
    process.exit(1)
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable required')
    console.error('Create one at: https://github.com/settings/tokens (read:user scope)')
    process.exit(1)
  }

  console.log(`Fetching contributions for ${username}...`)
  const response = await fetchContributions(token, username)
  const grid = parseContributionResponse(response)

  console.log(`Grid: ${grid.width} weeks × ${grid.height} days`)
  const activeCells = grid.cells.filter(c => c.level > 0).length
  const totalCommits = grid.cells.reduce((sum, c) => sum + c.count, 0)
  console.log(`Active cells: ${activeCells}, Total commits: ${totalCommits}`)

  // Fetch historical data for scoreboard
  let scoreboard
  if (!noScoreboard) {
    console.log('Fetching contribution history for scoreboard...')
    const historyResponses = await fetchContributionHistory(token, username, 10)
    const historyGrid = parseMultiYearResponses(historyResponses)
    console.log(`History: ${historyGrid.cells.length} days across ${historyResponses.length} years`)
    const lastDate = grid.cells.reduce((max, c) => (c.date > max ? c.date : max), '')
    scoreboard = computeScoreboard(historyGrid, lastDate, grid.width * 7, 10)
    console.log(`Scoreboard: ${scoreboard.entries.length} entries, high score: ${scoreboard.isNewHighScore}`)
  }

  console.log('Generating SVG...')
  const seed = `${username}-${new Date().toISOString().slice(0, 10)}`
  const svg = composeSvg({ grid, seed, config: defaultConfig, scoreboard, palette: PALETTE_DARK })

  writeFileSync(outputFile, svg)
  console.log(`Written: ${outputFile} (${(svg.length / 1024).toFixed(1)} KB)`)
}

main().catch((err) => {
  console.error('Error:', err.message ?? err)
  process.exit(1)
})
