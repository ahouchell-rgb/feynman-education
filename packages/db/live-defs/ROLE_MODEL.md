# Live role model & RPC gates — captured from the anchor (2026-06-28)

Read-only capture from the live anchor (`uvzukwoxqhcxaxtzrziy`) via the Supabase management API,
to make the out-of-band authZ schema reviewable in source. Reference for Phase 5.

## Contract: ✅ 25/25 verified
All 25 RPCs in `../contracts/rpcs.mjs` exist on the anchor with **exact-matching identity
signatures**. `verify:live` would be green.

## Role model — the SLT/trust model already EXISTS
`public.profiles` columns: `role`, `school_id`, `hod_id`, `is_lead`, **`school_role`**, **`trust_id`**,
**`trust_role`**, plus stripe/subscription + `retrieval_*` fields.
- `role` (in use): `hod, moderator, student, teacher`.
- **`school_role`** ∈ `{ 'hod', 'slt' }` — school-leadership scope.
- **`trust_role`** = `'trust_lead'` (+ `trust_id`) — trust scope.
- `classes.school_id` exists (direct class→school link); tables `schools`, `trusts`,
  `trust_benchmark_snapshots` exist (`schools.trust_id` links school→trust).

So the data model the runbook assumed was missing is **present and in active use** — it was applied
out-of-band (hence absent from the repo migrations), which is what made it look net-new.

### Auth helper functions (verbatim, short)
```sql
is_moderator() := profiles.role = 'moderator'
is_hod()       := profiles.role = 'hod'
is_staff()     := profiles.role in ('teacher','moderator','hod')
is_admin()     := profiles.role in ('admin','moderator')
user_school_id() := select school_id from profiles where id = auth.uid()
user_teaches_class(c) := exists(select 1 from classes where id=c and teacher_id=auth.uid())
```
There is **no `is_slt()` / `user_trust_id()` helper** — but the columns exist; the school/trust RPCs
gate inline (below). Phase 5 should either add small helpers or inline the same predicate.

### Reference scope pattern — REUSE THIS (verbatim from the working dashboards)
`school_classes()` / `school_objective_mastery()` — **school (hod/slt) scope:**
```sql
select p.school_id, p.school_role into v_school, v_role from profiles p where p.id = auth.uid();
if v_school is null or v_role not in ('hod','slt') then return; end if;
... where tp.school_id = v_school          -- teacher's school = caller's school
```
`trust_classes()` — **trust scope:**
```sql
select p.trust_id, p.trust_role into v_trust, v_role from profiles p where p.id = auth.uid();
if v_trust is null or v_role <> 'trust_lead' then return; end if;
... join schools s on s.id = tp.school_id where s.trust_id = v_trust
```

## The current weak-topic gate (class_weak_topics & class_intervention_list — identical)
```sql
(  nullif(current_setting('request.headers', true)::json ->> 'x-sciencekit-key','')
       = (select value from private.app_config where key = 'sciencekit_key')   -- shared secret
   or public.is_moderator()
   or exists (select 1 from classes c where c.id=p_class_id and c.teacher_id=auth.uid())   -- class teacher
   or exists (select 1 from classes c join profiles tp on tp.id=c.teacher_id
              where c.id=p_class_id and tp.hod_id=auth.uid()) )                            -- teacher's hod_id
```

### The real Phase 5 gap (corrected)
The **model exists**, but these six interactive RPCs **don't use it** — their gate only knows
moderator / class-teacher / the teacher's `hod_id` pointer / the **shared secret**. They do **not**
check `school_role`/`trust_role`. So when school/overview or trust/overview call `class_weak_topics`
for a class the caller doesn't personally teach, the only thing that lets them through is the secret.
That's why dropping the secret breaks the school/trust dashboards — and the fix is simply to add the
**already-proven** `school_role`/`trust_role` branches to these RPCs (see `docs/PHASE5_DESIGN.md`).

### Two mechanics corrections
1. The secret is the `x-sciencekit-key` header vs `private.app_config.sciencekit_key` (DB-stored) —
   "drop the secret" = remove that OR-branch + rotate `app_config.sciencekit_key`.
2. The class-level gate's HoD check uses `profiles.hod_id` (teacher→hod pointer); the dashboards use
   `school_role in ('hod','slt')` + school match. Phase 5 should standardise on the latter.
