# Privacy Policy — Retrieval (science practice app)

> **DRAFT — not legal advice.** This is a starting template. Have a qualified
> data-protection solicitor review it before publishing or relying on it,
> especially because the service processes **children's** personal data in the
> UK. `[BRACKETED]` items must be completed.

**Last updated:** `[DATE]` · **Data controller:** `[COMPANY/SOLE TRADER NAME]`,
`[ADDRESS]` · **Contact / DPO:** `[EMAIL]` · **ICO registration:** `[NUMBER]`

## 1. Who we are
Retrieval ("the app") is a science retrieval-practice tool used by schools.
Where a school decides how and why pupil data is used, **the school is the data
controller and we act as its data processor** (see the Data Processing
Agreement). For account/billing data of the teacher/school, we are the
controller.

## 2. What we collect
- **Account:** name, email, role (student / teacher / HoD / moderator), school.
- **Practice activity:** answers submitted, AI marks/feedback, timestamps,
  spaced-repetition scheduling, marking-flag appeals.
- **Technical:** standard request logs (IP, user-agent) via our hosting/Auth
  providers.
We do **not** intentionally collect special-category data; pupils should not be
asked to enter it.

## 3. Why (purpose & legal basis)
To provide retrieval practice, mark answers, and give teachers progress
dashboards. For school use the lawful basis is the **public task / legitimate
interests of the school**, established in the school's own privacy notice and our
DPA; we process only on the school's documented instructions.

## 4. Children's data
The app is used by school pupils. Schools are responsible for the appropriate
lawful basis and any parental information/consent under UK GDPR and the
DfE's data-protection guidance for schools. We minimise data to what's needed for
practice and never use pupil data for advertising or profiling beyond the
educational features described here.

## 5. Sub-processors
| Processor | Purpose | Location |
| --- | --- | --- |
| Supabase | Database, auth, file storage | EU (London, `eu-west-2`) |
| Anthropic (Claude API) | AI marking of answers | `[US/region per Anthropic terms]` |
| Vercel | Application hosting | `[region]` |
| Microsoft (ScienceKit only) | Optional sign-in / OneDrive export | per MS terms |
Answers sent for AI marking are processed transiently and are not used to train
third-party models per the providers' API terms — **confirm current terms**.

## 6. Retention & deletion
See `DATA_RETENTION_AND_DELETION.md`. In short: data is kept while the school's
account is active; a pupil or class can be deleted on request, which removes
their personal data. On account termination, data is deleted within `[N]` days.

## 7. Security
Row-Level Security isolates each pupil's, class's and school's data; transport is
encrypted (HTTPS); access to production is restricted. Marks are written
server-side and cannot be altered by pupils.

## 8. Your rights
Access, rectification, erasure, restriction, portability, and objection. For
pupil data, requests are normally made **through the school**; we will assist the
school as its processor. Contact: `[EMAIL]`.

## 9. International transfers
Where a sub-processor is outside the UK/EEA, transfers rely on `[UK IDTA / SCCs /
adequacy]` — confirm and list per provider.

## 10. Breaches
We will notify the affected school(s) without undue delay (and within `[72h]`
where required) on becoming aware of a personal-data breach.

## 11. Changes
We will post changes here and notify schools of material ones.
