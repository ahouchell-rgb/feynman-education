# Phase 3 — One Identity + One Database (migration runbook)

Collapses the **Houchell/ScienceKit teacher** project (`uujbgdwnuspfnvfpdtvr`) and the
**pulse-student-hub** project (`kdtdunjbrwucjsnggmkl`) into the **retrieval-app** anchor
(`uvzukwoxqhcxaxtzrziy`), with one shared Supabase Auth pool. Approved plan:
`~/.claude/plans/synchronous-tickling-crystal.md`.

> **Status: REHEARSED on a throwaway branch 2026-06-17 (logic + DDL validated on synthetic data); PENDING the gated live cutover. Nothing here has been applied to a live app DB.**

## Rehearsal result (2026-06-17)

Ran the full reconcile against a Supabase branch with the teacher schema reconstructed into
`feynman` (via the catalog) + a synthetic fixture. All checks green: enum moves, profile merge
(1 row, not duplicated), class import honouring the `key_stage`/`tier` checks (KS4⇒`Higher`),
identity remap, table moves, FK repoints, crosswalk FKs, 0 orphans, 0 schema leaks, empty
`feynman` afterward. Three bugs were caught and fixed in this kit:
1. **Enum list incomplete** — there are **five** teacher enums (`discipline, key_stage, term, paper_number, resource_type`); the kit moved four and misnamed `paper`→`paper_number`. Fixed in `10_reconcile.sql` step 1.
2. **Identity remap** — added as `10_reconcile.sql` step 0 (the `pg_dump` path does it via sed; the MCP path needs the explicit `UPDATE`s).
3. **Verify leak-scan** crashed on aggregate functions — fixed with `prokind='f'` in `20_verify.sql`.

