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
- **Delete a pupil:** the `manage-student` edge function `delete_student` action
  calls `auth.admin.deleteUser`, deleting the pupil's Auth account. Verified
  2026-06-14: the FK chain cascades from `auth.users` → `profiles` →
  `responses`, `paper_attempts`/`paper_responses`, `class_members`,
  `marking_flags`, `parent_tokens` (all `ON DELETE CASCADE`), so no pupil rows
  are left orphaned. Teachers/moderators trigger this from the Students/Admin panel.
- **Delete a class:** the `delete_class(uuid)` RPC (moderator or the class's
  teacher); every child FK to `classes` is `ON DELETE CASCADE`.
- **Whole-school offboarding:** the `offboard_school(uuid)` RPC (moderator)
  deletes the school and cascades its classes/responses/attempts. *(Known gap:
  it does NOT delete the teacher/pupil `auth.users` accounts for that school —
  per-pupil `delete_student` does, but a bulk per-school Auth purge is still to
  be added for complete offboarding.)*

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
- [x] **Class deletion** + **whole-school offboarding** RPCs — `delete_class` (moderator or the
      class's teacher) and `offboard_school` (moderator) (migration 11). All child FKs to
      `classes` are `on delete cascade`, so a class/school delete removes its responses,
      members, parent_tokens, paper attempts, marking flags, etc. automatically. `ai_usage`
      detaches (school_id → null), keeping cost history.
- [x] **Per-pupil auth-account cascade verified (2026-06-14):** `manage-student`'s `delete_student`
      deletes the Auth user and the whole FK chain cascades (profiles, responses, paper
      attempts/responses, memberships, marking flags, parent tokens). No orphan rows.
- [ ] **Bulk per-school Auth purge:** `offboard_school` deletes practice data but leaves the
      school's teacher/pupil `auth.users` + `profiles`. Add a service-role per-school account
      deletion for full offboarding (`classes.teacher_id` is `NO ACTION`, so teacher deletion
      also needs the classes removed first).
- [ ] **AuthZ fix (found 2026-06-14):** `manage-student` `delete_student` and `reset_password`
      only check the caller is a teacher, NOT that they teach the target pupil (no class-ownership
      check like `rename_student` has). Any teacher could delete or reset any pupil platform-wide.
      Add the ownership check before onboarding a 2nd school.
- [ ] Define and implement the end-of-year anonymisation job (e.g. current + 1 academic year).
