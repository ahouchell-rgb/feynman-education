# Owning the secondary-education infrastructure — product & GTM strategy

*A strategy and implementation plan for the Feynman Education ecosystem (Feynman / ScienceKit + retrieval-app.com + interactive-science.com). UK secondary science, expanding outward.*

---

## 0. TL;DR

You don't "take over" education infrastructure by selling one app. You become
infrastructure by **owning the data spine every other workflow depends on**, then
adding a *view* or an *action* on that spine for each buyer who will pay for it.

You already own the spine: **the per-pupil × per-objective mastery graph** (retrieval
data) sitting on top of **a sequenced curriculum** (units/SoW). Slides, feedforward,
parent reports, SLT dashboards and revision packs are all just views/actions on that
one graph. That is the moat. Everything below is about monetising the same graph three
times — to **teachers**, to **schools/MATs**, and to **parents** — and making it
expensive to leave.

**Recommended first three builds** (detail in §6):

1. **Weekly parent progress report** (auto, from the mastery graph) — cheapest to ship, opens the D2C wedge *and* manufactures school demand ("our parents already use this").
2. **Department/SLT analytics dashboard** — aggregates data you already compute (`class_weak_topics`, `unit_gaps`); first real B2B cheque.
3. **MIS sync (Wonde/Arbor/SIMS)** — the durable "system of record" hook; sequence it the moment a school deal is live.

---

## 1. The thesis: become the spine, then sell views of it

```
                         THE MASTERY GRAPH
              (pupil × objective × confidence × recency)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   TEACHER view          SCHOOL view            PARENT view
   plan / deliver /     cohort analytics /     home practice /
   feedforford          QLA / intervention     reports / revision
        │                     │                     │
   bottom-up PLG         top-down B2B           direct-to-consumer
   (low ACV, volume)     (high ACV, sticky)     (volume cash engine)
```

**Single source of truth = the mastery graph.** Every monetisable feature is a *view*
(a dashboard, a report) or an *action* (generate a sheet, set a quiz) on that graph.
Build features as views/actions, never as data silos — that is what keeps the spine
single and the moat compounding.

**The flywheel:**

> teacher runs retrieval → pupil mastery accrues → that one dataset powers
> feedforward (teacher value) **and** SLT dashboards (school value) **and** home
> practice + parent reports (parent value) → parents *and* SLT ask for a school-wide
> rollout → school buys → more teachers onboard → more data → better adaptivity and
> benchmarks → repeat.

Each buyer you add makes the product more valuable to the other two. That is the
difference between "an app schools use" and "the infrastructure schools run on."

---

## 2. Current product audit (the assets you already have)

| Layer | Product today | Where it lives |
|---|---|---|
| **Plan** | Curriculum/units/SoW, timetable (A/B cycle, holidays), "this week" home | Feynman (`curriculum`, `get_teaching_week`) |
| **Deliver** | Slide editor (text/shapes/tables/charts/KaTeX/video/embeds/timers), Present mode w/ Apple Pencil inking, PPTX & Google Slides / Drive / M365 import-export | Feynman (`SlideEditor`, `present`, `exportPptx`) |
| **Practice** | Retrieval / spaced practice; slides → questions generator | retrieval-app.com, `deck-to-questions` |
| **Diagnose** | Class weak topics, unit gaps, exam-paper upload gap-finder (multimodal) | `ClassWeakTopics`, `UnitGaps`, `PaperGaps` |
| **Close the loop** | AI feedforward sheets + auto half-term feedforward decks (cron) | `/api/feedforward`, `/api/cron/halfterm-feedforward` |
| **Content** | Interactive tools, embeddable widgets, revision booklets mapped to units | interactive-science.com, `resource_map` |
| **Plumbing** | Unified Supabase "anchor", per-teacher OAuth (Google/MS), RLS, token metering | `sk.tsx`, `*_tokens`, `daily_token_usage` |

**What this means:** you already have plan → deliver → practice → diagnose → reteach
as a single loop for *one teacher*. The strategy is to (a) sharpen that wedge, then
(b) lift the same data up to the **school** and out to the **parent**. Almost every
new product below reuses generation/aggregation you've already built.

**Three latent assets you're under-using:**

