# Release Process

## How to Release

From the main branch:

```bash
npm version patch   # or: npm version minor / npm version major
git push origin main --tags
```

This triggers the automated release pipeline:

1. **CI** — typecheck + tests + build
2. **npm publish** — via trusted publisher (no token needed)
3. **GitHub Release** — auto-created with generated release notes
4. **v1 tag update** — major version tag moved to latest
5. **Marketplace** — auto-updates from new GitHub release

## What Happens

- `npm version patch` bumps `package.json`, commits, and creates a `v1.x.x` tag
- Pushing the tag triggers `.github/workflows/release.yml`
- The workflow runs tests first — if they fail, nothing publishes
- On success: npm publish + GitHub release + v1 tag force-update
- GitHub Marketplace listing auto-updates from the new release

## Version Strategy

- `v1` tag always points to the latest v1.x.x release
- Users reference `@v1` in their workflows (always gets latest)
- Breaking changes → bump major version, create new `v2` tag

## Example SVG Regeneration

The example SVG on the docs/README is regenerated on each release via `.github/workflows/generate-example.yml`. It can also be triggered manually:

```bash
gh workflow run generate-example.yml -R Goblinlordx/commit-invaders
```

## Profile README SVG

The profile animation at github.com/Goblinlordx regenerates daily via cron and on workflow_dispatch from the `Goblinlordx/Goblinlordx` repo.
