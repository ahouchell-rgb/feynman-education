# Data Retention & Deletion Policy — Retrieval

> **DRAFT — not legal advice.** Review with a solicitor and align the periods
> with each school's own retention schedule. `[BRACKETED]` items must be set.

## Principle
Hold personal data only as long as needed for the educational purpose, then
delete or anonymise it.

## Retention schedule
| Data | Retention | Then |
| --- | --- | --- |
| Pupil account (name, email) | While enrolled / account active | Deleted on leaving or on school/parent request |
| Practice responses, marks, feedback | While account active, or `[e.g. current + 1 academic year]` | Deleted or anonymised |
| Past-paper attempts/responses | As above | Deleted or anonymised |
| Teacher/staff accounts | While employed at the school using the service | Deleted on offboarding/termination |
| Marking-flag appeals | With the related response | Deleted with it |
| Request/access logs (provider) | Per provider default `[confirm]` | Auto-expired |
| Billing records | `[6 years per UK tax law]` | Deleted |

On **contract termination**, all Controller personal data is deleted within
**`[N]` days** (per the DPA).

## How deletion works (mechanism)
- **Delete a pupil:** the `manage-student` edge function supports
  `delete_student`, which removes the pupil's account and associated records
  (memberships, responses). Teachers/moderators trigger this from the
  Students/Admin panel. *(Engineering note: confirm it cascades to `responses`,
  `paper_attempts`/`paper_responses`, `marking_flags`, and Auth user — extend if
  any orphan rows remain.)*
- **Delete a class:** `[document the path / add one if missing]`.
- **Bulk / account deletion:** run on request via service-role tooling;
  `[document the script/runbook]`.

## Data-subject erasure requests
Pupil/parent requests come **through the school** (the controller). On the
school's instruction we erase the relevant records and confirm completion.

## Backups
Deleted data may persist in backups until they rotate out (`[retention window]`).
Backups are encrypted and access-controlled; a restore would not reinstate data
the school instructed us to erase beyond the backup window. See the ops runbook.

## Open engineering follow-ups
- [ ] Verify `delete_student` fully cascades (responses, paper_*, marking_flags, auth user).
- [ ] Add a documented **class deletion** + **whole-school offboarding** path.
- [ ] Define and implement the end-of-year anonymisation job (`[period]`).
