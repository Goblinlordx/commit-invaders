# Commit Invaders 👾

Transform your GitHub contribution graph into an animated Space Invaders battle.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Goblinlordx/commit-invaders/output/commit-invaders.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Goblinlordx/commit-invaders/output/commit-invaders.svg">
  <img alt="Commit Invaders Animation" src="https://raw.githubusercontent.com/Goblinlordx/commit-invaders/output/commit-invaders.svg" width="100%">
</picture>

## How It Works

Your contribution cells are plucked from the grid, travel to formation positions, and hatch into invaders. A ship fires lasers to destroy them wave by wave. The animation loops seamlessly using pure CSS keyframes — no JavaScript in the SVG.

## Quick Setup

Add this workflow to your profile repository (`.github/workflows/commit-invaders.yml`):

```yaml
name: Generate Commit Invaders

on:
  schedule:
    - cron: '0 0 * * *'  # daily
  workflow_dispatch:       # manual trigger

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: Goblinlordx/commit-invaders@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          github_user_name: ${{ github.repository_owner }}
```

Then add to your `README.md`:

```markdown
![Commit Invaders](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/output/commit-invaders.svg)
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github_token` | Yes | — | GitHub token with `read:user` scope |
| `github_user_name` | Yes | — | GitHub username |
| `output_branch` | No | `output` | Branch to commit SVG to |
| `output_file` | No | `commit-invaders.svg` | Output filename |
| `enable_scoreboard` | No | `true` | Show high score board at end |
| `scoreboard_years` | No | `5` | Years of history for scoreboard |
| `weeks_per_wave` | No | `4` | Weeks grouped per wave |

## Outputs

| Output | Description |
|--------|-------------|
| `svg_file` | Path to the generated SVG |
| `svg_size` | SVG file size in bytes |
| `total_commits` | Total commits in the graph |
| `animation_duration` | Animation length in seconds |

## Features

- **Horizontal layout** — ship on the left, fires right across the contribution grid
- **Per-cell staggered lifecycle** — cells pluck, travel, and hatch individually
- **Wave-by-wave combat** — formation oscillation with ship targeting solver
- **Ending sequence** — score display, optional high score board, seamless loop
- **Pure CSS animation** — no JavaScript in the SVG, GitHub-safe
- **Pixel-art sprites** — ship, invaders (4 variants by level), explosions, laser glow

## Local Generation

```bash
GITHUB_TOKEN=ghp_... npx tsx scripts/generate.ts YOUR_USERNAME output.svg
```

## Demo

Try it at [goblinlordx.github.io/commit-invaders](https://goblinlordx.github.io/commit-invaders)

## License

MIT
