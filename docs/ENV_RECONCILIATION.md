# Env-var reconciliation — three apps → one convention

Prep for the monorepo move (companion to `MONOREPO_AND_DOMAIN_PLAN.md` §6). All three apps
already point at the **same Supabase anchor** (`uvzukwoxqhcxaxtzrziy`) — this is one backend with
three frontends — but the env naming has drifted. The Supabase URL alone is called five things.

## The unified convention

Supabase concepts → standard `*SUPABASE*` names; public values keep `NEXT_PUBLIC_`; the cross-app
RPC secret keeps `SK_`. Edge functions are the one exception (see gotcha #1).

| Concept | feynman-education | retrieval-app | interactive-science | **Unified name** | Scope |
|---|---|---|---|---|---|
| Supabase URL | `NEXT_PUBLIC_SK_URL` (+ hardcoded `SK_URL`) | `NEXT_PUBLIC_SUPA_URL`; edge `SUPABASE_URL` | hardcoded | **`NEXT_PUBLIC_SUPABASE_URL`** (edge: `SUPABASE_URL`) | public / edge |
| Supabase anon key | `NEXT_PUBLIC_SK_KEY` (+ `SK_KEY`/`SK_ANON`) | `NEXT_PUBLIC_SUPA_KEY` | hardcoded | **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | public |
| Service-role key | `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` (`SERVICE_KEY`) | — | `SUPABASE_SERVICE_ROLE_KEY` ✅ aligned | server / edge |
| Direct Postgres | `DATABASE_URL` | (migrate script) | — | `DATABASE_URL` | server |
| Claude key | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | — | `ANTHROPIC_API_KEY` ✅ | server / edge |
| Cross-app RPC secret | `SK_API_KEY` | consumed via `x-sciencekit-key` (DB) | — | `SK_API_KEY` (keep) | server |
| Cron bearer | `CRON_SECRET` | — | — | `CRON_SECRET` | server |
| Stripe | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | — | unchanged | server |
| Resend | `RESEND_API_KEY` / `PARENT_REPORT_FROM` | — | — | unchanged | server |
| Google OAuth | `GOOGLE_CLIENT_ID` / `_SECRET` / `_STATE_SECRET` | — | — | unchanged | server |
| Microsoft OAuth | `MICROSOFT_TENANT` / `_CLIENT_ID` / `_SECRET` / `_STATE_SECRET` | — | — | unchanged | server |
| Wonde MIS | `WONDE_TOKEN` / `WONDE_SCHOOL_ID` | — | — | unchanged | server |
| Frame allowlist | — | `ALLOWED_FRAME_ANCESTORS` | — | unchanged | server |
| Anon mark quota | — | `ANON_MARK_DAILY_LIMIT` | — | unchanged | edge |
| retrieval-app origin | `NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN` **+** `RET_APP_ORIGIN` | — | `RETRIEVAL_EMBED_BASE` (build) | **collapse to** `NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN` | public / build |

## Headline collisions to fix
1. **Supabase URL** has 5 names → `NEXT_PUBLIC_SUPABASE_URL`.
2. **Supabase anon key** has 4 names (`SK_KEY`/`SK_ANON`/`SUPA_KEY`/`ANON_KEY`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. feynman-education has **both** `NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN` and `RET_APP_ORIGIN` for the same value — collapse to one.

## Biggest mechanical risk — hardcoded literals
feynman-education does **not** read the Supabase URL/anon key from env in most places — they are
**copy-pasted literals** in `src/lib/sk.tsx:12-13`, `src/lib/serverHelpers.ts:6-10`, and ~20 API
route files (e.g. `audit-log`, `lesson-generator`, `trust/overview`, `school/*`, `parent/*`). A rename is
**incomplete** unless these are switched to `process.env` reads everywhere; otherwise the literals
silently win. (The anon key being public is acceptable; reading it from env is for rotation/re-pointing.)

retrieval-app is better (`process.env... || "<literal>"`) except `src/app/api/health/route.js:11-12`.
interactive-science inlines the anon key into **every generated `.html`** — rotating it means re-running `build.py`.

## Migration gotchas
1. **Edge functions keep `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` exactly** — the Supabase platform auto-injects these into the Deno runtime (`supabase/functions/*`). Do **not** add `NEXT_PUBLIC_`.
2. **`NEXT_PUBLIC_*` renames = rebuild + redeploy** (inlined at build time). interactive-science's public values are baked into static HTML → re-run `build.py`.
3. **Per-project Vercel env** — decide one Vercel project (shared env) vs. three pointing at the monorepo (each needs its own env set). Shared secrets must exist in every project that needs them.
4. **OAuth redirect URIs** are tied to the deployed origin — when the domain move happens, add the new `/api/google/callback` and `/api/microsoft/callback` URIs in the Google/Microsoft consoles. `*_STATE_SECRET` fall back to `*_CLIENT_SECRET` — keep that.
5. **`SK_API_KEY` is a contract, not just config** — App sends `x-sciencekit-key`; the DB RPC checks the literal. It's mid-rotation in Phase 5 — **don't rename and rotate in the same change.**
6. **One anchor, shared keys** — rotating the anon or service-role key affects all three apps + edge fns + the static-site regeneration simultaneously. Coordinate.

## Local hygiene note (not a git leak)
`retrieval-app/db/unification/.env.migrate.local` holds plaintext Postgres connection strings (incl. the
DB password). Verified **gitignored, untracked, never committed** — so it is *not* exposed via git/GitHub.
But it sits in plaintext on disk; now the cutover is done, consider deleting it (and rotating that DB
password if the machine is shared/backed-up/synced).
