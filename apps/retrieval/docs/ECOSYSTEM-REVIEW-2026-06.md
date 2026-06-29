# Ecosystem review & improvement roadmap — June 2026

> Produced from a multi-agent deep audit (7 domain reviewers + adversarial verification against
> live code, git, and the production Supabase database `uvzukwoxqhcxaxtzrziy`). 21 candidate
> improvements were generated; 18 survived verification. Every item below cites concrete evidence.

## Scope: the three-app ecosystem

| App | Path | Role | Prod |
|---|---|---|---|
| **retrieval-app** | `~/Downloads/retrieval-app` | Flagship: retrieval practice + AI marking + HoD analytics. Next.js 14, plain JS, 8 Supabase edge functions. | retrieval-app.com |
| **feynman-education** (pkg `sciencekit`) | `~/Downloads/feynman-education` | Authoring power-layer (slides → questions). Next.js + TS. | science-kit.vercel.app |
| **interactive-science** | `~/Documents/Science Misc/springboard/interactive-science` | Public top-of-funnel: 44 static revision booklets + Python tooling. | interactive-science.com |

All three share one Supabase anchor (`uvzukwoxqhcxaxtzrziy`) and one Auth pool.

## Verdict

The ecosystem is in genuinely good shape and **further along than its own docs claim**: feynman and
retrieval-app already share the anchor DB, the marking pipeline is server-authoritative, edge-function
authZ is carefully built, and the core retrieval loop (unlock topic → mark taught → AI marks →
ClassGaps/Misconceptions → reteach) closes the data-to-action loop better than most edtech.

The weaknesses are **concentrated and fixable, not structural**, in four clusters:
1. One live security/cost hole + one auth gap (urgent, cheap).
2. The funnel and the revenue model don't connect — the in-product paywall is a dead-end, and the
   booklet funnel sends *pupils* to a *schools pricing page* with no attribution.
3. The Papers/mocks subsystem is an under-instrumented island that doesn't feed the reteach loop —
   exactly where the headline upload-docx → feedforward request lands.
4. Maintainability debt (no TS, edge-function copy-paste, drifted migration ledger) — compounding but
   not urgent.

## Top 3 highest-leverage moves

1. **Close the live cost/security holes** — `anon_mark_usage` RLS *(done 2026-06-22)* + a code-side
   HIBP password check in `manage-student`. Baseline controls a school-district IT review looks for.
2. **Connect the funnel to revenue** — capture the in-product paywall lead, and fix the static
   top-of-funnel so pupil CTAs land on a param-aware pupil surface with every view/click measured.
3. **Build the upload-docx → feedforward generator** as a deliberate cross-app feature (see
   `FEEDFORWARD-FEATURE-SPEC.md`), not as quick wiring.

---

## NOW

### 1. ~~Lock down `anon_mark_usage` (RLS + revoke grants)~~ — ✅ DONE 2026-06-22
- **Impact/effort:** high / S. **Status:** Applied to prod via `db/migrations/20260622_01_anon_mark_usage_rls_lockdown.sql`. Security advisor ERROR count 1 → 0; `anon_mark_bump` legit path verified working.
- **Was:** `anon_mark_usage` (the only cost guard behind public `mark-preview`) had RLS **disabled**
  with `anon` holding DELETE/UPDATE/TRUNCATE via PostgREST. Because the limiter fails open, an attacker
  could truncate the counter and trigger unlimited paid Haiku marking.

### 2. Enable leaked-password protection + code-side HIBP floor on staff account creation
- **Impact/effort:** medium / M.
- **Why:** Leaked-password protection is confirmed OFF on the anchor. Staff accounts hold pupil PII on
  the now-unified Auth pool. **Critical caveat:** `manage-student` creates/resets staff via the admin
  API, which **bypasses** the dashboard HIBP toggle — so the load-bearing fix is a code-side HIBP
  k-anonymity check + raising the 6-char floor to ≥10 in `create_teacher`/`reset_teacher_password`.
