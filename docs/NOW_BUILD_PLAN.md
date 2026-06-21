# NOW Build Plan — ticketed (0–3 months)

*Turns the roadmap's NOW phase into executable epics → tickets → acceptance criteria, with the chosen decisions baked in. Executed the way Builds 1–4 were: migration-first, additive, gated, gracefully degrading.*

## Decisions locked in
- **Expansion axis:** **Subjects first** (de-science → Maths/English) — biggest multiplier on existing schools. *(default recommendation)*
- **D2C model:** **Both funnels in parallel** — school-sponsored *and* parent-paid.
- **Content:** **AI-generate + teacher review** — generators seed content; a teacher-in-the-loop approval flow guards accuracy/spec-alignment.

## Sequencing principle
Ship **E1 (make-it-live)** and **E2 (billing)** first — nothing sells without them — then the **E6 subject foundation** (unlocks the chosen subjects-first expansion), then content + D2C ride on top. E3/E4 (compliance, identity) run in parallel as the procurement track.

---

## E1 · Make it live (data + instant dashboards)
*Goal: the science pilot returns real numbers, fast, for every dashboard.*
- **T1.1** Ship retrieval RPCs `student_weak_topics(student_id,limit)` and `class_intervention_list(class_id,threshold)` in the retrieval repo; re-gate `class_weak_topics` by role (drop the `x-sciencekit-key` path). *AC: parent report shows child-specific weak topics; intervention list populates; no shared-secret on the client path.*
- **T1.2** Materialised/snapshot views for school + cohort rollups (extend the trust-snapshot pattern). *AC: `/school` and `/trust` first paint < 500ms from a snapshot; live recompute is a manual "refresh".*
- **T1.3** Nightly `school-snapshots` cron + `school_benchmark_snapshots`. *AC: school dashboard has the same trend sparkline as trust.*

## E2 · Billing & AI cost governance (Stripe)
*Goal: take money from every buyer + protect AI margin.*
- **T2.1** Stripe integration: products/prices, checkout, customer portal, webhooks → `subscriptions` table; entitlement middleware. *AC: a teacher can buy Pro; a school can be invoiced per-pupil; entitlements gate Pro features.*
- **T2.2** AI budget governance: per-org budgets, model routing (bulk→cheap, authoring→Opus), cache audit, usage dashboard. *AC: per-org spend visible; a hard cap stops runaway; cache hit-rate reported.*
- **T2.3** Packaging config (Free / Teacher Pro / School per-pupil / MAT / Parent / Tutor) as data, not code. *AC: changing a plan's features needs no deploy.*

## E3 · Compliance & Trust Centre (procurement track)
- **T3.1** DPA + sub-processor list + retention/deletion lifecycle (pupil-leaver job). *AC: signed DPA template; a "delete this pupil" path proven end-to-end.*
- **T3.2** Trust Centre page (security, privacy, DPA, sub-processors, status). *AC: a public `/trust-centre` a procurement officer can self-serve.*
- **T3.3** Cyber Essentials prep + dependency/security scanning in CI + accessibility (WCAG 2.2 AA) audit pass on pupil/parent/teacher surfaces. *AC: CI fails on criticals; axe audit clean on key pages.*

## E4 · Identity, tenancy & admin (procurement + D2C track)
- **T4.1** `org_id` tenancy column + one reusable RLS pattern; audit log for privileged actions. *AC: cross-org isolation test passes; every role-change/export/write-back is logged.*
- **T4.2** Google/Microsoft **SSO** + Wonde/Clever rostering for sign-in. *AC: a teacher signs in with school Google; classes pre-rostered.*
- **T4.3** **Parent accounts** (passwordless/OAuth, multi-child, double-opt-in consent) — supersedes magic-link only. *AC: a parent with 2 children at 1 school logs in and sees both.*
- **T4.4** Admin console v1 (staff, classes, billing, integrations, consent, exports). *AC: a school admin onboards without us.*

## E5 · Assessment & QLA engine v1 (highest-value missing school pillar)
- **T5.1** Common-assessment authoring + mark capture (manual + photo/scan later). *AC: a dept creates a common test, enters marks per pupil.*
- **T5.2** Auto question-level analysis vs the spec/objective; class & cohort comparison. *AC: QLA heatmap by objective; weakest-question report; feeds the mastery graph.*

## E6 · Subject config foundation — de-science the engine *(unlocks subjects-first)*
- **T6.1** `subjects` + `strands` + a generic **objective taxonomy** (subject × key_stage × optional exam-board spec); make `discipline` a *config* (additive — keep existing science as a seeded subject so nothing breaks). *AC: science still works unchanged; a second subject can be added by data.*
- **T6.2** Theme/labels/colours driven by subject config, not hard-coded biology/chemistry/physics. *AC: UI renders a non-science subject correctly.*
- **T6.3** Subject-aware AI prompts for all generators (lesson, feedforward, cover, revision, practical→"required task"). *AC: a Maths feedforward reads like maths, not science.*

## E7 · Content pipeline — AI-generate + teacher review *(chosen content model)*
- **T7.1** `content_items` with a **review workflow** (draft → in-review → approved/published), provenance (AI vs human), and an approver role. *AC: nothing pupil-facing is published without a teacher approval.*
- **T7.2** Bulk generation jobs (seed a subject's curriculum/SoW/retrieval bank from the objective taxonomy) → land as drafts for review. *AC: "seed KS3 Maths" produces reviewable drafts; approve-in-bulk works.*
- **T7.3** Spec-alignment + feedback loop (flag/correct an item; correction improves prompts). *AC: a flagged item is fixed and the fix is captured.*

## E8 · D2C — both funnels in parallel *(chosen D2C model)*
- **T8.1** **Adaptive pupil pathway v1**: next-best-questions from the graph + spaced repetition + target-grade tracking. *AC: a pupil gets a personalised set; target trajectory shown.*
- **T8.2** **School-sponsored** route: a per-pupil add-on that makes Home free to that school's parents (billing + entitlement + bulk parent invite). *AC: a school enables Home; its parents get it free.*
- **T8.3** **Parent-paid** route: D2C signup + Stripe sub + the parent portal upgraded to the full Home product. *AC: a parent self-subscribes independent of any school deal.*
- **T8.4** Per-child **revision pack** + predicted-grade view in the parent/pupil app (reuses §revision-pack + the per-pupil RPC from T1.1).

---

## Recommended execution order
1. **T6.1** subject foundation (additive migration — safe, unblocks the most). 
2. **T1.1–T1.3** make-it-live. 
3. **T2.1–T2.3** billing + AI governance. 
4. then E7 content pipeline + E8 D2C in parallel with E3/E4 procurement track, E5 QLA as the school upsell.

## What I'll start first
**T6.1** — the additive `subjects`/`strands`/objective-taxonomy migration + a config layer that keeps the seeded science subject working unchanged. It's low-risk (additive), and it's the keystone for the subjects-first expansion. Everything else (subject-aware prompts, content pipeline, multi-subject dashboards) hangs off it.