- **The mark-as-taught signal** → you know *exactly* what each class was taught and when. Nobody else (Seneca/GCSEPod/Sparx) is synced to the *actual class sequence*. That is the parent product's unfair advantage.
- **The gap → resource crosswalk** (`resource_map`) → you can auto-assemble a revision pack of *only* a pupil's weak objectives. "The revision guide that only contains what your child gets wrong."
- **The feedforward generator** → a generic "scaffold practice from weak objectives" engine. Re-aim it at a *pupil* (home pack) or a *cohort* (intervention pack) and it's a new SKU with near-zero new code.

---

## 3. The three buyers and how you sell to each

### 3a. Teachers — bottom-up, product-led (the wedge)
- **Motion:** free, viral, individual sign-up. A science teacher uses it because it saves them Sunday-night hours. No procurement.
- **Job:** keep planning + slides + retrieval **free and excellent** so adoption spreads inside a department by word of mouth.
- **Monetise:** Pro tier on the AI time-savers (feedforward, slides-assistant, lesson generation, marking). Low ACV, but every paying teacher is a warm lead *and a data source* inside a school.
- **Why it matters strategically:** teachers are your demand-generation engine. They pull you into the school.

### 3b. Schools / departments / MATs — top-down, B2B SaaS (the revenue + the moat)
- **Buyer:** Head of Science (department deal), then SLT / Trust (whole-school / MAT). UK science has a **recruitment & non-specialist crisis** — lean into "consistent quality regardless of who's in the room."
- **Job:** give SLT visibility and give the department consistency: cohort mastery heatmaps, question-level analysis (QLA), shared SoW, intervention lists, disadvantaged-gap tracking, cover/non-specialist delivery.
- **Motion:** land a department on data they can't get elsewhere → expand to whole-school → expand to the **MAT** (trusts buy centrally and want cross-school consistency + benchmarking).
- **Pricing:** per-pupil/year or per-department flat; DPA + data-processing in place; sell **Jan–April for September** (procurement cycle).
- **Why it matters:** this is where "infrastructure" actually happens — once you sync the MIS and become the QLA/intervention system of record, switching cost is enormous.

### 3c. Parents — direct-to-consumer (the cash engine + demand pull)
- **Buyer:** the parent of a Year 10/11 pupil, anxious about GCSEs, already paying for tutoring/Seneca Premium/GCSEPod.
- **Job:** "see what your child was taught this week, see exactly where they're weak, and give them 15 minutes of the *right* practice tonight." Synced to the real class — that's the wedge no competitor has.
- **Motion:** D2C subscription per child; *also* offer **school-sponsored** mode (school pays, free to parents) as a whole-school upsell and an engagement driver.
- **Why it matters:** parents are huge volume and they are the loudest demand signal into a school. "300 of our parents already pay for this" closes the SLT deal.

---

## 4. New product opportunities (ranked within each buyer)

Effort = rough build cost on your current stack (★ = small / reuses existing; ★★★ = new surface).

### Parent-facing (D2C engine)

1. **Weekly Parent Progress Report** — ★ · auto email/PDF per child: what was taught, mastery by topic, "3 questions to ask at dinner," 1 weak topic + a home-practice link. *Reuses the feedforward generator + mark-as-taught. Ship first.*
2. **Synced Home Practice ("Feynman Home")** — ★★ · the retrieval app for the child at home, **mapped to their actual class sequence and gaps** (not a generic question bank). The differentiator vs Seneca/Sparx.
3. **Personalised Revision Pack generator** — ★★ · printable/interactive booklet auto-built from a child's *real* weak objectives via `resource_map`. Sell per-pack or in the subscription. Peaks every exam season.
4. **Predicted-grade / target tracker** — ★★ · parent dashboard showing trajectory vs target grade and what would move it. High emotional willingness-to-pay near exams.

### School / MAT-facing (B2B moat)