- **Evidence:** advisor `auth_leaked_password_protection` WARN; `supabase/functions/manage-student/index.ts:136` (create floor), `:247` (reset floor), `:150`/`:221` (admin API bypasses Auth HIBP).

### 3. Wire the in-product paywall into a captured lead + operator inbox
- **Impact/effort:** high / M.
- **Why:** Hitting the `customQuestions` lock is the highest-intent expansion signal a teacher can give,
  and it's a dead-end "speak to your administrator" string with no link or capture. Scope: the
  `Teacher.js` lock card + a new leads inbox view in `AdminPanel` + an authenticated leads insert.
  *(Verification correction: no operator leads surface exists today — the inbox is net-new, hence M.)*
- **Evidence:** `src/components/Teacher.js:1209-1216` (static lock, no capture); `src/app/pricing/page.js:39-44` (anon leads insert path exists); `src/components/AdminPanel.js:464` (view switch only — no leads reader).

### 4. Point the static booklet CTA at a pupil-facing, param-aware landing surface
- **Impact/effort:** high / S.
- **Why:** A Year-10 clicking "Practise this in the retrieval app" from a booklet lands on
  retrieval-app.com's *"For schools — pricing & a free pilot"* page — wrong persona, untracked arrival.
  Make `Landing.js` read `searchParams`, branch copy for `?ref=interactive-science` to a pupil message,
  and emit a funnel event — reusing the `useSearchParams` + `emitFunnel` patterns already in `embed/practice`.
- **Evidence:** `add_retrieval_cta.py:42-43` (target is bare homepage); `src/components/Landing.js:31,47,73` (all CTAs → /pricing, no searchParams); `src/app/embed/practice/page.js:42-47` (the pattern to mirror).

### 5. Add cookieless analytics + outbound-click tracking to static booklet pages
- **Impact/effort:** medium / S.
- **Why:** The whole funnel is built on `?ref`/`?from` attribution that nothing on the static side
  records. *(Correction: the 43 widget-embedded booklets ARE already measured via `/embed/practice`
  telemetry — the real gaps are the ~31 non-widget content pages, organic page views/referrers, and the
  static CTA click itself.)* Cheap idempotent injector mirroring `add_resize.py`/`add_retrieval_cta.py`.
- **Evidence:** no `plausible|gtag|analytics` in any `*.html`; `add_retrieval_cta.py:41-43` builds `?ref` with no static-side consumer; `src/app/embed/practice/page.js:89` (widget pages already fire `booklet_viewed`).

### 6. Upload-docx → feedforward generator in the exam tool — **headline feature**
- **Impact/effort:** high / **XL** (revised up from L — spans two apps + a new server capability).
- **Why:** The user's explicitly requested feature. ~70% already exists in feynman
  (`api/feedforward/route.ts` + `FeedforwardFromPaper.tsx`) but outputs **HTML not .docx**, takes
  **images/PDF not docx**, and lives in the **authoring app**. The genuine new work is per-question
  granularity, the `.docx` output per the `feedforward` Skill, and relocation into the Papers UI.
- **Full design:** see `FEEDFORWARD-FEATURE-SPEC.md`.
- **Evidence:** `src/components/PaperResults.js:70-94` (flat scores, no drill-down); `db/migrations/20260618_10_paper_uploads_bucket.sql` (image/pdf only); feynman `src/app/api/feedforward/route.ts:161` (HTML output); feynman `src/components/PaperGaps.tsx` (existing topic-level path, HTML-only).

---

## NEXT

- **Fix feynman token metering** (high/S) — `daily_token_usage` has 0 rows, so AI caps read zero. Root
  cause is a missing `res.ok` check (a failing RPC fetch resolves and never hits `catch`). Masked only
  because no operator has set a cap. *(Note: `increment_token_usage` RPC actually EXISTS on the anchor —
  the "missing on both DBs" memory is stale; the `token_usage` table being empty is the real symptom.)*
