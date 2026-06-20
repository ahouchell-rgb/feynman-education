# MIS Sync (Wonde) — implementation

Strategy Build 3, the "system of record" hook. Pulls roster + parent-contact data
from the school MIS (SIMS / Arbor / Bromcom) via [Wonde](https://wonde.com)'s single
API into **staging tables**, then lets staff reconcile it — first by importing parent
contacts as guardian links for the weekly parent report (Build 1), removing the manual
data entry on the Parents screen.

## What shipped

| Piece | File |
|---|---|
| Schema (`mis_connections`, `mis_students`, `mis_contacts`, `mis_sync_runs`) | `supabase/migrations/20260620_mis_sync.sql` |
| Sync engine (env-gated, paginated, service-role staging upserts) | `src/lib/wonde.ts` |
| Manual sync (SLT) | `src/app/api/mis/sync/route.ts` |
| Nightly cron | `src/app/api/cron/mis-sync/route.ts` (`vercel.json`, 03:00) |
| Status | `src/app/api/mis/status/route.ts` |
| Import contacts → guardians | `src/app/api/mis/import-guardians/route.ts` |
| Admin UI | `src/app/school/integrations/page.tsx` (`/school` → Integrations) |

## Design — staging-first, never auto-mutate live data

```
Wonde API ──(WONDE_TOKEN)──► fetchSchool()  normalise pupils + contacts
                                   │
                          upsert (service role)
                                   ▼
                 mis_students / mis_contacts  (school-scoped staging, RLS read)
                                   │
                       explicit, owner-authorised
                                   ▼
        import-guardians ► guardians + guardian_student (consent = pending)
                                   ▼
                         Parents screen → consent → weekly report
```

The sync **never** writes owner-scoped live tables. It mirrors the MIS into staging;
turning staged contacts into guardian links is a deliberate per-class action run by a
teacher under their own RLS ownership. The Wonde token lives in **env**, never the DB.

## Enabling it (pilot)

1. Request app approval for the school in the Wonde dashboard; get the token + school id.
2. Set `WONDE_TOKEN` and `WONDE_SCHOOL_ID` (+ `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`)
   in Vercel env. The **Integrations** screen activates.
3. As an `slt` user (see `docs/SLT_DASHBOARD.md`), open `/school/integrations` → **Sync now**.
4. Any teacher: pick a class → **Import guardians** → set consent on **Parents** → send.

## Attainment write-back (shipped — phase 2)

The stickier half of the moat: push grades FROM us back INTO the MIS marksheet, modelled
as a durable, retryable **queue**.

| Piece | File |
|---|---|
| Queue schema | `supabase/migrations/20260620_mis_writeback.sql` (`mis_writeback_queue`) |
| Engine (`enqueueWriteback`, `runWriteback`, `pushOne`) | `src/lib/wonde.ts` |
| Enqueue (SLT) | `/api/mis/writeback/enqueue` |
| Push now (SLT) | `/api/mis/writeback/run` |
| Worker cron | `/api/cron/mis-writeback` (`vercel.json`, 03:30) |
| UI | the **Attainment write-back** panel on `/school/integrations` (SLT) |

Flow: an SLT uploads a CSV of `student_mis_id,value` for an **aspect** (marksheet column)
→ rows are queued `pending` → the worker (cron or "Push pending to MIS") drains them via
Wonde, retrying up to 3× and recording `sent` / `error` per row. Decoupled from the
source on purpose — a predicted-grades CSV today; derived mastery or assessment marks
later, just enqueue with a different `source`.

**Provider-gated:** Wonde write-back is approval- and MIS-specific (not every MIS supports
it), so `pushOne` targets the write endpoint best-effort and records per-row errors rather
than failing the batch. **Confirm the exact endpoint/payload + that the school's MIS
supports write-back with Wonde before relying on it.**

## Known limitations / next steps

- **Year-group heuristic for import.** Contacts are matched to a class by its year group.
  Precise rostering via **MIS class membership** (a `mis_classes` mirror + class mapping)
  is the natural follow-up.
- **Email extraction is best-effort** — Wonde's contact-detail shape varies by MIS, so the
  full payload is kept in `raw` for reconciliation; verify against your pilot MIS.
- **Write-back endpoint is unverified** against a live MIS (no Wonde credentials here);
  confirm the endpoint/payload shape in `pushOne` with Wonde.
- **One school (pilot).** The connection + token model is per-school via env; multi-school
  / MAT needs a per-connection token store.
- Imported links have `student_id = null`, so reports fall back to class-level data until a
  pupil is matched to a retrieval pupil.
