#!/usr/bin/env node

/**
 * CLI for generating Commit Invaders animated SVG.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... npx commit-invaders <username> [output.svg]
 *   GITHUB_TOKEN=ghp_... commit-invaders <username> [output.svg]
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
  commit-invaders — Generate animated Space Invaders SVG from GitHub contributions

  Usage:
    GITHUB_TOKEN=ghp_... npx commit-invaders <username> [output.svg]

  Arguments:
    username      GitHub username
    output.svg    Output file path (default: commit-invaders.svg)

  Options:
    --no-scoreboard    Disable high score board
    --help, -h         Show this help

  Environment:
    GITHUB_TOKEN       Required. GitHub personal access token (read:user scope)
`)
  process.exit(args.length === 0 ? 1 : 0)
}

const username = args.find(a => !a.startsWith('-'))
const outputFile = args.filter(a => !a.startsWith('-'))[1] ?? 'commit-invaders.svg'
const noScoreboard = args.includes('--no-scoreboard')

if (!username) {
  console.error('Error: username required')
  process.exit(1)
}

const token = process.env.GITHUB_TOKEN
if (!token) {
  console.error('Error: GITHUB_TOKEN environment variable required')
  console.error('Create one at: https://github.com/settings/tokens (read:user scope)')
  process.exit(1)
}

// Dynamic import to support ESM
const { fetchContributions } = await import('../src/fetcher/graphql.js')
const { parseContributionResponse } = await import('../src/fetcher/parser.js')
const { composeSvg } = await import('../src/animation/svg-compositor.js')
const { simulate } = await import('../src/simulator/simulate.js')
const { computeScoreboard } = await import('../src/scoreboard.js')
const { PALETTE_DARK } = await import('../src/animation/entity-templates.js')

const STRIDE = 13
const PADDING = 20
const gridW = 7 * STRIDE + PADDING * 2
const gridH = 52 * STRIDE
const shipMargin = 24

const config = {
  framesPerSecond: 60,
  waveConfig: {
    weeksPerWave: 4, startDelay: 60, spawnDelay: 0,
    brightenDuration: 60, pluckDuration: 20, darkenDuration: 60,
    travelDuration: 40, hatchDuration: 20,
    endingFadeoutDuration: 60, endingScoreDuration: 180,
    endingScoreOutDuration: 30,
    endingBoardInDuration: noScoreboard ? 0 : 30,
    endingHoldDuration: noScoreboard ? 0 : 300,
    endingBlackoutDuration: 60, endingResetDuration: 60,
  },
  playArea: { x: 0, y: 0, width: gridW, height: gridH + shipMargin },
  gridArea: { x: PADDING, y: 0, width: 7 * STRIDE, height: gridH },
  cellSize: 11, cellGap: 2, laserSpeed: 1200, laserWidth: 4, invaderSize: 9,
  shipSpeed: 180, shipY: gridH + shipMargin - 4,
  formationBaseSpeed: 60, formationMaxSpeed: 240, formationRowDrop: 14,
  hitChance: 0.85, fireRate: 5, shipYRange: 30,
  formationSpread: 10, formationRowStagger: 10,
}

console.log(`Fetching contributions for ${username}...`)
const response = await fetchContributions(token, username)
const grid = parseContributionResponse(response)

console.log(`Grid: ${grid.width} weeks × ${grid.height} days`)
const activeCells = grid.cells.filter(c => c.level > 0).length
const totalCommits = grid.cells.reduce((sum, c) => sum + c.count, 0)
console.log(`Active cells: ${activeCells}, Total commits: ${totalCommits}`)

let scoreboard
if (!noScoreboard) {
  const lastDate = grid.cells.reduce((max, c) => (c.date > max ? c.date : max), '')
  scoreboard = computeScoreboard(grid, lastDate, grid.width * 7, 10)
}

console.log('Generating SVG...')
const seed = `${username}-${new Date().toISOString().slice(0, 10)}`
const output = simulate(grid, seed, config)
const svg = composeSvg({ grid, seed, config, scoreboard, palette: PALETTE_DARK })

const outPath = resolve(outputFile)
writeFileSync(outPath, svg)
console.log(`Written: ${outPath} (${(svg.length / 1024).toFixed(1)} KB)`)
console.log(`Animation: ${(output.totalFrames / config.framesPerSecond).toFixed(1)}s`)
