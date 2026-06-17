# Phase 3 — teacher app repointed to the unified anchor

Branch `phase3-anchor-repoint`. This makes feynman-education talk to the **retrieval-app
anchor** (`uvzukwoxqhcxaxtzrziy`) as the single project, instead of its own
`uujbgdwnuspfnvfpdtvr` + cross-DB calls to retrieval.

## What changed in code (this branch)

- `src/lib/sk.tsx` — `SK_URL`/`SK_KEY` now point at the anchor; `RET_URL`/`RET_KEY` are
  aliases of them (retrieval *is* the anchor now). The `ret` helper (`fetchClasses`,
  `unitGaps`) now goes through the authenticated `sk` client (user JWT + RLS) instead of
  the retrieval anon key + `x-sciencekit-key` secret.
- `src/components/MarkTaughtModal.tsx`, `src/app/unit/[unitId]/lesson/[lessonId]/page.tsx`
  — their direct cross-DB `fetch`es to retrieval are now `sk.q(...)` / `sk.rpc(...)` against
  the anchor under the teacher's JWT. `set-recency` is called with the user's bearer (no secret).
- All `…uujbgdwnuspfnvfpdtvr…` URLs + the old anon key swapped to the anchor across `src/`
  (incl. the server routes: feedforward, chat-with-lesson, feedforward-deck, microsoft/*, cron).

`next build` passes. **Not deployed** — this branch must ship *together with* the DB cutover
and the steps below, or it will break (the anchor doesn't have the teacher data / re-gated
RPCs until then).

## Must land WITH this deploy (Phase 5 / dashboards)

1. **DB cutover** — run the unification migration on the anchor (retrieval-app
   `db/unification/`), so the teacher tables + data + merged `profiles`/`classes` exist there.
2. **Re-gate the cross-DB RPCs by role** (drop the `x-sciencekit-key` gate): `class_unit_gaps`
   (now called with the teacher JWT via `sk.rpc`), and for the cron `class_weak_topics` /
   `topic_preview_questions`. Replace the secret check with an authenticated teacher/moderator
   (+ class-ownership) check, or keep the secret only for the service-role cron path.
3. **Re-gate the `set-recency` edge function** to accept the teacher JWT (role/ownership)
   instead of `x-sciencekit-key`.
4. **Microsoft OAuth on the anchor** — enable the Azure Entra provider in the anchor's
   Supabase Auth, and add the anchor's callback URL to the Azure app registration. Teachers
   now authenticate against the anchor's GoTrue.
5. **Vercel env (feynman-education project):** set `SUPABASE_SERVICE_ROLE_KEY` to the
   **anchor's** service-role key; if `NEXT_PUBLIC_SK_URL`/`NEXT_PUBLIC_SK_KEY` are set, point
   them at the anchor; keep `SK_API_KEY` only while the cron still uses the secret.
6. **Your anchor login** — confirm `ahouchell@gmail.com` can sign in to the anchor
   (`cef87533…`, moderator) via password and/or MS OAuth.

## Smoke test after deploy

Login → classes list (Manage/Setup) → open a lesson → Mark-as-taught → retrieval queue
updates (set-recency) → Unit Gaps shows weak topics → feedforward cron runs.
