# Commit Invaders 👾

[![GitHub release](https://img.shields.io/github/release/Goblinlordx/commit-invaders.svg?style=flat-square)](https://github.com/Goblinlordx/commit-invaders/releases/latest)
![TypeScript](https://img.shields.io/npm/types/typescript?style=flat-square)
![License](https://img.shields.io/github/license/Goblinlordx/commit-invaders?style=flat-square)

Generate an animated Space Invaders game from your GitHub contribution graph. Your contribution cells are plucked from the grid, travel to formation positions, hatch into invaders, and a ship fires lasers to destroy them wave by wave — all in a seamlessly looping CSS animation.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Goblinlordx/commit-invaders/output/commit-invaders.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Goblinlordx/commit-invaders/output/commit-invaders.svg">
  <img alt="Commit Invaders Animation" src="https://raw.githubusercontent.com/Goblinlordx/commit-invaders/output/commit-invaders.svg" width="100%">
</picture>

## Features

- **Space Invaders gameplay** from your actual contribution data
- **Per-cell staggered lifecycle** — cells pluck, travel, and hatch individually
- **Wave-by-wave combat** with formation oscillation and ballistics solver
- **Pixel-art sprites** — ship, invaders (4 variants by level), explosions, laser glow
- **Ending sequence** — score display, optional high score board, seamless loop
- **Pure CSS animation** — no JavaScript in the SVG, GitHub README-safe
- **Light / Dark / Classic themes** via color palette system
- **Interactive demo** with animation scrubber and debug parameter tuning

## Usage

### GitHub Action

Add to your profile repository (`.github/workflows/commit-invaders.yml`):

```yaml
name: Generate Commit Invaders

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: Goblinlordx/commit-invaders@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          github_user_name: ${{ github.repository_owner }}
```

Then add to your `README.md`:

```markdown
![Commit Invaders](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/output/commit-invaders.svg)
```

### npx (local)

```bash
GITHUB_TOKEN=ghp_... npx commit-invaders <username> [output.svg]
```

Options:
- `--no-scoreboard` — disable high score board (faster animation)
- `--help` — show usage

### Interactive Demo

[goblinlordx.github.io/commit-invaders](https://goblinlordx.github.io/commit-invaders) — try it with any GitHub username, tune parameters, download SVG.

## Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github_token` | Yes | — | GitHub token with `read:user` scope |
| `github_user_name` | Yes | — | GitHub username |
| `output_branch` | No | `output` | Branch to commit SVG to |
| `output_file` | No | `commit-invaders.svg` | Output filename |
| `enable_scoreboard` | No | `true` | Show high score board |
| `weeks_per_wave` | No | `4` | Weeks grouped per invader wave |

## Action Outputs

| Output | Description |
|--------|-------------|
| `svg_file` | Path to the generated SVG |
| `svg_size` | SVG file size in bytes |
| `total_commits` | Total contributions in the graph |
| `animation_duration` | Animation length in seconds |

## How It Works

1. **Fetch** — Pull contribution graph from GitHub GraphQL API
2. **Simulate** — Deterministic physics engine with outcome-first solver (PRNG predetermines hit/miss, ballistics solver computes exact fire positions)
3. **Render** — Map simulation events to CSS `@keyframes` percentages with SVG sprite symbols
4. **Output** — Single self-contained SVG with inline styles, no external dependencies

The simulation uses time-based physics (`dt = 1/fps`), swept collision detection, target-locked firing, and formation path prediction for accurate laser targeting.

## Development

```bash
pnpm install
pnpm dev:demo     # interactive demo page
pnpm dev:sim      # canvas simulation viewer
pnpm test         # run tests
pnpm build        # bundle for GitHub Action
```

## Acknowledgments

This project was heavily inspired by [Platane/snk](https://github.com/Platane/snk) — the original snake contribution graph animation that started it all. Built with [Kiloforge](https://github.com/anthropics/claude-code) (skills only) for track-based development workflow.

## License

MIT