**Notes for the live cutover:**
- The anchor's 64 registered migrations **don't cleanly replay on a fresh branch** (`MIGRATIONS_FAILED`; `topic_map`/`topic_resources` didn't land) — so don't rely on branch-from-migrations for a data-faithful rehearsal. The live cutover runs against the real anchor, which already has the full schema + data, so this doesn't block it.
- **Auth FKs:** in the `pg_dump` path the moved teacher tables keep their `→auth.users` FKs and the sed remap makes the data valid at load. In the **MCP-driven** path (staging built from the catalog without the `→auth.users` FKs), re-add those FKs after the remap+move if you want them enforced in the unified anchor.

## Phase 0 — verified facts (2026-06-17)

| Fact | Value |
| --- | --- |
| Anchor auth users | 22 (mostly pupils) · 6 classes · 2,955 responses · 17 memberships |
| Teacher project | **no pupil rows** — curriculum (47 units, lessons, decks, `resource_map`60) + your own classes |
| Teacher auth users | 1 — you: `ab56a97d-b326-434b-bd0f-1a894fb15819` (role `admin`, ahouchell@gmail.com) |
| Your anchor identity | `cef87533-7ff1-4f93-bfcf-22feb66f896a` (role `moderator`, same email) → **remap target** |
| Other anchor teachers | `7448784b…` (DSA), `4bf156a4…` (MFR) — retrieval-only, not in Houchell |
| pulse-student-hub | empty data; defer (Phase 6 / later milestone) |

**Class linkage reality:** the teacher app's 6 *active* classes (7H,7J,8H,8J,9H,9J) have
**empty** `retrieval_class_ids[]`; only the 10 *archived* legacy classes link (by exact name)
to 5 of the 6 anchor classes. So no live cross-link exists today — imported teacher classes
keep their own UUIDs (distinct from anchor UUIDs → **no remap of the 2,955 responses**).

**Only two tables collide:** `classes` and `profiles`. Everything else (units, lessons,
groups, resources, decks, timetable, taught_log, lesson_*, resource_map, feedforward_*,
microsoft_tokens, …) co-locates cleanly.

## Anchor constraints the port must honour (verified)

- `classes.teacher_id` → **`profiles(id)`** (not `auth.users`). Imported rows must use `cef87533`.
- `classes.key_stage` CHECK ∈ `('KS3','KS4')` — teacher uses lowercase enum → **uppercase on import**.
- `classes` composite CHECK: `KS3 ⇒ tier IS NULL`, `KS4 ⇒ tier ∈ ('Foundation','Higher')` (teacher `tier='none'` → map: KS3→NULL, KS4→`Higher` unless you say otherwise).
- `classes.join_code` is UNIQUE — generate one per imported class.
- Moved teacher tables carry `teacher_id/owner = ab56a97d` with FKs → `auth.users`; `ab56a97d`
  is **not** an anchor auth user, so load with FK checks deferred, then remap to `cef87533`.

## Prerequisites (what's needed to run Phase 3)

1. **Direct DB connection strings** (postgres role) for the **teacher** and **target** DBs —
   needed for `pg_dump`/`psql` (the MCP's limited role can't bulk-port or defer FK checks).
   Get them from Supabase → Project → Settings → Database → Connection string (URI).
2. **A throwaway branch** of the anchor for rehearsal. Cost: **$0.0134/hr** (~$0.32/day) while it lives.
   `SUPABASE_ACCESS_TOKEN` + `supabase branches create`, or the dashboard.

## Quick start (run on a machine with the Postgres client + DB egress)

> The Claude sandbox can't run this: it has no `psql`/`pg_dump` and no network route to the
> Supabase DB port (only the HTTPS MCP). Run it locally.

```bash
brew install libpq && brew link --force libpq        # if psql/pg_dump aren't installed
# create db/unification/.env.migrate.local (gitignored via .env*.local) with TEACHER= and TARGET=
cd ~/Downloads/retrieval-app/db/unification && ./run.sh   # TARGET must be a BRANCH, not prod
```

`run.sh` does the three steps below in order. Paste the verify output back to Claude if anything's off.

## Run order (what run.sh does — also the gated prod cutover sequence)

```bash
TEACHER="postgresql://postgres:…@db.uujbgdwnuspfnvfpdtvr.supabase.co:5432/postgres"
TARGET="postgresql://postgres:…@<branch-or-anchor-db>:5432/postgres"

# 0. Snapshot both DBs first (cutover only; the branch is itself disposable).
pg_dump "$TEACHER" -Fc -f teacher_$(date +%F).dump
pg_dump "$TARGET"  -Fc -f target_$(date +%F).dump   # anchor only, at cutover

# 1. Load the teacher schema + data into a staging schema `feynman` on the target.
#    sed #1: move every object from public.* → feynman.* (avoids the classes/profiles clash).
#    sed #2: un-qualify extension/builtin calls that sed #1 over-rewrote.
#    sed #3: remap your single teacher identity ab56a97d → cef87533 (a UUID is globally
#            unique, so the literal replace safely fixes teacher_id/owner everywhere) so
#            every FK → auth.users resolves to your existing anchor user at load time.
pg_dump "$TEACHER" --schema=public --no-owner --no-privileges -Fp \
  | sed -E 's/\bpublic\./feynman./g' \
  | sed -E 's/feynman\.(gen_random_uuid|uuid_generate_v4)/\1/g' \
  | sed 's/ab56a97d-b326-434b-bd0f-1a894fb15819/cef87533-7ff1-4f93-bfcf-22feb66f896a/g' \
  | sed '1i CREATE SCHEMA IF NOT EXISTS feynman;' \
  > /tmp/feynman_graft.sql
psql "$TARGET" -v ON_ERROR_STOP=1 -f /tmp/feynman_graft.sql
#    VERIFY on the branch that no public.* extension call slipped through (see 20_verify.sql).

# 2. Reconcile: remap identity, merge profiles, import classes, move tables, add FKs, assert.
psql "$TARGET" -v ON_ERROR_STOP=1 -f 10_reconcile.sql

# 3. Verify (row counts, FK integrity, RLS smoke).
psql "$TARGET" -v ON_ERROR_STOP=1 -f 20_verify.sql
```

Then point local builds of the teacher app + pulse at `$TARGET` and exercise every cross-app
path (see plan's Verification). Iterate on `10_reconcile.sql` until `20_verify.sql` is clean.

## After a clean rehearsal — app changes (Phase 4, separate)

- **feynman-education** `src/lib/sk.tsx`: repoint URL/anon key to the anchor; delete the `ret.*`
  cross-DB RPC helper + `SK_API_KEY` (queries become same-DB); MS-OAuth callback against the anchor.
- **retrieval-app**: drop the `x-sciencekit-key` gate from `class_unit_gaps`/`class_weak_topics`
  (replace with `role`-based RLS); add the `set_recency` edge fn natively (or keep, ungated).
- **pulse-hub** `vercel.json`: repoint to the anchor; implement `retrieval-sync` as same-DB views.

## Gated steps (separate go/no-go, NOT in this pass)

- **Phase 5 cutover:** run the same scripts against the live anchor in a low-traffic window;
  flip app env vars; enable MS OAuth on the anchor. Keep teacher+pulse projects **read-only** as rollback.
- **Phase 6 cleanup:** decommission teacher+pulse + inactive `ecgtlrluooiaeltmdgsc`; consolidate
  `topic_resources` (topic grain) with `resource_map` (unit grain); remove `retrieval_class_ids[]`.

## Rollback

The branch is disposable. At cutover, old projects stay read-only; if anything fails, flip app
env vars back. No destructive deletes until Phase 6 after a cooling-off period.
