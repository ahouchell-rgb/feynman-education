# NOW plan — E1 / E2 / E5 (delivered)

## E1 · School benchmark snapshots
- `school_benchmark_snapshots` (member RLS read) + `/api/cron/school-snapshots` (Sun 04:30) aggregate each school's classes' weak objectives into a daily snapshot; `/school` shows a **school-average trend sparkline**. Mirrors the trust snapshot — sets up instant load + trend.

## E2 · Billing & entitlements (Stripe, env-gated)
- `plans` (config) + `subscriptions` (one per user; webhook-written; owner RLS read).
- `src/lib/stripe.ts` — no-SDK Stripe REST (checkout + portal) + HMAC webhook verification. `src/lib/entitlements.ts` — `getEntitlement` + `can(feature)`.
- Routes: `/api/billing/checkout` (+ portal), `/api/billing/webhook`, `/api/billing/status` (plans + entitlement + **today's AI spend** for cost governance). `/billing` page.
- **Soft gating:** the lesson generator checks `ai_generators` only when `BILLING_ENFORCED=1` — off by default so pilots stay open. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, each plan's `stripe_price_id`, and point a Stripe webhook at `/api/billing/webhook` to go live.
- *AI cost governance:* per-teacher daily spend is surfaced; model-routing + per-org budgets are the documented next step.

## E5 · Assessments & QLA (the school pillar)
- `assessments` (+ roster) / `assessment_questions` (max marks + topic/objective) / `assessment_marks` (per pupil per question). Owner-scoped RLS.
- `/assessments` page (nav: **Assess**): create an assessment, define questions, enter marks in a grid, and read **question-level analysis** — by question, by topic (weakest first, heat-coded), and by pupil (%). All computed from saved marks.
- This is the **second major data source into the mastery graph** besides retrieval. Next: photo/scan mark capture, write QLA results back to the objective taxonomy, and surface assessment mastery in the SLT/trust dashboards alongside retrieval.

All three: `next build` (next@14.2.3) + 25 tests pass; additive + RLS-scoped + env-gated where external.
