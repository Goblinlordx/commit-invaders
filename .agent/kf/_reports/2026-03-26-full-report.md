# Project Report: Commit Invaders

> **Generated:** 2026-03-26
> **Period:** 2026-03-25 – 2026-03-26 (2 primary development days)

---

## Project Timeline

| | |
|---|---|
| **Duration** | 2 active development days (Mar 25–26, 2026) |
| **Commits** | 222 total |
| **Tracks** | 20 lifetime (16 completed, 1 pending, 3 archived) |
| **Codebase** | 7,166 lines TypeScript · 362 lines CSS · 353 lines HTML |

### Daily Activity

| Date | Commits | Span | Tracks Completed | Key Activity |
|------|--------:|------|:----------------:|--------------|
| Mar 25 (Tue) | 58 | 18:40–23:59 | 8 | Project scaffold; types & PRNG; fetcher; combat system; wave manager; formation movement; engine & choreographer; sim renderer; cell lifecycle |
| Mar 26 (Wed) | 159 | 00:00–13:06 | **9** | CSS entity templates; entity validation; inflection-to-CSS pipeline; SVG compositor; sprites; demo page; solver rewrite; target locking; GitHub Action; release & deploy |

> Note: Significant "trackless" changes were made throughout for fine-tuning physics, animations, overlay fades, formation layout, solver accuracy, and demo page polish.

---

## Velocity Progression

| Period | Commits | Description |
|--------|--------:|-------------|
| Mar 25 evening | 58 | Foundation: scaffold, types, PRNG, fetcher, combat, waves, formations, engine, renderer, cell lifecycle — 8 tracks completed |
| Mar 26 overnight | 100+ | CSS animation pipeline, sprites, solver rewrite, demo page, scoreboard fixes |
| Mar 26 morning | 50+ | GitHub Action, release automation, npm publish, profile deployment, historical scoreboard |

| Metric | Value |
|--------|-------|
| Commits/day (active) | ~111 avg |
| Peak | 159 commits on Mar 26 |
| Track completion rate | ~8.5 tracks/day |
| Time to first playable SVG | ~8 hours |
| Time to public release | ~18 hours |

---

## Project Phases

### Phase 1: Foundation — *Mar 25, 18:40–19:30*
- Project scaffold with pnpm, TypeScript strict, vitest, eslint, prettier
- Core types, seeded PRNG, contribution data fetcher
- 8 commits, 2 tracks completed

### Phase 2: Game Engine — *Mar 25, 19:30–20:15*
- Combat system with one-hit kills and ballistics solver
- Wave manager with sequential spawning and HP assignment
- Formation zigzag movement with boundary detection
- Simulation engine with outcome-first solver and per-wave retry
- 15 commits, 4 tracks completed

### Phase 3: Rendering & Lifecycle — *Mar 25, 20:15–23:59*
- Canvas hitbox renderer with layered draw order
- Per-cell staggered lifecycle (pluck → travel → hatch)
- Scoreboard algorithm with sliding window binary search
- 25 commits, 2 tracks completed

### Phase 4: CSS Animation Pipeline — *Mar 26, 00:00–03:30*
- Entity templates and base keyframe animations
- Playwright pixel-diff entity validation
- Inflection-to-CSS timeline mapper
- SVG compositor with all entity types
- Formation oscillation, overlay fades, status bar, ending sequence
- Extensive overlay and keyframe bookending fixes
- 60 commits, 5 tracks completed

### Phase 5: Sprites & Demo — *Mar 26, 03:30–06:30*
- SVG symbol sprites (ship, invaders, laser, explosions)
- Demo page with scrubber, debug mode, theme switching
- Solver rewrite: unified prediction, target locking, swept collision
- Formation layout (wide, centered, original footprint boundaries)
- 50 commits, 2 tracks completed

### Phase 6: Release & Deploy — *Mar 26, 06:30–13:06*
- GitHub Action: entrypoint, bundling, CI/CD workflows
- npm publish via trusted publisher
- GitHub Pages demo deployment
- Profile README integration with dark/light variants
- 10-year historical scoreboard
- GitHub Marketplace listing
- 40 commits, 2 tracks completed

---

## Track Summary

### Counts

| Category | Count |
|----------|------:|
| Completed | 16 |
| Pending | 1 |
| Archived | 3 |
| **Lifetime total** | **20** |

### Completed Tracks (in order)

1. **scaffold-types** — Project Scaffold, Types & PRNG
2. **fetcher** — Contribution Data Fetcher
3. **wave-formation** — Wave Manager & Formation Movement
4. **combat** — Combat System — Lasers, Hits & Score
5. **engine-choreo** — Simulation Engine & Choreographer
6. **sim-renderer** — Simulation Renderer — Hitbox debug view
7. **scoreboard** — High Score Board — Aggregate window rankings
8. **cell-lifecycle** — Cell Lifecycle — Pluck, Travel, Hatch
9. **entity-catalog** — Entity Catalog & Animation Spec Document
10. **css-entity-templates** — CSS Entity Templates & Base Keyframe Animations
11. **entity-validation** — Isolated Entity Animation Validation via Playwright
12. **inflection-to-css** — Inflection Point to CSS Animation Data Pipeline
13. **svg-sprites** — SVG Sprites — Ship, Invaders & Effects
14. **demo-page** — Demo Page — Interactive GitHub Pages Showcase
15. **github-action** — GitHub Action — Delivery, packaging & documentation
16. **release-v1** — Release v1 — npm publish, GitHub release, demo deploy

