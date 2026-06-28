# Monorepo + domain consolidation — concrete plan

*Phase A (DB) done; **Phase B (monorepo move) executed 2026-06-28 on branch `chore/monorepo`,
not yet pushed** — see §7. Phase C (domains) not started. Rewritten after inspecting the actual
`retrieval-app` and `interactive-science` repos. Companion to
[SYSTEM_ANALYSIS.md](SYSTEM_ANALYSIS.md) §2, [PHASE3_REPOINT.md](PHASE3_REPOINT.md),
[PHASE5_REGATE_RPCS.md](PHASE5_REGATE_RPCS.md), and the retrieval repo's
`db/unification/README.md`.*

---

## 0. Reality check — what the three repos actually are

| | **feynman-education** (this) | **retrieval-app** | **interactive-science** |
|---|---|---|---|
| GitHub | `ahouchell-rgb/feynman-education` | `ahouchell-rgb/retrieval-app` | `ahouchell-rgb/interactive-science` |
| Domain | `app.feynman.education` | `retrieval-app.com` | `interactive-science.com` |
| Stack | Next 14 · App Router · **TypeScript** · npm · vitest | Next 14 · App Router · **JavaScript** · npm · vitest | **Static HTML built by Python** (`build.py`) — no Node, no framework |
| DB assets | `supabase/migrations/` (40, `YYYYMMDD_name.sql`) | `db/migrations/` (64, `YYYYMMDD_NN_name.sql`) **+ `supabase/functions/` (Deno edge fns)** | none |
| Owns | callers of the retrieval RPCs; crons; MIS; billing | **the RPCs** (`class_weak_topics`, `student_weak_topics`, …), the `SK_API_KEY` gate, marking edge fns | `resources.json` manifest, `retrieval_topics` slug→UUID map, iframe embeds |
| Deploy | Vercel (Next) | Vercel (Next) **+ `supabase functions deploy`** | static host (Vercel static / Pages — confirm) |

**Three corrections to my first draft:**
1. **retrieval-app is JavaScript, not TypeScript.** Sharing app-level code (`serverHelpers`,
   `supabaseRest`) across the TS↔JS boundary is *not* free — don't plan a shared `packages/core`
   that both import. The realistic shared artifact is **`packages/db` (SQL + generated types +
   the contract)**, not runtime code.
2. **interactive-science is not a Node app.** It's ~90 static `*.html` revision booklets +
   `interactives/`, assembled by Python from `resources.json`. It joins the monorepo as a
   **non-workspace** member built by `python build.py`, deployed as static output.
3. **retrieval-app carries Supabase Edge Functions** (`supabase/functions/*`, Deno) that deploy
   separately from Vercel. They move with the app and need their own deploy step.

---

## 1. The DB unification is DONE (verified live 2026-06-23)

`retrieval-app/db/unification/README.md` ("Phase 3 — One Identity + One Database") described the
plan; **a live check of the projects this session confirms it has been executed:**

- **One anchor** Supabase project: `uvzukwoxqhcxaxtzrziy` (retrieval's). Both apps' source points
  at it.
- The **teacher/ScienceKit** project (`uujbgdwnuspfnvfpdtvr`) and **pulse-student-hub**
  (`kdtdunjbrwucjsnggmkl`) were collapsed in. Evidence on the anchor:
  - the migration ledger contains `phase3_stage_feynman_schema`, `phase3_regate_rpcs_and_admin_role`
    and a full block of `feynman_20260620_*` / `feynman_20260621_*` ports + reconcile rows
    (110 migrations total — captured in `packages/db/migrations/LEDGER.json`);
  - the teacher tables + data are present in the anchor's `public` (units 47, resource_map 60,
    responses ~3k, 22 auth users) and there is **no** leftover `feynman` staging schema;
  - **all 25 RPCs the feynman app calls exist on the anchor with the expected signatures.**
- ScienceKit (`uujbgdwnuspfnvfpdtvr`, auth_users=1, no `responses` table) and pulse-hub survive as
  **read-only rollback**, pending Phase-6 decommission — exactly as the runbook prescribes.

**What's left of that arc:** Phase 5 (`security/sk-api-key-rotation-phase5` +
[PHASE5_REGATE_RPCS.md](PHASE5_REGATE_RPCS.md)) — re-gate the weak-topic RPCs by role and drop
`SK_API_KEY` on interactive paths. That's the **only remaining gate before the monorepo move.**

**Implication for sequencing:** the scary part (DB/identity/auth) is behind you. Land Phase 5,
then do the monorepo. Don't build monorepo tooling around `SK_API_KEY` — it's being removed.

---

## 2. Target repo layout (polyglot)