- **Teacher-facing "marking time saved" ROI tile** (high/M) — the value prop is "get the marking time
  back" but the product never quantifies it at renewal. Reuses response counts already loaded in
  `HodPanel.js:43` / `Teacher.js:226` × a tunable seconds-per-mark constant. Show as an estimate with a
  "how this is calculated" footnote.
- **Tab badge counts + cross-tab "needs attention" banner** (high/M) — flags/review-queue/at-risk pupils
  are invisible unless on the dashboard tab; HoDs default to the `hod` tab and never see them. Cheapest
  daily-active retention lever. First cut: flags + at-risk (already in dash); review-queue badge needs
  state lifted out of `MarkReview` (follow-up).
- **Per-booklet canonical + JSON-LD + OG/Twitter tags** (medium/M) — 44 high-organic-intent assets with
  no structured data or social cards. One idempotent injector lifting `build.py`'s `LearningResource`
  logic; scope Quiz/FAQPage JSON-LD as optional (Q/A pairs aren't in `resources.json`). Fix `<html lang="en">` → `en-GB`.
- **Reconcile migration STATUS headers + unification runbook with the live DB** (S slice of M) — 3+
  headers say "NOT YET APPLIED" but are live (`20260621_05/07`); `db/unification/README` still says
  "nothing applied to a live app DB" though feynman talks to the anchor. Footgun for a gated cutover.
- **Make fire-and-forget cost-logging observable** (medium/S) — scoped to the 3 genuinely-swallowed
  paths: `generate-questions:93`, `mark-answer:174` (logShortcut), and critically feynman
  `serverHelpers.ts:88` which needs an explicit `if(!res.ok)` check.

## LATER (background hygiene)

- **Per-school activation/engagement view** for pricing & renewal risk — cost is fully measured, value
  is blind. Needs a new aggregating RPC matching the `get_school_plans` pattern (M).
- **Extract a shared edge-function toolkit** into `_shared/` — `corsHeaders` is byte-identical across all
  7 functions; `getAuthedUid`/`resolveSchoolId` have *already drifted* between `mark-answer` and
  `mark-paper-answer`. Low-risk mechanical consolidation.
- **Centralise the hardcoded anchor URL** (32 feynman files) — latent debt; to truly "point at a test
  project" must also env-ify `SK_ANON` and collapse the ~24 duplicate redeclarations.
- **Adopt TypeScript incrementally** on the client↔edge wire contracts — a field rename across the
  JS-client/TS-edge boundary is a silent prod break. Value comes only from a *shared types module*
  imported on both sides, not a passive `checkJs` flag. Scope to ~5 payload shapes to keep it M.
- **Unify "Mark taught"/"Recently taught"** into one optimistic action — but the two signals are NOT
  redundant (`lesson_deliveries` is an unbounded log; `recency_rank` is a 3-slot boost driving pupil
  practice), so the RPC + optimistic-UI is the safe win; bidirectional auto-promotion needs a product call.

## Risks to keep on the radar

- Migration STATUS headers / unification runbook have drifted from DB reality — re-running reconcile
  steps against an already-merged DB is a data-corruption hazard.
- Leaked-password: the dashboard toggle alone is insufficient — `manage-student`'s admin path bypasses
  it across the unified Auth pool.
- The feedforward feature is XL, spanning two apps + docx generation from a serverless route — scope and
  the retrieval-app-vs-feynman entry-point decision must be made before committing.
- feynman cost metering writing 0 rows is masked until an operator sets a cap, at which point empty
  enforcement silently disables — invisible until the `res.ok` check is added.
- "Reuse existing computations" framings are optimistic for the weekly-digest and per-school engagement
  items — they need net-new RPCs (and digest needs email/scheduling infra not in the repo).
