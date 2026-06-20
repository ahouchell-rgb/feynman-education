# MAT / Trust Dashboard — implementation

Strategy Build 4. A trust (MAT) leader sees **every school in the trust benchmarked on
the same mastery graph** — average mastery, weakest objectives, and how each school sits
against the trust mean. No new data: it's Builds 2/3's graph one level higher.

## What shipped

| Piece | File |
|---|---|
| Schema (`trusts`, `schools.trust_id`, `profiles.trust_id` + `trust_role`, `trust_classes()` RPC) | `supabase/migrations/20260620_trusts_mat.sql` |
| Aggregation API (per-school rollup + trust-wide leaderboard) | `src/app/api/trust/overview/route.ts` |
| Dashboard | `src/app/trust/page.tsx` (nav: **Trust**, shown only for `trust_lead`) |

## How cross-school access works

Mirrors Build 2 exactly. Base tables stay owner-scoped; the single cross-org read is
`trust_classes()` — a `SECURITY DEFINER` RPC that returns class metadata **only** to a
`trust_lead` caller, scoped to schools whose `trust_id` matches theirs. The route then
aggregates each class's weak objectives with `class_weak_topics` (server-side, `SK_API_KEY`)
using a **bounded-concurrency pool** so a large trust doesn't fire hundreds of simultaneous
retrieval calls. Only non-personal per-objective aggregates roll up.

```
/api/trust/overview (caller JWT)
  ├─ gate: profiles.trust_role = trust_lead
  ├─ trust_classes()                      ← security-definer, trust-scoped
  ├─ per class: class_weak_topics(retId)  ← pooled, x-sciencekit-key
  └─ rollup → schools[] (avgMastery, weakest[]) + cohort[] (trust-wide) + trustAvg
```

## Enabling it (pilot)

Roles/links are assigned **out-of-band** (no self-serve), as in Build 2:

```sql
insert into public.trusts (name) values ('Example Multi-Academy Trust') returning id;
-- put schools under the trust
update public.schools set trust_id = '<trust-uuid>' where id in ('<school-a>','<school-b>');
-- make yourself the trust lead
update public.profiles set trust_id = '<trust-uuid>', trust_role = 'trust_lead' where id = '<your-uid>';
```

The **Trust** nav item then appears and `/trust` populates. `SK_API_KEY` must be set for
the mastery aggregation.

## Out of scope (next)

- **Precompute / caching.** The rollup fans out across every class on each load; at MAT
  scale this should move to a scheduled snapshot (a `trust_benchmark_snapshots` table) so
  the page is instant and trend-over-time becomes possible.
- **Year-group / discipline filters** on the trust view (the per-school dashboard already has them).
- **Curriculum consistency view** — which schools teach which SoW (the other half of the MAT pitch).
- **Per-trust MIS-token store** so each school's Wonde connection rolls up centrally (Build 3 is single-school env today).
