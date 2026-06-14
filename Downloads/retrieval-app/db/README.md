# Database migrations

The schema lives in the Supabase project (`uvzukwoxqhcxaxtzrziy`). These files
record schema/security changes so they're reviewable and reproducible. Each file
header states whether it is **APPLIED** or **PENDING**.

Apply one with:

```bash
psql "$DATABASE_URL" -f db/migrations/<file>.sql
```

| File | Status | What it does |
| --- | --- | --- |
| `20260614_01_profiles_privilege_lockdown.sql` | APPLIED | Stops a pupil self-promoting to `moderator` (and then reading all PII) by revoking client UPDATE on privileged `profiles` columns. |
| `20260614_02_grade_integrity_lockin.sql` | APPLIED (2026-06-14) | Revokes client INSERT on `responses` so only the `mark-answer` edge function (service role) can record a grade. |
| `20260614_03_hod_resolve_marking_flags.sql` | APPLIED | Adds a HoD branch to `marking_flags_update`, and adds the missing `responses` UPDATE policy (teacher/HoD/moderator) — which also fixes "overturn" silently no-op'ing for everyone. |
| `20260614_04_paper_grade_integrity_lockin.sql` | PENDING | Past-paper equivalent of 02: revokes client write on `paper_responses` + `paper_attempts.awarded_marks` so only `mark-paper-answer` (service role) sets exam marks. **Apply after the paper client is deployed.** |
| `20260614_05_questions_mixed_visibility.sql` | APPLIED | Mixed content model: `questions.shared` flag; existing backfilled shared, new default private; `questions_select` scoped via `can_view_question()` (author + their pupils + HoD + moderator + shared). Closes the cross-school question-bank read leak. |
| `20260614_06_scope_classes_close_joincode_leak.sql` | APPLIED | Scopes `classes_select` (teacher/enrolled/HoD/mod) so join codes aren't world-readable; joining moves to the `join_class_by_code()` RPC; pupils can't self-insert class memberships. |

After applying a migration, run the RLS regression suite to confirm the gates
hold:

```bash
psql "$DATABASE_URL" -f tests/rls_test.sql
```
