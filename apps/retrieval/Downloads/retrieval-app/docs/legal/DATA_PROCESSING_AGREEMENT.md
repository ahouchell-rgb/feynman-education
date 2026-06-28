# Data Processing Agreement (DPA) — Retrieval

> **DRAFT — not legal advice.** Schools will almost always require a signed DPA
> (often on their own template, e.g. the DfE / LGfL model) before purchasing.
> Have a solicitor review/adapt this, and expect to sign the school's version.
> **To complete:** registered legal entity name & address (clause heading), and
> confirm the retention period (clause 8) and backup plan (Annex A).

This Agreement is between **Feynman Education** *(insert registered legal entity &
address)* ("Processor") and the **school/customer** ("Controller") and forms part
of the service contract. It reflects UK GDPR Art. 28.

## 1. Roles
The Controller (school) determines the purposes and means of processing pupil
personal data. The Processor processes such data **only on the Controller's
documented instructions**, including the service contract and this DPA.

## 2. Subject matter & duration
Provision of the Retrieval science-practice service for the term of the contract.

## 3. Nature & purpose of processing
Storing pupil accounts and practice activity; AI marking of submitted answers;
generating teacher/HoD dashboards.

## 4. Types of personal data
Pupil and staff name, email, role, school; submitted answers; AI marks/feedback;
activity timestamps. **No special-category data is requested.**

## 5. Categories of data subjects
Pupils, teachers, heads of department, school administrators.

## 6. Processor obligations
The Processor shall: (a) process only on documented instructions; (b) ensure
personnel are bound by confidentiality; (c) implement appropriate technical and
organisational measures (Annex A); (d) respect the conditions for engaging
sub-processors (clause 7); (e) assist the Controller with data-subject requests
and DPIAs; (f) notify the Controller of a personal-data breach without undue
delay; (g) delete or return personal data at end of contract (clause 8); (h) make
available information needed to demonstrate compliance and allow audits.

## 7. Sub-processors
The Controller authorises the sub-processors listed in the Privacy Policy
(Supabase, Anthropic, Vercel). The Processor will inform the Controller of
intended changes and impose equivalent obligations on each sub-processor.

## 8. Return / deletion
On termination, the Processor will delete the Controller's personal data within
**30 days** *(confirm period)*, and delete or anonymise pupil records, unless
retention is required by law. Per-pupil, per-class and whole-school deletion is
available on request during the contract (see `DATA_RETENTION_AND_DELETION.md`).

## 9. International transfers
Any transfer outside the UK/EEA (Anthropic, Vercel — USA) is covered by the
**UK IDTA / EU SCCs** in each sub-processor's data-processing agreement.

## 10. Liability & governing law
As set out in the main contract. Governed by the laws of **England & Wales**.

---

## Annex A — Technical & organisational measures
- Row-Level Security isolating pupil/class/school data; per-school question-bank
  privacy.
- Encryption in transit (HTTPS); database hosted in the EU (London).
- Marks computed and written server-side (pupils cannot alter their own grades).
- Access to production restricted; least-privilege service credentials.
- Automated health monitoring of critical services.
- Daily database backups via Supabase, with point-in-time recovery available on
  the production plan *(confirm your Supabase plan's backup/PITR window)*.

## Annex B — Sub-processors
See the table in `PRIVACY_POLICY.md` §5.
