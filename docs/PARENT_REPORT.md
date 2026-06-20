# Weekly Parent Progress Report — implementation

The first parent-facing surface from `docs/SECONDARY_ED_STRATEGY.md` (Build 1). A
weekly report, per consented guardian↔pupil link, of **what the child's class
studied** + **the child's weakest objectives** + a **"practise now"** link into
retrieval-app. It reuses the existing feedforward generation pattern and the
`taught_log → lessons → units` + retrieval-RPC data you already have.

## What shipped

| Piece | File | Notes |
|---|---|---|
| Schema | `supabase/migrations/20260620_parent_reports.sql` | `guardians`, `guardian_student` (with consent), `parent_reports`. RLS owner = teacher, mirrors `feedforward_sheets`. |
| Generator | `src/lib/parentReport.ts` | Data-gathering + AI summary (Anthropic) with a **templated fallback** when no API key. Server-only. |
| Email | `src/lib/email.ts` | Resend via `fetch`, **env-gated** — no key ⇒ persist-only, no failure. |
| Weekly cron | `src/app/api/cron/weekly-parent-report/route.ts` | Fri 16:00 UTC (`vercel.json`). Loops consented links, generates, persists, emails. Idempotent per link+week. |
| On-demand preview | `src/app/api/parent-report/preview/route.ts` | Teacher JWT; generate/QA one report (optionally send). Testable without cron/email. |
| Teacher UI | `src/app/parents/page.tsx` (nav: **Parents**) | Per class: add guardian↔pupil links, capture consent (pending/consented/revoked), preview a report in a sandboxed iframe, send now (consented links only), and browse recent reports. |

## Data flow

```
guardian_student (consent=granted)
   │  class → classes.retrieval_class_ids[0] = retId
   ├─ taught_this_week  ←  taught_log (ov retId, taught_at≥weekStart) → lessons → units
   ├─ weak_objectives   ←  student_weak_topics(student_id)  [fallback → class_weak_topics(retId)]
   └─ generateParentReportHtml()  →  Anthropic (or template)
            │
            ├─ sendEmail() (Resend, if configured)
            └─ INSERT parent_reports  (HTML snapshot, emailed flag)
```

## Required before turning it on

1. **Run the migration** on the anchor (`20260620_parent_reports.sql`).
2. **Retrieval-side RPC `student_weak_topics(p_student_id uuid, p_limit int)`** — same
   shape/gating as `class_weak_topics`, in the retrieval-app repo. *Until it exists the
   report gracefully falls back to class-level weak topics, so this is non-blocking for a
   first pilot.*
3. **Env (Vercel):** `SUPABASE_SERVICE_ROLE_KEY`, `SK_API_KEY`, optionally
   `ANTHROPIC_API_KEY`, `RESEND_API_KEY` + `PARENT_REPORT_FROM`, `CRON_SECRET`.
4. **Consent + compliance (mandatory — see strategy §7):** only `consent_status =
   'granted'` links are ever sent; every email carries an unsubscribe link
   (`/parent/unsubscribe?t=<token>`, to be handled on retrieval-app). Confirm UK GDPR
   lawful basis + Age-Appropriate Design Code posture before sending to real parents.

## Try it

```bash
# Preview one report (no email) under a teacher session:
curl -sX POST https://<app>/api/parent-report/preview \
  -H "authorization: Bearer <TEACHER_JWT>" -H "content-type: application/json" \
  -d '{"studentName":"Alex Carter","classId":"<anchor_class_uuid>"}'

# Dry-run the weekly cron off-schedule (service-secret auth):
curl -s "https://<app>/api/cron/weekly-parent-report?force=1" \
  -H "authorization: Bearer $CRON_SECRET"
```

## Deliberately out of scope (next steps)

- **Parent portal + auth** (`/parent`) — reports are email-first for now; the portal
  (list children, latest report, deep-link to home practice) is the follow-up.
- **Bulk guardian import** (CSV / MIS) — the teacher UI adds links one at a time today.
- **`student_weak_topics`** itself lives in the retrieval-app repo.