5. **Department/SLT Analytics Dashboard** — ★★ · cohort mastery heatmaps across classes/teachers/year groups; "which objectives is Year 10 weakest on"; disadvantaged/PP gap. *Aggregates `class_weak_topics` + `unit_gaps` you already compute. Ship second.*
6. **Assessment & QLA layer** — ★★★ · shared/common assessments, mark capture, automatic question-level analysis, cross-class comparison. Schools pay real money for this today (it's currently spreadsheets).
7. **MAT/Department Curriculum Manager** — ★★ · collaborative SoW + central resourcing so "every teacher teaches from the same base" (your curriculum page already says this). Trust-wide curriculum consistency is a top-of-mind trust priority.
8. **Cover / Non-Specialist Mode** — ★★ · ready-to-teach deck + script + answers so a cover teacher or non-specialist can deliver the science lesson safely. Directly addresses the recruitment crisis → high willingness to pay.
9. **At-scale Intervention & Feedforward automation** — ★ · auto-generate intervention groupings + feedforward packs for *every* class in a department each half-term. The cron already does this per teacher — lift it to the school.
10. **MIS integration (Wonde / Arbor / SIMS / Bromcom)** — ★★★ · sync class lists & demographics in, write attainment back. This is the literal infrastructure hook and the deepest moat. Sequence once a school is signed.

### Teacher-facing (keep the wedge sharp)

11. **One-click Lesson/Unit generator** — ★★ · "generate the lesson for `b1_cells`" → full deck + retrieval set + feedforward in one pass. Chains `slides-assistant` + `deck-to-questions` + `feedforward`.
12. **Marking & feedback assistant** — ★★★ · photograph books → AI marks vs mark scheme → writes feedback → **feeds the mastery graph**. Extends the paper-upload path into closed-loop marking; this is also how you get mastery data without relying only on retrieval.
13. **Required-practical assistant** — ★ · risk assessments, equipment lists, method scaffolds. Recurring, science-specific pain; cheap to template.
14. **Cross-subject expansion** — ★★★ · the engine is subject-agnostic; only content/spec mapping is new. Maths → English → Humanities multiplies TAM once the science motion is proven.

---

## 5. Sequencing — the land-and-expand path to "infrastructure"

Each phase is chosen so the work done **pays for itself and pulls the next buyer in.**

- **Phase 0 — Sharpen & instrument (now).** Tighten the teacher loop; add the lesson/unit generator (#11) to widen the free wedge; make sure every retrieval/feedforward event writes clean mastery data. *Goal: more teachers, cleaner graph.*
- **Phase 1 — Parents (D2C wedge).** Weekly parent report (#1) → synced home practice (#2) → revision packs (#3). *Goal: D2C revenue + a parent base that becomes demand pressure on schools.*
- **Phase 2 — Department (first B2B cheque).** SLT/department dashboard (#5) + at-scale feedforward (#9). Land a Head of Science. *Goal: prove per-pupil ARPU and the "data you can't get elsewhere" pitch.*
- **Phase 3 — Whole school / system of record.** QLA layer (#6) + MIS sync (#10) + cover mode (#8) + safeguarding-grade data handling. *Goal: become the system schools run on, not just use.*
- **Phase 4 — MAT / Trust.** Curriculum manager (#7) + cross-school benchmarking. *Goal: central, multi-school contracts; consistency + benchmarking are the trust's language.*
- **Phase 5 — Adjacent subjects.** Re-skin the engine for Maths/English/Humanities. *Goal: 5–8× the TAM on a proven motion.*

---

## 6. Implementation plan for the first three builds

All three sit on the existing anchor (Supabase) + Next.js app + the Claude generation
pattern already used by `/api/feedforward`. Reuse, don't rebuild.

### Build 1 — Weekly Parent Progress Report  *(Phase 1, ship first)*

**Why first:** lowest effort (the generation + data already exist), opens D2C, and
manufactures school demand. Near-zero marginal cost per report.

**Data (anchor):**
- `students` (id, name, year_group, class links) — likely already implicit in retrieval; formalise.
- `guardians` (id, email, name) and `guardian_student` (guardian_id, student_id, consent flags, status). **Consent + age-appropriate-design is mandatory** (see §7).
- A read model `student_objective_mastery` (pupil × objective × pct_correct × last_seen) — materialised view aggregating retrieval responses. This is reused by Builds 2 & 3 too, so build it cleanly.

**Backend:**
- `/api/cron/weekly-parent-report` (Node runtime, `maxDuration`), mirroring `/api/cron/halfterm-feedforward`: for each consented guardian, pull the child's week (taught log) + top weak objectives, call Claude with a *parent-tone* prompt (plain language, encouraging, one weak topic + one action), render an HTML/PDF, email via Resend/Postmark, and log it.
- Reuse `resource_map` to attach a home-practice link per weak objective.

**Frontend:** a minimal parent portal (`/parent`, new auth role) — list of children, latest report, "practise now" deep-link into synced home retrieval. Can start as email-only (no portal) to ship in days.

**Monetisation:** free weekly summary; Pro unlocks home practice + revision packs (Build 3). Or school-sponsored (school pays per pupil → free to parents).

### Build 2 — Department / SLT Analytics Dashboard  *(Phase 2)*

**Why second:** first real B2B revenue, and it's mostly *aggregation of data you
already compute* (`class_weak_topics`, `unit_gaps`).

**Data/roles:** add `school_id` to `classes`/`profiles`; roles `teacher | hod | slt`.
RLS: an HOD/SLT can read aggregated mastery for classes in their school (aggregates
only — frame as *support*, never teacher surveillance; see §7).

**Backend RPCs (anchor):**
- `school_objective_heatmap(school_id, year_group, subject)` → objective × class → pct_correct.
- `school_intervention_list(school_id, year_group)` → pupils below threshold per objective (respecting PP/SEND flags for gap analysis).

**Frontend:** `/school` section gated by role — year-group heatmaps, gap drill-down,
exportable intervention lists, half-term trend. Reuse `ClassWeakTopics`/`UnitGaps`
rendering patterns aggregated one level up.

**Pricing:** per-pupil/year or per-department flat; needs a DPA + sub-processor list ready.

### Build 3 — MIS Sync (Wonde first)  *(Phase 3, the moat)*

**Why third:** heaviest and gated by a deal, but it's what turns "an app" into
"infrastructure." Once class lists + demographics flow from the MIS and attainment
flows back, you are the system of record.

**Approach:** integrate **Wonde** (single API over SIMS/Arbor/Bromcom) rather than each
MIS directly. New `mis_connections` + `mis_sync_log` tables; a nightly cron that
upserts schools/classes/students/guardian contacts and demographic flags (PP/SEND/EAL).
Write-back (predicted grades, assessment marks) is the second phase of this build and
the stickiest part.

**Compliance gate:** MIS data is the most sensitive in the stack — do §7 properly
*before* turning this on.

---

## 7. Risks & what you must get right

- **Data protection (non-negotiable for "infrastructure").** UK GDPR, the DfE data
  protection guidance, and the **Age-Appropriate Design Code** (under-18 users).
  Parent products need a lawful basis + **parental consent**; school products need a
  signed **DPA** with you as processor and a published sub-processor list (Supabase,
  Anthropic, email provider). Get this in place *before* Builds 1 and 3, not after.
- **Don't weaponise teacher analytics.** Frame SLT dashboards as *support and
  workload reduction*, surface cohorts/objectives, and avoid league-tabling individual
  teachers — or you'll lose the bottom-up teacher goodwill that feeds the whole funnel.
- **Procurement reality.** Schools buy on an annual cycle and trust word-of-mouth +
  pilots over cold sales. Run free department pilots in spring, convert for September.
- **Exam-board alignment.** Map objectives to AQA/Edexcel/OCR specs explicitly — parents
  and HoDs will not trust "weak topics" that don't line up with their exam board.
- **Content accuracy.** AI-generated practice must be science-correct; keep a teacher
  review step and a feedback/report loop on every generated artefact.
- **MIS gatekeeping & cost.** Wonde/MIS access has commercial terms and approval; start
  that conversation early as it's long-lead.

---

## 8. The moat — why this compounds into infrastructure

1. **Data network effects** — every pupil's practice improves adaptivity *and* the
   cross-school benchmarks you can sell back to MATs.
2. **Curriculum lock-in** — the SoW + `resource_map` crosswalk is bespoke setup a
   school won't redo elsewhere.
3. **Workflow lock-in** — plan, deliver, practise, mark, report and intervene in one
   place; pulling one thread unravels the teacher's whole week.
4. **Switching cost** — years of per-pupil mastery history that follows the child and
   is irreplaceable if they leave.
5. **Three-sided distribution** — teachers pull schools; parents pull schools; MATs
   pull their schools. You are recommended into procurement from three directions at once.

That combination — one data spine, three paying buyers, three distribution vectors,
and a per-pupil history that's painful to abandon — is what "owning the secondary
education infrastructure" actually looks like.

---

*See also: `docs/PHASE3_REPOINT.md` (the unification onto the single anchor that makes
the cross-buyer mastery graph possible).*
