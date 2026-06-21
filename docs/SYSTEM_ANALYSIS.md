# System analysis — what we have, and how to improve it

*A candid technical + product review of the whole build, with prioritised improvements.
Companion to the strategy/roadmap docs.*

---

## 1. What we have

A single Next.js (App Router) app on Vercel, talking to one Supabase "anchor"
(Postgres + Auth + Storage). On top of one **mastery graph** (pupil × objective) we built:

- **Teacher tools** — planning/slides/present, and AI generators (lesson → retrieval
  questions, cover script, practical/required-task, revision pack, feedforward).
- **Parent (D2C)** — weekly report, consent UI, password-less token portal, Home adaptive
  practice + target tracker.
- **School (B2B)** — SLT/dept dashboard + trend, intervention export, self-serve onboarding,
  staff roster, sponsor-Home.
- **Trust (MAT)** — cross-school benchmarking + trend snapshots + self-serve onboarding.
- **System of record** — Wonde MIS sync (in) + attainment write-back (out).
- **Platform** — subjects/objective taxonomy (multi-subject), billing/entitlements (Stripe),
  compliance (Trust Centre/privacy/audit/export), content review pipeline, assessments/QLA,
  7 crons.

**Scale of code:** ~21 migrations, ~32 API routes, ~14 docs, 7 crons, ~12 SECURITY DEFINER RPCs.

---

## 2. Architecture assessment

**The pattern that's right:** base-table RLS is owner-scoped everywhere; every cross-org read
is one role-gated `SECURITY DEFINER` function; integrations are env-gated and degrade
gracefully; mutations of privileged state go through RPCs, never client writes. This is the
correct spine and it has held across a large surface.

**The structural tensions:**
- **Two repos, one schema.** Several RPCs the app calls (`student_weak_topics`,
  `class_intervention_list`, `class_weak_topics` gating) live in the *retrieval-app* repo, not
  here. The contract is documented but **not enforced** — drift will cause silent fallbacks.
- **One database, all tenants.** Every school/trust shares the anchor; RLS is the only
  isolation boundary. Fine now, but the blast radius (a bad policy, a `SECURITY DEFINER` bug)
  is the whole customer base.
- **App-layer aggregation.** Dashboards fan out N `class_weak_topics` calls per request.
  Snapshots fix this for school/trust; the live SLT/intervention paths still fan out.

---

## 3. Strengths (keep these)

1. **Security model is coherent and consistent** — owner RLS + definer RPCs + no
   client-self-assignable roles. Rare to get right across this much surface.
2. **Graceful degradation everywhere** — no AI key → templated output; no Resend → persist;
   no Wonde/Stripe → env-gated no-op; no retrieval RPC → class-level fallback. Nothing
   hard-fails, which is why every commit shipped green.
3. **"One engine, configured"** held — multi-subject, multi-buyer, multi-org all ride the same
   graph; adding a subject is data, not a fork (proven with the Maths unit).
4. **Reuse over reinvention** — lesson generator rides slides-assistant; trust/school rollups
   share `rollupTrust`; questions save through the existing bank flow.

---

## 4. Weaknesses, debt & risks (be honest)

### Correctness / robustness
- **Thin test coverage.** 25 tests predate all of this; **none of the new routes, RPCs, or
  RLS policies are tested.** The riskiest things (security-definer gating, RLS isolation,
  webhook signature, write-back retries) have zero automated checks.
- **Boilerplate duplication.** `SK_URL` + the anon key + the auth-check + usage-logging block
  are copy-pasted across ~20 routes; `extractHtml`/prompt scaffolding across ~5 generators.
  A bug fixed in one isn't fixed in all.
- **No schema source-of-truth across repos.** The retrieval RPC contracts can drift unnoticed.

### Performance / scale
- Live SLT dashboard + intervention export **fan out per class** (bounded pool, but O(classes)
  retrieval calls per page load). At a large MAT this is slow and hammers retrieval.
- Snapshots exist but the **dashboards still recompute live** rather than serving the snapshot
  first — the "instant load" goal is set up but not switched on.
- AI cost: per-teacher spend is *visible* but there is **no enforced per-org budget or model
  routing** — margin risk as usage scales.

### Security / privacy
- **Audit coverage is partial** — only export/MIS routes log; the role-change/onboarding RPCs
  (the most sensitive) don't.
