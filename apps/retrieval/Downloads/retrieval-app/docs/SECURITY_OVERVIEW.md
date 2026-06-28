# Security & Data Overview — Feynman Education (Retrieval)

> A one-page summary for school IT / data-protection leads. Pairs with the
> Privacy Policy, Data Processing Agreement and Data Retention policy in
> `docs/legal/`. Items marked *(confirm)* depend on your account/plan.

**What it is.** A science retrieval-practice web app: pupils answer short
questions, get instant AI-assisted marking, and teachers/leaders see progress
dashboards. The school is the **data controller**; we are the **processor**.

## Hosting & data residency
- **Database, authentication & storage:** Supabase (Postgres), region **London
  `eu-west-2` (UK)** — pupil data is held in the UK.
- **Application hosting / CDN:** Vercel (USA + global edge).
- **AI marking:** Anthropic Claude API (USA), used transiently to mark an answer.

## Data protection by design
- **Row-Level Security (RLS)** is enabled on every table. Pupils can read only
  their own data; teachers only their classes; HoDs their department; moderators
  the platform. Enforced in the database, not just the UI, and covered by an RLS
  regression test suite (`tests/rls_test.sql`).
- **Authoritative marking.** Grades are computed and written **server-side** by a
  trusted function; pupils cannot insert or alter their own marks (the direct
  client write path is revoked). The same applies to past-paper marks.
- **Least privilege.** Destructive and cross-tenant operations (account
  management, class/school deletion, publishing to the shared question bank) are
  gated to moderators/HoDs via SECURITY DEFINER functions or service-role tooling.
- **Encryption.** TLS/HTTPS in transit; encryption at rest via the cloud provider.

## Authentication
- Supabase Auth (email + password, minimum length enforced); self-service
  password reset; staff account provisioning by a school moderator.
- **Leaked-password protection** (HaveIBeenPwned) — *(enable in Auth settings)*.
- Single sign-on (Google / Microsoft) is on the roadmap.

## AI & sub-processors
| Sub-processor | Purpose | Location | Transfer safeguard |
| --- | --- | --- | --- |
| Supabase | Database, auth, storage | UK (London) | Within UK/EEA |
| Anthropic (Claude) | AI marking of answers | USA | UK IDTA / SCCs *(confirm)* |
| Vercel | Hosting / CDN | USA + edge | UK IDTA / SCCs *(confirm)* |

Answers sent for marking are processed transiently and, per Anthropic's
commercial API terms, are **not used to train** their models *(confirm at
signing)*. No pupil data is used for advertising or profiling.

## Data-subject rights
- **Export (DSAR / portability):** school staff can export a pupil's full data as
  JSON from the Admin panel.
- **Erasure:** per-pupil deletion (account + records), per-class deletion, and
  whole-school offboarding are available; child records cascade automatically.
- Retention periods and the contract end-of-term deletion window are in
  `DATA_RETENTION_AND_DELETION.md` (default 30 days on termination, *confirm*).

## Operations
- **Backups:** Supabase daily backups / point-in-time recovery *(confirm plan)*.
- **Monitoring & alerting:** an automated health check verifies AI marking and
  site availability (catches the "AI silently failing" mode); a public
  `/api/health` endpoint is available for external uptime monitors.
- **Vulnerability management:** dependency updates; database security advisors
  reviewed after schema changes.

## Incident response
On becoming aware of a personal-data breach we notify the affected school(s)
without undue delay and within **72 hours** where required.

## Children's data
Aligned with UK GDPR and DfE data-protection guidance for schools. Data is
minimised to what practice needs; pupils are not asked for special-category data.

---
**Still to confirm before sharing externally:** registered legal entity & ICO
registration number, named data-protection contact, Supabase backup/PITR plan,
and (optionally) an independent penetration test. **Contact:**
schools@feynmaneducation.com