```
feynman/                              # monorepo root
├─ apps/
│  ├─ feynman/                        # this app (TS Next)        → app.feynman.education
│  │  ├─ src/  next.config.mjs  vercel.json   # crons live here
│  │  └─ package.json                 # "@feynman/web"
│  ├─ retrieval/                      # retrieval-app (JS Next)   → practice.feynman.education
│  │  ├─ src/                         # JS — stays JS; no forced TS migration
│  │  ├─ supabase/functions/          # Deno edge fns — own deploy step
│  │  └─ package.json                 # "@feynman/retrieval"
│  └─ interactive/                    # static site (Python)      → interactive.feynman.education
│     ├─ *.html  interactives/  resources.json  build.py
│     └─ (NOT a workspace package — built by `python build.py`)
├─ packages/
│  └─ db/                             # @feynman/db — THE source of truth (the real prize)
│     ├─ migrations/                  # ONE ordered set: feynman(40) + retrieval(64) reconciled
│     ├─ functions/                   # edge fns live with the schema they touch (or keep in app)
│     ├─ contracts/retrieval.ts       # RPC signatures the apps depend on (typed)
│     ├─ types.ts                     # `supabase gen types` output (generated, committed)
│     └─ contract.test.ts             # FAILS CI if a required RPC is missing / wrong-arity
├─ .github/workflows/ci.yml           # turbo build + repo-wide secret-scan + db contract test
├─ turbo.json                         # orchestrates the 2 Node apps; runs interactive's py build
├─ pnpm-workspace.yaml                # packages: apps/feynman, apps/retrieval, packages/*
│                                     #   (interactive is NOT listed — it has no package.json)
└─ package.json
```

**No `packages/core`, no `packages/ui` in v1.** The TS↔JS split makes shared runtime code a trap;
revisit only if/when retrieval is migrated to TS. The win is `packages/db`.

---

## 3. `packages/db` — built (the centerpiece)

> **Status: scaffolded this session at [`packages/db/`](../packages/db/) (uncommitted, `.mjs` so
> it can't disturb the security branch's `tsc`/vitest).** Because the migration reconciliation is
> **already applied on the anchor**, `packages/db` doesn't hand-merge two repos — it **mirrors the
> live ledger** (`migrations/LEDGER.json`, 110 migrations) and enforces the RPC contract against
> it. The 25 RPC signatures in `contracts/rpcs.mjs` were captured from the live anchor, so the
> contract reflects reality, not a guess. Remaining one-time step: seed the SQL bodies via
> `supabase db pull` (see `packages/db/migrations/README.md`). File map: `packages/db/README.md`.

What the package gives you:

1. **One ordered migration set.** Reconcile `feynman/supabase/migrations/` (40, `YYYYMMDD_name`)
   and `retrieval/db/migrations/` (64, `YYYYMMDD_NN_name`) into `packages/db/migrations/` under a
   single naming/order scheme. The retrieval set is already replay-verified (`db/README.md`,
   reconciled 2026-06-18); preserve that property. Fold in `db/unification/10_reconcile.sql` as
   the one-time cutover step (kept separate / clearly dated).
2. **Contract declared + tested.** `contracts/retrieval.ts` lists the RPCs the apps call —
   `class_weak_topics`, `student_weak_topics`, `class_unit_gaps`, `class_paper_gaps`,
   `class_objective_breakdown`, `class_intervention_list` (the PHASE5 in-scope list), plus the
   objective-mastery RPCs. `contract.test.ts` applies all migrations to an ephemeral Postgres in
   CI and fails red if any is missing or wrong-arity. **This converts today's silent prod fallback
   into a build error** — and it would have caught the rehearsal bug where two enums didn't move.
3. **Generated types committed** from the unified schema, imported by `apps/feynman` (TS). The JS
   app and the Python site don't consume types, but the schema is still their single source.

```ts
// packages/db/contracts/retrieval.ts
export const REQUIRED_RPCS = [
  { name: "class_weak_topics",          args: ["uuid"] },
  { name: "student_weak_topics",        args: ["uuid"] },
  { name: "class_unit_gaps",            args: ["uuid"] },
  { name: "class_paper_gaps",           args: ["uuid"] },
  { name: "class_objective_breakdown",  args: ["uuid"] },
  { name: "class_intervention_list",    args: ["uuid"] },   // slt-only, personal data
] as const;
```

---

## 4. Tooling

**pnpm workspaces + Turborepo** (npm workspaces is the lower-churn fallback — you're on `npm ci`
in all three). Turbo orchestrates the two Node apps and runs interactive's Python build as a task
with no JS deps:

```json
// turbo.json (sketch)
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**"] },
    "typecheck": {},
    "test":      {},
    "build:interactive": { "outputs": ["interactive/index.html"] }  // wraps `python build.py`
  }
}
```

interactive stays out of `pnpm-workspace.yaml` (no `package.json`); its build is either a turbo
task that shells `python3 apps/interactive/build.py`, or just a Vercel static project with that
build command. Either way it is **not** a JS workspace member.

---

## 5. CI (`.github/workflows/ci.yml`)

- **`build`** → `pnpm install` + `turbo run typecheck test build` (only affected packages rebuild).
- **`db-contract`** (new) → `services: postgres:16`; apply `packages/db/migrations/*` in order;
  run the contract test. The highest-value addition.
