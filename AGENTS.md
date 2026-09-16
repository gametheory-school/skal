# skal — @gametheory-school/skal Conversational UI Framework

Standalone TypeScript package that gives every gameTheory product a **conversational shell** instead of menu-driven navigation. Generalizes the clarify-then-execute pattern from Rosie: detect intent, identify what's missing, ask, and only then act.

# Entry Points

| Export | File | Purpose |
|--------|------|---------|
| `@gametheory-school/skal` | `src/index.ts` | Universal: engine, types, field extraction/validation |
| `@gametheory-school/skal/ui` | `src/ui.ts` | Client components (`'use client'` banner injected by tsup): ActionCard, Composer, TabSwitcher, TaskManager, CommandBar |

# Responsibility Map

| Directory | Responsibility |
|-----------|----------------|
| `src/engine/` | Core state machine, skill registry, dispatcher — domain-agnostic orchestration |
| `src/fields/` | Deterministic field extraction (regex/parsing) + Zod validation, LLM fallback interface |
| `src/ui/` | React client components: ActionCard, Composer, TabSwitcher, TaskManager, CommandBar |
| `src/permissions/` | PermissionGate interface + compose/dispatch check helpers |

# Key Design Decisions

1. **No domain knowledge in the engine.** Operates on `SkillDefinition` + `FieldSpec` + `ActorContext` only.
2. **Deterministic-before-LLM.** Field extraction tries regex/parsing first; LLM is the fallback.
3. **Two entry points only:** engine (universal) and `/ui` (React client components).
4. **Consumer provides:** LLM transport, PermissionGate implementation, handler implementations, schedule store.
5. **Explicit context, never ambient.** `ActorContext` threaded through every stage.

# Conventions

- No `next/headers` or `next/server` imports — the engine is universal, no server deps.
- Peer dependencies (React, Next) are provided by the consumer app — never bundle them.
- `zod` is the only direct dependency.
- Build output goes to `dist/`; never edit `dist/` directly — run `npm run build` (tsup).
- The `'use client'` banner on `ui.ts` is critical for Next.js RSC compatibility. Do not remove.

# Validation Routes

| Check | Command |
|-------|---------|
| Build package | `npm run build` |
| Type check | `npm run typecheck` |
| Unit tests | `npm run test` |
| Pack inspection | `npm pack --dry-run` — confirm `dist/` appears in pack file list |
| UI banner check | Confirm `dist/ui.mjs` starts with `'use client'` after build |
| ESM compat | `npm run test:esm` — both entry points importable as ESM |

# Validation After Edit

## Rule

After making code changes to any source file, the agent MUST run at least one validation check **as a separate, explicit command** before declaring the edit complete.

### Minimum Validation

| Change scope | Required check |
|---|---|
| Any `.ts` / `.tsx` file | `npm run typecheck` |
| Logic in `src/` (non-UI) | typecheck + `npm run test` |
| UI components only | typecheck |
| `tsup.config.ts` / `package.json` `exports` or `files` | `npm run build` + `npm pack --dry-run` inspection |

# Versioning

## Policy

- Follows [semver](https://semver.org). During `0.x`, minor bumps may include breaking changes (per semver convention).
- Changelog format: [Keep a Changelog](https://keepachangelog.com) — sections: `Added`, `Changed`, `Fixed`, `Removed`, `Consumer impact`.
- Every CHANGELOG entry must include a `Consumer impact` subsection so adopters know what to do on upgrade.

## Release Process

1. **Update CHANGELOG.md** — add a new section at the top with the version number and date.
2. **Bump version** — run one of:
   - `npm run release:patch` — bug fixes, no API changes
   - `npm run release:minor` — new features, backward-compatible API additions (or breaking during 0.x)
   - `npm run release:major` — breaking changes (post-1.0 only)
3. **Commit** — commit `package.json`, `package-lock.json`, and `CHANGELOG.md` together in one commit:
   ```
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "release: vX.Y.Z"
   git push
   ```
4. **Create GitHub release** — go to github.com/gametheory-school/skal/releases → Draft new release → tag `vX.Y.Z` targeting the release commit → publish.
5. **Publish triggers automatically** — `.github/workflows/publish.yml` runs typecheck + test + build + `npm publish` to GitHub Packages.

## What warrants a version bump

| Change | Bump |
|---|---|
| Bug fix in existing behavior | patch |
| New exported function/type/component | minor |
| Renamed/removed export, changed function signature | minor (0.x) or major (1.x+) |
| New peer dependency requirement | minor (0.x) or major (1.x+) |
| Internal refactor, no API change | patch |
| Documentation only | no bump |