- **No rate limiting** on the AI/public routes (portal, set-target) beyond the daily cap.
- **Accessibility unaddressed** — everything is inline-styled `div`s, not semantic HTML; WCAG
  2.2 is a stated requirement (E3) but not done. This is also a public-sector procurement gate.

### Data model / product
- **`discipline` ⊕ `subject_id` duality** is transitional debt — two ways to say "what subject".
  The curriculum filter now handles both, but the retrieval side is still science-only.
- **No objective↔topic linkage yet** — the new `objectives` taxonomy isn't wired to retrieval
  topics or QLA, so "mastery per objective across sources" isn't unified yet.
- **Parent auth is ad hoc** — three different token mechanisms (portal access_token, unsubscribe
  token, set-target validation). Parent accounts (E4) would consolidate and harden these.

### Ops
- **No error tracking / alerting / dead-letter** on crons; a failing nightly job is silent.
- **Migrations are same-day dated** (20260620/21) and many depend on apply-order; there's no
  CI that applies them to a throwaway DB to catch breakage.

---

## 5. Improvements — prioritised

### P0 — before real customers (correctness & trust)
1. **Centralise the Supabase/auth/AI boilerplate** into a shared server helper
   (`requireUser`, `skAdmin`, `logUsage`, `aiComplete`, `extractHtml`). Removes ~20× drift.
2. **Test the security surface.** Integration tests against a seeded test DB for: RLS isolation
   (user A can't read B), each `SECURITY DEFINER` RPC's role gate, the Stripe webhook signature,
   and write-back retry/idempotency. This is the highest-value testing you can add.
3. **Cross-repo schema discipline.** Move the retrieval RPC contracts into a shared,
   version-checked migration set (or a contract test that fails if an RPC is missing), so the
   parent report / intervention list can't silently fall back in production.
4. **Audit the role RPCs** (`create_school/join/leave/set_member_role/create_trust/…`) — add
   `log_audit()` inside each definer function.
5. **CI: apply migrations to an ephemeral Postgres** on every PR; run `next build` + tests.

### P1 — scale & margin
6. **Serve dashboards from snapshots first**, recompute on demand — turn the "instant load" on
   for SLT (add a `school_snapshots`-backed read) and extend snapshots to the intervention path.
7. **AI cost governance for real** — per-org monthly budgets enforced server-side, model
   routing (cheap model for bulk generation/QLA, Opus only for authoring), and a cache-hit
   dashboard. Protects gross margin as you grow.
8. **Rate-limit** the public/AI routes (portal, set-target, generators) per IP/token/user.

### P2 — product depth that compounds
9. **Wire the objective taxonomy** to retrieval topics *and* QLA, so the mastery graph blends
   **retrieval + assessment** per objective — then surface assessment mastery in the SLT/trust
   dashboards (today they're retrieval-only). This is the single biggest product unlock left.
10. **Parent accounts + SSO** (E4) — consolidates the three token flows, unlocks parent-paid
    checkout, and is a procurement expectation for schools (Google/Microsoft sign-in).
11. **Accessibility pass** — semantic landmarks, focus states, contrast, a shared styled
    component layer (the inline-style sprawl is also a maintainability cost). Move toward
    design tokens / a component kit.
12. **Content engine** — wire the bulk AI-generate jobs into the content pipeline (E7) so
    seeding a subject's curriculum/bank is a reviewed workflow, not hand-written SQL.

### P3 — platform maturity
13. **Observability** — Sentry + cron alerting + a dead-letter for failed sync/write-back/report
    rows; a status page.
14. **Tenancy hardening** — an `org_id` column + a documented isolation test as you approach
    multi-region / enterprise; consider per-trust data export and retention automation.
15. **Retire the `discipline` enum** once subjects are fully adopted (keep a view for back-compat).

---

## 6. The three things I'd do first

1. **Extract the shared server helpers + test the security/RLS surface** — the cheapest way to
   de-risk a large, fast-built codebase before it touches real pupil data.
2. **Blend assessment + retrieval into one per-objective mastery view** and surface it in the
   dashboards — the biggest product leverage from work already half-built.
3. **Switch dashboards to snapshot-first + enforce AI budgets** — makes it fast and keeps it
   profitable at MAT scale.

Everything else (subjects breadth, D2C funnels, MIS depth) is now incremental on a sound spine.
The spine is good; the gaps are **testing, cross-repo contracts, performance switch-on, and the
objective-level data unification** — not the architecture.