- **`secret-scan`** → keep as-is. It already scans tracked files repo-wide, so it now covers all
  three apps for free. Its `SK_API_KEY` / service-role / Stripe patterns still apply (and note the
  anon-key literal is intentionally in source in *both* Node apps).
- **interactive** → optional `python build.py && git diff --exit-code` check (build is idempotent,
  so a drift between `resources.json` and the committed `index.html` fails the build).

---

## 6. Vercel — three (or four) projects, one repo

| Project | Root Directory | Domain | Notes |
|---|---|---|---|
| feynman-web | `apps/feynman` | `app.feynman.education` | crons in its `vercel.json` |
| feynman-practice | `apps/retrieval` | `practice.feynman.education` | **+ separate `supabase functions deploy`** for the edge fns |
| feynman-interactive | `apps/interactive` | `interactive.feynman.education` | static; build command `python3 build.py` |

Each project: set **Root Directory** to the subdir, **Ignored Build Step** = `npx turbo-ignore`
(or a path filter for interactive), move that app's env into the project. Note the env-var names
differ today — feynman uses `SK_URL`/anon literal; retrieval uses `NEXT_PUBLIC_SUPA_URL` /
`NEXT_PUBLIC_SUPA_KEY`; reconcile these to one convention during the move.

---

## 7. Sequencing (revised — the DB cutover leads)

```
Phase A  ── DB UNIFICATION  ✅ DONE (verified live 2026-06-23) — see §1
            • cutover applied: one anchor, one auth pool, feynman_* migrations ported, queries
              same-DB. ScienceKit + pulse-hub kept as read-only rollback.
            • REMAINING: land security/sk-api-key-rotation-phase5 (re-gate RPCs by role, drop
              SK_API_KEY on interactive paths). This is the last gate before Phase B.

Phase B  ── MONOREPO (the move)  ✅ DONE on branch `chore/monorepo` (2026-06-28, not yet pushed)
            • branched off the security branch (not main) to keep packages/db, springboard,
              home-course and the in-flight Phase 5 work — main lacked all of it
            • git mv this app → apps/feynman (history preserved, renamed @feynman/web)
            • git subtree add --prefix=apps/retrieval   retrieval   main   (full history) →
              flattened the wrapper Downloads/retrieval-app/ up; renamed @feynman/retrieval
            • git subtree add --prefix=apps/interactive interactive main   (full history;
              static, not a workspace member)
            • packages/db already scaffolded (@feynman/db); contract test + db-contract.yml in place
            • wired **npm** workspaces + turbo + root README (npm, not pnpm — lowest churn; all
              three were already on npm). `npm install` links web/retrieval/db; @feynman/web
              typecheck=0 and 143/143 tests pass after the move.
            • REMAINING in Phase B: push the branch; reconcile the SQL bodies into packages/db
              (`supabase db pull`); fold retrieval's supabase-functions-deploy into root CI;
              repoint 3 Vercel projects at subdirs, verify on *.vercel.app PREVIEW URLs

Phase C  ── DOMAINS (incremental, reversible)
            • add app/practice/interactive subdomains to each Vercel project (keep old domains)
            • session cookie on .feynman.education → first-party across all three (supports the
              "one Auth pool" the unification already created)
            • re-register OAuth redirect URIs (Google/MS), Resend From-domain
            • 301 the old .com domains → subdomains (keep .com registered + redirecting; a
              descriptive retrieval-app.com may still convert for D2C as a landing front-door)
```

**Why this order:** the DB cutover is gated, rehearsed, and high-blast-radius; it's the critical
path and the prerequisite for deleting `SK_API_KEY`. A monorepo path-rewrite *before* it would
force rebasing the cutover across the move. Land the cutover in the repos that exist, *then*
consolidate stable repos. The `packages/db` step in Phase B is the natural tidy-up of the
"two migration sets, one DB" debt the cutover leaves behind.

---

## 8. Git history — preserved

`git mv` keeps this repo's history; `git subtree add` copies the other two repos *with* their
history (they are not moved/destroyed — the originals stay intact). Alternative for cleaner blame:
`git filter-repo --to-subdirectory-filter apps/<name>` per repo before merging. Keep the three
source repos archived/read-only until the monorepo has run a full release cycle clean in prod.

---

## 9. Open questions to confirm before Phase B

1. ~~Has the live DB cutover happened yet?~~ **ANSWERED 2026-06-23: yes, done** (see §1). Only
   Phase 5 (SK_API_KEY re-gate) remains before Phase B.
2. **interactive-science host** — Vercel static, GitHub Pages, or other? Determines the Phase C
   DNS + build-command wiring.
3. **pulse-hub / parent-hub** (`kdtdunjbrwucjsnggmkl`, archived) — in scope for the monorepo, or
   stays decommissioned per unification Phase 6? Plan above treats it as out of scope.
4. **Keep retrieval as JS, or migrate to TS** as part of the move? Recommendation: keep JS in v1;
   a TS migration is a separate, optional effort that would later unlock a shared `packages/core`.
