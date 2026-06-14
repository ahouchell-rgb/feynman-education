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
| Practice responses, marks, feedback | While account active, or current + 1 academic year *(confirm with school)* | Deleted or anonymised |
| Past-paper attempts/responses | As above | Deleted or anonymised |
| Teacher/staff accounts | While employed at the school using the service | Deleted on offboarding/termination |
| Marking-flag appeals | With the related response | Deleted with it |
| Support messages | 1 year from resolution | Deleted |
| Request/access logs (provider) | Per provider default *(typically ≤30 days; confirm)* | Auto-expired |
| Billing records | 6 years (UK tax law) | Deleted |

On **contract termination**, all Controller personal data is deleted within
**30 days** *(confirm period)* (per the DPA).

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

## Data-subject access / portability requests
Pupil/parent requests come **through the school** (the controller). School staff
can **export a pupil's full data as JSON** from Admin → expand pupil → *Export
data (GDPR · JSON)* (backed by the `export_student_data` RPC, restricted to a
moderator or the pupil's class teacher). On the school's instruction we erase the
relevant records and confirm completion.

## Backups
Deleted data may persist in backups until they rotate out (the Supabase backup /
point-in-time-recovery window — typically up to 7 days on the production plan;
*confirm your plan*). Backups are encrypted and access-controlled; a restore would
not reinstate data the school instructed us to erase beyond the backup window.

## Open engineering follow-ups
- [x] Pupil data **export** (DSAR / portability) — `export_student_data` RPC + Admin button (migration 09).
- [ ] Verify `delete_student` (the deployed `manage-student` edge function) fully cascades
      (responses, paper_attempts/paper_responses, marking_flags, parent_tokens, support_tickets,
      auth user). The function source lives only in Supabase — review it there, or add
      `on delete cascade` FKs as a migration so deletion is guaranteed at the DB layer.
- [ ] Add a **class deletion** + **whole-school offboarding** RPC/runbook (currently service-role tooling).
- [ ] Define and implement the end-of-year anonymisation job (e.g. current + 1 academic year).
