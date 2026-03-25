/**
 * GitHub Action entrypoint.
 *
 * Fetches contribution data, runs simulation, generates SVG,
 * and commits to the output branch.
 */
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { writeFileSync } from 'node:fs'
import { parseInputs, buildConfig } from './inputs.js'
import { fetchContributions } from '../fetcher/graphql.js'
import { parseContributionResponse } from '../fetcher/parser.js'
import { composeSvg } from '../animation/svg-compositor.js'
import { simulate } from '../simulator/simulate.js'
import { computeScoreboard, type ScoreboardResult } from '../scoreboard.js'
import { PALETTE_DARK } from '../animation/entity-templates.js'

async function run(): Promise<void> {
  try {
    const inputs = parseInputs()
    const config = buildConfig(inputs)

    // 1. Fetch current year contribution data
    core.info(`Fetching contributions for ${inputs.username}...`)
    const response = await fetchContributions(inputs.githubToken, inputs.username)
    const grid = parseContributionResponse(response)
    core.info(`Grid: ${grid.width} weeks × ${grid.height} days`)

    const activeCells = grid.cells.filter(c => c.level > 0).length
    const totalCommits = grid.cells.reduce((sum, c) => sum + c.count, 0)
    core.info(`Active cells: ${activeCells}, Total commits: ${totalCommits}`)

    // 2. Optionally fetch historical data for scoreboard
    let scoreboard: ScoreboardResult | undefined
    if (inputs.enableScoreboard) {
      core.info('Computing scoreboard from contribution data...')
      const lastDate = grid.cells.reduce((max, c) => (c.date > max ? c.date : max), '')
      scoreboard = computeScoreboard(grid, lastDate, grid.width * 7, 10)
      core.info(`Scoreboard: ${scoreboard.entries.length} entries, new high score: ${scoreboard.isNewHighScore}`)
    }

    // 3. Generate SVG
    core.info('Generating SVG...')
    const seed = `${inputs.username}-${new Date().toISOString().slice(0, 10)}`
    const output = simulate(grid, seed, config)
    const svg = composeSvg({ grid, seed, config, scoreboard, palette: PALETTE_DARK })

    core.info(`Animation: ${output.totalFrames} frames (${(output.totalFrames / config.framesPerSecond).toFixed(1)}s)`)
    core.info(`SVG size: ${(svg.length / 1024).toFixed(1)} KB`)

    // 4. Write SVG file
    writeFileSync(inputs.outputFile, svg)
    core.info(`Written: ${inputs.outputFile}`)

    // 5. Commit and push to output branch
    await commitToOutputBranch(inputs.outputBranch, inputs.outputFile, inputs.username)

    // 6. Set outputs
    core.setOutput('svg_file', inputs.outputFile)
    core.setOutput('svg_size', svg.length)
    core.setOutput('total_commits', totalCommits)
    core.setOutput('animation_duration', (output.totalFrames / config.framesPerSecond).toFixed(1))
  } catch (error) {
    core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function commitToOutputBranch(branch: string, file: string, username: string): Promise<void> {
  core.info(`Committing to branch: ${branch}`)

  // Configure git
  await exec.exec('git', ['config', 'user.name', 'commit-invaders[bot]'])
  await exec.exec('git', ['config', 'user.email', 'commit-invaders[bot]@users.noreply.github.com'])

  // Check if branch exists
  let branchExists = false
  try {
    await exec.exec('git', ['rev-parse', '--verify', `origin/${branch}`], { silent: true })
    branchExists = true
  } catch { /* branch doesn't exist */ }

  if (branchExists) {
    await exec.exec('git', ['checkout', branch])
  } else {
    await exec.exec('git', ['checkout', '--orphan', branch])
    await exec.exec('git', ['rm', '-rf', '.'])
  }

  // Stage and commit the SVG
  await exec.exec('git', ['add', file])

  const commitMessage = `chore: update commit-invaders animation for ${username}`
  try {
    await exec.exec('git', ['commit', '-m', commitMessage])
  } catch {
    core.info('No changes to commit')
    return
  }

  // Push
  await exec.exec('git', ['push', 'origin', branch])
  core.info(`Pushed to origin/${branch}`)
}

run()
