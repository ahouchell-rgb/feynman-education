# Monorepo move — dry-run rehearsal (2026-06-28)

A full throwaway rehearsal of Phase B (`/tmp/monorepo-rehearsal`, since deleted). All three real
repos were left untouched. Companion to `MONOREPO_AND_DOMAIN_PLAN.md` — read this before the real move.

## Headline: it builds. ✅

The consolidated monorepo assembled and **built end-to-end locally with no env vars or secrets**:

- `git mv` app → `apps/houchell/` — **history preserved** (`git log --follow` traces through the rename).
- subtree-add of retrieval + interactive — succeeded (with the corrections below).
- `pnpm install` at root — 3 workspace members (`sciencekit`, `retrieval-app`, `@houchell/db`), 263 pkgs, ~27s.
- **`pnpm exec turbo run build` → `2 successful, 2 total`, exit 0** — both Next apps compiled (feynman prerendered 57 routes).
- `python3 apps/interactive/build.py` → exit 0.
- `packages/db` contract test runs; fails only on `DATABASE_URL is required` (env-gated, expected — needs the CI Postgres).

No application-code blocker was hit. The only failures were environmental (corepack symlink perms; the DB contract test's required Postgres) — exactly as the plan anticipated.

## Plan corrections (two commands in the plan are now known-wrong)

1. **retrieval-app has no local `.git`.** `git subtree add … retrieval main` from the local dir **cannot run** — there's no local history. Subtree from GitHub instead:
   `git subtree add --prefix=apps/retrieval https://github.com/ahouchell-rgb/retrieval-app.git <branch>`
   *(Footgun spotted: the local `retrieval-app` sits loosely under a stray `~/.git` repo — worth removing that stray repo so it can't accidentally track your whole home dir.)*
2. **interactive's default branch is `retrieval-cta`, not `main`.** `main` exists only as a stale remote ref behind it. Pick the canonical branch before the move; the local copy also has 45 uncommitted edits, so clone from GitHub rather than copy the worktree.

## Conflicts to resolve (none blocked the build; all are pre-move cleanups)

| # | Conflict | Fix |
|---|---|---|
| 1 | Root `package.json` on the foundations branch is still the *app's* manifest (`sciencekit`) | Replace with a true workspace-root manifest (`packageManager`, turbo devdep + scripts) when the app moves to `apps/houchell` |
| 2 | Dead per-app `package-lock.json` (npm) under a pnpm workspace | Delete `apps/*/package-lock.json`; commit one root `pnpm-lock.yaml`; pin `packageManager`/`engines` |
| 3 | Package names differ from plan (`sciencekit`/`retrieval-app` vs `@houchell/web`/`@houchell/retrieval`) | Naming decision only — no build clash |
| 4 | Supabase env names diverge (`NEXT_PUBLIC_SK_*` vs `NEXT_PUBLIC_SUPA_*`) | Reconcile per `ENV_RECONCILIATION.md`; confirm `SK_API_KEY` fully removed (Phase 5 dependency) |
| 5 | Two migration sets/conventions; `@houchell/db` is an **orphan** (no app depends on it) | Wire `"@houchell/db": "workspace:*"` into feynman + import committed types; seed bodies (`seed-bodies.sh`) |
| 6 | `build.py` regenerates `sitemap.xml` → the §5 `build && git diff --exit-code` CI check fails day one; domain hardcoded | Pre-run build.py & commit output before adding the check; parameterize `interactive-science.com` for Phase C |
| 7 | retrieval `next.config.js` CSP `frame-ancestors` hardcodes `science-kit.vercel.app` / `interactive-science.com` | Add `*.houchelleducation.com` ahead of Phase C or booklet→practice iframes break |

**Confirmed non-issues:** no `vercel.json`, `.github/workflows`, or `public/` collisions; retrieval is plain JS (no tsconfig merge); feynman tsconfig (`@/* → ./src/*`) is monorepo-safe.

## Pre-move checklist (makes the real Phase B push-button)
1. Subtree from **GitHub** (not local dirs); decide each repo's canonical branch first.
2. Replace root `package.json` with a workspace-root manifest.
3. Delete per-app npm locks; commit one root `pnpm-lock.yaml`; pin the package manager.
4. Pre-run `build.py`, commit its output, then add the idempotency CI check; parameterize the domain.
5. Reconcile Supabase env names (`ENV_RECONCILIATION.md`); confirm `SK_API_KEY` gone (Phase 5).
6. Wire `@houchell/db` into feynman (`workspace:*` + import types); seed migration bodies.
7. Update retrieval CSP `frame-ancestors` for `*.houchelleducation.com`.
8. Tune turbo cache outputs (rerun showed 0 cache hits) for CI speed.

## What this de-risks
The single biggest unknown — *does the polyglot monorepo even assemble and build?* — is now **proven yes**, with history preserved and no code changes needed. Phase B is reduced to the mechanical checklist above; do it after Phase 5 lands.
