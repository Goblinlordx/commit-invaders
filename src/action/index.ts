/**
 * GitHub Action entrypoint.
 *
 * Fetches contribution data, runs simulation, generates dark + light SVGs,
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
import { PALETTE_DARK, PALETTE_LIGHT } from '../animation/entity-templates.js'

async function run(): Promise<void> {
  try {
    const inputs = parseInputs()
    const config = buildConfig(inputs)

    core.info(`Fetching contributions for ${inputs.username}...`)
    const response = await fetchContributions(inputs.githubToken, inputs.username)
    const grid = parseContributionResponse(response)
    core.info(`Grid: ${grid.width} weeks × ${grid.height} days`)

    const activeCells = grid.cells.filter(c => c.level > 0).length
    const totalCommits = grid.cells.reduce((sum, c) => sum + c.count, 0)
    core.info(`Active cells: ${activeCells}, Total commits: ${totalCommits}`)

    let scoreboard: ScoreboardResult | undefined
    if (!inputs.noScoreboard) {
      const lastDate = grid.cells.reduce((max, c) => (c.date > max ? c.date : max), '')
      scoreboard = computeScoreboard(grid, lastDate, grid.width * 7, 10)
      core.info(`Scoreboard: ${scoreboard.entries.length} entries`)
    }

    core.info('Generating SVGs...')
    const seed = `${inputs.username}-${new Date().toISOString().slice(0, 10)}`
    const output = simulate(grid, seed, config)

    const svgDark = composeSvg({ grid, seed, config, scoreboard, palette: PALETTE_DARK })
    const svgLight = composeSvg({ grid, seed, config, scoreboard, palette: PALETTE_LIGHT })

    core.info(`Animation: ${output.totalFrames} frames (${(output.totalFrames / config.framesPerSecond).toFixed(1)}s)`)

    // Write both variants
    const baseName = inputs.outputFile.replace(/\.svg$/, '')
    const darkFile = `${baseName}-dark.svg`
    const lightFile = `${baseName}.svg`
    writeFileSync(darkFile, svgDark)
    writeFileSync(lightFile, svgLight)
    core.info(`Written: ${darkFile} (${(svgDark.length / 1024).toFixed(1)} KB)`)
    core.info(`Written: ${lightFile} (${(svgLight.length / 1024).toFixed(1)} KB)`)

    // Commit both to output branch
    await commitToOutputBranch(inputs.outputBranch, [darkFile, lightFile], inputs.username)

    core.setOutput('svg_file', lightFile)
    core.setOutput('svg_dark_file', darkFile)
    core.setOutput('svg_size', svgLight.length)
    core.setOutput('total_commits', totalCommits)
    core.setOutput('animation_duration', (output.totalFrames / config.framesPerSecond).toFixed(1))
  } catch (error) {
    core.setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function commitToOutputBranch(branch: string, files: string[], username: string): Promise<void> {
  core.info(`Committing to branch: ${branch}`)

  await exec.exec('git', ['config', 'user.name', 'commit-invaders[bot]'])
  await exec.exec('git', ['config', 'user.email', 'commit-invaders[bot]@users.noreply.github.com'])

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

  for (const f of files) await exec.exec('git', ['add', f])

  try {
    await exec.exec('git', ['commit', '-m', `chore: update commit-invaders animation for ${username}`])
  } catch {
    core.info('No changes to commit')
    return
  }

  await exec.exec('git', ['push', '--force', 'origin', branch])
  core.info(`Pushed to origin/${branch}`)
}

run()
