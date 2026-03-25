# TypeScript Style Guide — Commit Invaders

## Naming Conventions

- **Files:** kebab-case (`contribution-fetcher.ts`, `svg-renderer.ts`)
- **Variables/functions:** camelCase (`fetchContributions`, `renderWave`)
- **Types/interfaces:** PascalCase (`ContributionDay`, `InvaderSprite`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_WAVES`, `DEFAULT_CELL_SIZE`)
- **Enums:** PascalCase name, PascalCase members (`InvaderType.Heavy`)

## Code Organization

- Group by feature/domain, not by file type
- Co-locate tests next to source (`foo.ts` / `foo.test.ts`)
- Export only what's needed — prefer named exports over default exports
- One primary concept per file

## Imports

Order:
1. Node built-ins (`node:fs`, `node:path`)
2. External packages (`@octokit/graphql`)
3. Internal modules (`./renderer`, `../types`)

Blank line between each group.

## Types

- Prefer `interface` for object shapes, `type` for unions/intersections
- Avoid `any` — use `unknown` and narrow
- Use strict TypeScript config (`strict: true`, `noUncheckedIndexedAccess: true`)

## Error Handling

- Use typed errors with descriptive messages
- Fail fast on invalid input — validate at boundaries
- Never swallow errors silently

## Testing

- Use `describe`/`it` blocks with clear names
- Test behavior, not implementation
- One assertion per test when practical
- Use factories for test data, not inline object literals

## Formatting

- Prettier handles formatting — no manual style rules
- 2-space indentation
- Single quotes
- Trailing commas
- No semicolons (Prettier default)
