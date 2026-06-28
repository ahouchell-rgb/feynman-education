# Privacy Policy — Houchell Education (Retrieval science-practice app)

> **DRAFT — not legal advice.** This template has been filled in as far as the
> product/engineering facts allow. Before publishing or relying on it, have a
> qualified data-protection solicitor review it — the service processes
> **children's** personal data in the UK. The few remaining items only you can
> supply are listed under **"To complete before publishing"** below.

**To complete before publishing (only you/your solicitor can provide these):**
- Registered legal entity name & type (sole trader / Ltd) and registered address.
- ICO registration (data-protection fee) number.
- Named DPO / data-protection contact (a role inbox is acceptable for a small org).
- Confirm current sub-processor terms & data-transfer mechanism (see §5/§9).
- Confirm the contract retention period in §6 (default proposed: 30 days).

---

**Last updated:** 14 June 2026 · **Data controller (for our own account/billing
data):** Houchell Education *(insert registered legal entity & address)* ·
**Contact / data-protection queries:** schools@houchelleducation.com ·
**ICO registration:** *(insert number)*

## 1. Who we are
Houchell Education ("we", "the app") provides a science retrieval-practice tool
used by schools. Where a school decides how and why pupil data is used, **the
school is the data controller and we act as its data processor** (see the Data
Processing Agreement). For account/billing data of the teacher/school, we are the
controller.

## 2. What we collect
- **Account:** name, email, role (student / teacher / HoD / moderator), school.
- **Practice activity:** answers submitted, AI marks/feedback, timestamps,
  spaced-repetition scheduling, marking-flag appeals.
- **Support:** messages you send us via the in-app "Help & support" form.
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
| Processor | Purpose | Location | Transfer safeguard |
| --- | --- | --- | --- |
| Supabase | Database, authentication, file storage | UK/EU — London (`eu-west-2`) | Within UK/EEA |
| Anthropic (Claude API) | AI marking of submitted answers | USA | UK IDTA / SCCs *(confirm on current Anthropic DPA)* |
| Vercel | Application hosting / CDN | USA + global edge | UK IDTA / SCCs *(confirm on current Vercel DPA)* |

Answers sent for AI marking are processed transiently to return a mark and
feedback. Per Anthropic's commercial API terms, API inputs/outputs are **not used
to train** their models — **confirm this remains current at signing**. Parent
progress reports are served **inside this application** via a revocable link; no
separate third-party "parent hub" is used.

## 6. Retention & deletion
See `DATA_RETENTION_AND_DELETION.md`. In short: data is kept while the school's
account is active; a pupil, class or whole school can be deleted on request, which
removes the associated personal data. On contract termination, Controller personal
data is deleted within **30 days** *(confirm period)*.

## 7. Security
Row-Level Security isolates each pupil's, class's and school's data; transport is
encrypted (HTTPS); access to production is restricted. Marks are written
server-side and cannot be altered by pupils.

## 8. Your rights
Access, rectification, erasure, restriction, portability, and objection. For
pupil data, requests are normally made **through the school**; we will assist the
school as its processor (a per-pupil data export is available to school staff in
the app). Contact: schools@houchelleducation.com.

## 9. International transfers
Supabase data is held in the UK/EEA (London). Where a sub-processor is outside
the UK/EEA (Anthropic, Vercel — both USA), transfers rely on the **UK IDTA / EU
SCCs** in each provider's data-processing agreement — confirm and keep the
current versions on file.

## 10. Breaches
We will notify the affected school(s) without undue delay (and within **72 hours**
where required) on becoming aware of a personal-data breach.

## 11. Changes
We will post changes here and notify schools of material ones.
