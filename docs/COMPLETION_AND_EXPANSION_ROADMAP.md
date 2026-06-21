# Completion & Expansion Roadmap — selling to all of education

*From "the thesis is built" to "a production system any part of the education market can buy." Companion to `docs/SECONDARY_ED_STRATEGY.md`.*

---

## 0. The gap

What exists today is a **proof of the thesis**, narrow on purpose: UK **secondary science**, single-tenant pilots, roles set up by hand or self-serve, AI features gated on keys, several retrieval-side RPCs still to ship, and no billing or formal compliance. To sell to *all* of education we move on **two axes at once**:

```
            BREADTH  (expand markets) →
            subjects · phases · buyers · countries
   DEPTH    ┌───────────────────────────────────────┐
   (make    │  COMPLETE                EXPAND        │
   it       │  production-harden  ×    new markets   │
   sellable)│  the spine               on the spine  │
   ↑        └───────────────────────────────────────┘
```

Rule that keeps it sane: **one engine, configured — not forked.** Everything new is a config of the mastery graph (a subject, a key stage, a spec, a locale, a buyer view), never a parallel codebase.

---

## 1. COMPLETE — production hardening (the "can we sell it at all" list)

These are the prerequisites; without them no serious buyer signs.

### 1a. Data & the retrieval dependencies
- Ship the retrieval-side RPCs the new features already call: `student_weak_topics`, `class_intervention_list` (per-pupil), and confirm `class_weak_topics` gating by role (drop the `x-sciencekit-key` secret path — Phase 5 of the unification).
- Move heavy aggregation (school/trust rollups, dashboards) to **materialised views / scheduled snapshots** so dashboards are instant at scale (the trust snapshot is the pattern; extend to school + cohort).
- A canonical **objective/standard model** (see §3) so "objective" means the same thing across subjects and exam boards.

