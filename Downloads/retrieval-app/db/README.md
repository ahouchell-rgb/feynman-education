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
| `20260614_02_grade_integrity_lockin.sql` | PENDING | Revokes client INSERT on `responses` so only the `mark-answer` edge function (service role) can record a grade. **Apply only after the new client is deployed.** |

After applying a migration, run the RLS regression suite to confirm the gates
hold:

```bash
psql "$DATABASE_URL" -f tests/rls_test.sql
```