### Pending

1. **video-export** — Video Export — MP4/WebM via ffmpeg (low priority, deferred)

---

## SLOC Report

> **Tool:** scc
> **Excludes:** node_modules, .git, .agent, dist, SVG files, lock files

| Language | Files | Code | Comments | Blanks | Lines | Complexity |
|----------|------:|-----:|---------:|-------:|------:|-----------:|
| TypeScript | 51 | 7,166 | 780 | 1,116 | 9,062 | 1,032 |
| CSS | 2 | 362 | 12 | 60 | 434 | 0 |
| HTML | 6 | 353 | 15 | 12 | 380 | 0 |
| JavaScript | 3 | 295 | 8 | 17 | 320 | 11 |
| YAML | 5 | 149 | 4 | 20 | 173 | 0 |
| JSON | 2 | 86 | 0 | 0 | 86 | 0 |
| Markdown | 1 | 84 | 0 | 33 | 117 | 0 |
| **TOTAL** | **71** | **8,512** | **819** | **1,262** | **10,593** | **1,043** |

**Processed:** 0.416 MB

### Breakdown

| Category | SLOC | Share |
|----------|-----:|------:|
| Application (TypeScript) | 7,166 | 84% |
| Styles (CSS) | 362 | 4% |
| Templates (HTML) | 353 | 4% |
| CLI/Scripts (JavaScript) | 295 | 3% |
| Config (YAML/JSON) | 235 | 3% |
| Docs (Markdown) | 84 | 1% |

---

## Cost Estimates

### COCOMO (organic model, via scc)

| Metric | Value |
|--------|-------|
| Estimated Cost | $255,934 |
| Schedule Effort | 8.19 months |
| People Required | 2.77 |

### Function Point Analysis

| Component | Count | Weight | Total |
|-----------|------:|-------:|------:|
| External Inputs (EI) | 6 | x 4 | 24 |
| External Outputs (EO) | 5 | x 5 | 25 |
| External Inquiries (EQ) | 4 | x 4 | 16 |
| Internal Logical Files (ILF) | 3 | x 10 | 30 |
| External Interface Files (EIF) | 2 | x 7 | 14 |
| **Unadjusted Function Points** | | | **109** |

> EI: action inputs, CLI args, debug sliders, theme toggle, username input, scoreboard toggle
> EO: dark SVG, light SVG, demo preview, npm package, GitHub release
> EQ: contribution fetch, historical fetch, scoreboard compute, simulation peek
> ILF: simulation state, entity timelines, scoreboard cache
> EIF: GitHub GraphQL API, GitHub REST API (pages, releases)

| Metric | Value |
|--------|-------|
| Value Adjustment Factor | 0.94 (GSC: 29/70) |
| Adjusted Function Points | 102 |

| Rate | Estimate |
|------|----------|
| Low ($500/FP) | $51,000 |
| Mid ($1,000/FP) | $102,000 |
| High ($1,500/FP) | $153,000 |

### Parametric (SLOC-based)

| Metric | Value |
|--------|-------|
| SLOC | 8,512 |
| Productivity range | 10–20 SLOC/hr |
| Effort | 426 – 851 hours |
| Cost @ $75–$150/hr | $31,950 – $127,650 |

### Effort by Analogy

> Comparable scope: animated SVG generator with physics simulation, CSS animation pipeline, GitHub Action CI/CD, interactive web demo, npm CLI tool

| Context | Estimate |
|---------|----------|
| Freelance/agency | $40,000 – $80,000 |
| In-house team (2-3 months) | $60,000 – $120,000 |

### AI-Assisted Actual Cost

| Metric | Value |
|--------|-------|
| Active dev time | 2 days (~18 hours wall clock) |
| Calendar time | 2 days |
| Estimated API cost | ~$50 – $150 (Claude Opus sessions) |
| Human time | ~18 hours of direction, review, and testing |
| Estimated human cost | ~$1,000 – $2,000 (at market rates) |
| **Total actual cost** | **~$1,050 – $2,150** |

### Aggregate Cost Summary

| Model | Low | Mid | High |
|-------|----:|----:|-----:|
| COCOMO | — | $255,934 | — |
| Function Point Analysis | $51,000 | $102,000 | $153,000 |
| Parametric (SLOC) | $31,950 | $79,800 | $127,650 |
| Effort by Analogy | $40,000 | $70,000 | $120,000 |
| **Cross-model range** | **$31,950** | **$126,934** | **$255,934** |

| Aggregate Metric | Value |
|------------------|-------|
| Median estimate | ~$91,000 |
| Geometric mean | ~$110,000 |
| Actual (AI-assisted) | ~$1,050 – $2,150 |
| **Efficiency factor** | **~42x – 87x cost reduction vs median** |

---

## Summary

Built in **2 calendar days** with **222 commits** across **2 active days**.

| Metric | Value |
|--------|-------|
| SLOC | 8,512 (84% TypeScript) |
| Files | 71 |
| Tracks (lifetime) | 20 |
| Tracks completed | 16 |
| Tracks pending | 1 (video-export, deferred) |
| Peak velocity | 159 commits/day, 9 tracks/day |
| Published channels | npm, GitHub Action, GitHub Pages, Marketplace |
| Estimated traditional cost | ~$91,000 (median) |
| Actual AI-assisted cost | ~$1,050 – $2,150 |
| **Cost efficiency** | **~42x – 87x** |