### 1b. Identity, roles, tenancy
- **Parent accounts** (not just magic links): proper passwordless/OAuth auth, a parent who has multiple children across schools, double-opt-in consent.
- **Org hierarchy** as first-class: pupil → class → teacher → department → school → trust → (LA / group). One `org_id` tenancy column + RLS pattern reused everywhere; row-level + storage isolation tested.
- **Invites & SSO**: email invites, domain-verified joins, and **Google/Microsoft SSO + Wonde/Clever rostering** for schools (teachers won't manage another password).
- Audit log for every privileged action (role change, export, write-back).

### 1c. Billing & packaging (Stripe)
- Subscriptions + seats + per-pupil metering; free → pro for teachers; school/MAT quotes & invoicing (POs, not just cards); parent D2C subscriptions; trials, coupons, school-sponsored ("school pays, free to parents").
- **AI cost governance**: per-org budgets, model routing (cheap model for bulk, Opus for authoring), caching everywhere, usage dashboards. Margin protection is existential once AI scales.

### 1d. Compliance & trust — the real gatekeeper to schools
- UK GDPR + a signed **DPA** with a published sub-processor list; **DfE Data Protection** alignment; **ICO Age-Appropriate Design Code** for under-18s.
- **Cyber Essentials (+ Plus)**, ideally **ISO 27001** on the roadmap; pen test; vulnerability disclosure.
- **Safeguarding-aware** data handling; data retention & deletion (pupil leaves → data lifecycle).
- A **Trust Centre** page (security, privacy, DPAs, status) — buyers' procurement teams ask for this first.

### 1e. Accessibility & inclusion (also a sales requirement: public-sector WCAG duty)
- **WCAG 2.2 AA** across pupil/parent/teacher surfaces; keyboard, screen-reader, contrast, dyslexia-friendly options.
- Reading-age controls and **EAL translation** of pupil-facing material (huge in UK + international).
- SEND-aware scaffolding presets.

### 1f. Reliability & ops
- Error tracking + uptime + alerting; idempotent crons w/ dead-letter; rate limiting & abuse controls on every AI route; status page; backups + restore drills.

### 1g. Self-serve admin
- A school/MAT **admin console**: manage staff, classes, billing, integrations, exports, consent, retention — so onboarding doesn't need you in the loop.

---

## 2. EXPAND — all subjects (the biggest TAM multiplier)

The engine is subject-agnostic; only content + the science hard-coding are not.

- **De-science the codebase**: the `discipline` enum, biology/chemistry/physics colours, and science-specific copy become a **subject/strand config**. Introduce `subjects`, `strands`, and a generic **objective taxonomy** keyed to a subject + key stage + (optional) exam-board spec.
- **Per-subject content packs**: curriculum/SoW seeds, retrieval banks, and exemplar lessons for Maths → English → Humanities → MFL → Computing → the rest. Lead with **Maths and English** (largest departments, highest anxiety, biggest parent willingness-to-pay).
- **Subject-aware AI prompts** (a maths feedforward ≠ a science one): templated by subject so the generators (lesson, feedforward, cover, revision) work everywhere.
- Net effect: 1 science department → potentially 8–12 departments per school on the same contract.

---

## 3. EXPAND — all phases & specs

- **Primary (KS1/2)**: phonics, times-tables, reading fluency, and a much stronger **parent/home** product (primary parents are the most engaged D2C buyers). Simpler pupil UI, safeguarding-tighter.
- **Secondary (KS3/4)**: current core — deepen exam-board spec mapping (AQA/Edexcel/OCR/WJEC) so every objective ties to a spec point and QLA is automatic.
- **Post-16 / FE / Sixth form (KS5, A-level, BTEC, T-levels)**: bigger stakes, predicted-grades and UCAS context, college MIS (e.g. ProSolution/Compass) — and FE colleges buy centrally like MATs.
- **Spec/standards layer**: a mapping table (objective ↔ exam-board spec ↔ national curriculum) that makes the same graph re-skin for any phase or board, and powers QLA + predicted grades.

---

## 4. EXPAND — all buyers (the matrix) + GTM motions

| Buyer | Job to be done | Motion | Pricing |
|---|---|---|---|
| **Teacher** | Save Sunday hours | PLG, free→pro | Free / £/mo |
| **Department / HoD** | Consistency + data | Inside sales, pilot | Per-dept |
| **School / SLT** | Whole-school analytics, QA, MIS | Inside sales, procurement | Per-pupil/yr |
| **MAT / Trust** | Cross-school consistency + benchmarking | Enterprise | Multi-school |
| **Local Authority** | Area-wide standards, vulnerable pupils | Enterprise / framework | Area licence |
| **Independent schools** | Reporting + parent experience | Direct, high-touch | Premium |
| **Tutoring companies / tutors** | Diagnose gaps, assign practice | Seats / API | Per-seat |
| **Parents** | See progress, practise the right thing | D2C funnel | £/mo per child |
| **Pupils (direct)** | Revise smart, hit target grade | D2C / freemium | Freemium |
| **Exam boards / publishers** | Distribution + analytics | Partnership / licensing | Content/API deal |
| **International schools / ministries** | Localised curriculum + analytics | Enterprise / partner | Region licence |

**Enablers across all:** procurement pack (security, DPA, references, case studies), free spring pilots → September conversion, MIS-marketplace listings (Wonde/Arbor/Clever app stores) as a distribution channel, and a partner/reseller programme.

---

## 5. New product pillars to *complete* the suite

Each is a view/action on the same graph; together they make it a system schools run on, not a tool they use.

1. **Assessment & QLA engine** — author/share common assessments, capture marks (incl. photo/scan), auto question-level analysis vs the spec, mock-exam analysis, comparison across classes/schools. *Schools pay for this today as spreadsheets — high-value, sticky.*
2. **Marking & feedback (closed-loop)** — photograph books/exams → AI marks vs mark scheme → writes feedback → **feeds the mastery graph** (the other major data source besides retrieval; reduces dependence on it).
3. **Adaptive pupil pathway** — the home/independent practice engine: personalised next-best-questions from the graph, spaced repetition, target-grade tracking. The core of the D2C and pupil-direct products.
4. **Reporting suite** — auto school reports, parents'-evening sheets, governor/Ofsted-ready summaries, disadvantaged-gap reports.
5. **Curriculum authoring & marketplace** — collaborative SoW authoring + a **marketplace** to share/sell schemes, decks and assessment packs (network effects + a revenue line + lock-in).
6. **Tutoring bridge** — connect D2C parents to vetted tutors using the child's gap data (marketplace take-rate; also a retention tool).
7. **Insights/benchmarking-as-a-product** — anonymised, aggregated benchmarks sold to MATs/LAs/publishers (the data flywheel monetised directly).

---

## 6. International (later, but design for it now)

- i18n/l10n framework from the start of the subject work (don't retrofit).
- Pluggable curricula: US (Common Core / NGSS), IB, Cambridge IGCSE, Australia (ACARA), etc., via the same objective/spec layer.
- Data residency options (EU/UK/US) and per-region sub-processors for enterprise/ministry deals.

---

## 7. Monetization model (pricing matrix, directional)

- **Teacher** — Free (plan, basic retrieval, present) · **Pro** £6–10/mo (AI generators, unlimited).
- **School** — **£/pupil/yr** banded (e.g. £3–8) covering dashboards, QLA, MIS, cover mode, all subjects; whole-school discount.
- **MAT/LA** — multi-school per-pupil + central curriculum + benchmarking; enterprise terms.
- **Parent** — £4–8/mo per child, or **school-sponsored** (school pays a low per-pupil add-on → free to parents; drives engagement + the demand signal).
- **Tutors** — per-seat; **API** metered for tutoring companies.
- **Content licensing** — revenue-share with exam boards/publishers; marketplace take-rate.
- **Insights** — enterprise data/benchmark subscriptions.

The point: **the same mastery graph is billed to five+ buyers** — that's the leverage.

---

## 8. Phased roadmap

**NOW (0–3 months) — make the current pilot fully sellable to a UK secondary science school/MAT.**
1. Ship the retrieval RPCs + move dashboards to snapshots/materialised views.
2. Stripe billing (teacher Pro + per-pupil school) + AI budget governance.
3. Compliance v1: DPA, Trust Centre page, retention/deletion, Cyber Essentials, accessibility audit pass.
4. SSO + Wonde rostering for sign-in; admin console v1.
5. Assessment & QLA engine v1 (the highest-value missing school pillar).
*Outcome: a referenceable paid school/MAT + a clean procurement story.*

**NEXT (3–9 months) — multiply the market.**
6. De-science the engine → **Maths + English** content packs (subject config + AI prompts).
7. Exam-board spec mapping → automatic QLA + predicted grades.
8. Adaptive pupil pathway + the parent/pupil D2C funnel (school-sponsored option).
9. Marking & feedback (closed-loop) to widen the data source.
10. MIS-marketplace listings + partner programme.
*Outcome: multi-subject whole-school deals + a live D2C revenue line.*

**LATER (9–24 months) — all of education.**
11. Primary phase + post-16/FE; remaining subjects.
12. Curriculum marketplace + tutoring bridge + insights/benchmarking product.
13. LA/area deals; international curricula + data residency; ministry pilots.
*Outcome: a cross-phase, cross-subject, multi-buyer platform — infrastructure.*

---

## 9. Org & capabilities needed

To execute this you need (hire/partner): a **DPO / compliance** lead, a **schools sales** motion (inside sales + SE), **content/curriculum** authors per subject (or publisher partnerships), **data/ML** for adaptivity + QLA, **platform/SRE** for multi-tenant scale, and **support/customer-success** for schools. Content is the long pole — solve it with a marketplace + publisher deals, not all in-house.

---

## 10. Risks & moats at scale

- **Risks**: AI margin erosion (→ cost governance, caching, model routing); content accuracy/spec drift (→ teacher-in-the-loop + feedback loops + board partnerships); procurement/sales cycle length (→ PLG + pilots fund the wait); data-protection incident (→ compliance-first, not bolted on); platform sprawl (→ "one engine, configured").
- **Moats that compound**: the per-pupil mastery history (switching cost), curriculum + content network effects (marketplace), MIS system-of-record integration, three-sided distribution (teachers + parents + MATs pull you into procurement), and cross-school/-subject benchmarks no single school can produce.

---

## 11. Decisions for you (these change the sequence)

1. **Expansion priority** — which first: **more subjects** (Maths/English, deepest TAM) vs **more phases** (primary/FE) vs **more buyers** (tutors/LA/international)? *Recommendation: subjects first (biggest multiplier on existing schools), then D2C, then phases.*
2. **D2C posture** — pure parent-paid, or **school-sponsored** as the primary route (better data + distribution, lower friction)? *Recommendation: lead school-sponsored, keep parent-paid as upsell.*
3. **Content strategy** — build curriculum/banks in-house, partner with publishers/exam boards, or open a **marketplace**? *Recommendation: marketplace + 1–2 publisher partnerships; don't author everything.*
4. **Compliance ambition** — Cyber Essentials now and ISO 27001 later, or push for ISO early to unlock LA/MAT/enterprise sooner?
5. **Build vs buy** — assessment/QLA and marking are big; build, or integrate an existing engine first?

Tell me the answers (or just #1–#3) and I'll turn the **NOW** phase into a concrete, ticketed build plan and start executing it the way we did Builds 1–4.
