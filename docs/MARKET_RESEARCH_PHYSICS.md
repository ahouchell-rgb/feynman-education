# Physics Addendum: White Space for a Physics-Specialist Teacher-Builder

**Prepared:** June 2026
**Context:** Follow-up to `MARKET_RESEARCH.md`, refined for a **UK physics specialist** (science teacher, can code). Question: where is the defensible white space in **physics/science assessment & feedback** — not content — with a path to ≥ a few £k/month?
**Method:** Focused fact-checked sweep (105 research/verification agents, 23 sources, 64 claims extracted, 25 verified, **23 confirmed / 2 refuted**). Confidence and refuted claims flagged throughout.

> **Headline:** Don't build physics *content* — it's the single most saturated corner of the market (free, Cambridge/DfE-funded **Isaac Physics** + Physics & Maths Tutor + Seneca). Build physics **assessment & feedback**, sold **B2B into the physics-teacher shortage**. The shortage is severe, structural, and government-acknowledged — and it is the strongest willingness-to-pay driver in this whole report. The most defensible product is **AI marking of physics *calculations* with method/ECF marks** — a niche that incumbents demonstrably do *not* yet occupy, gated by a hard technical problem (mathematical-equivalence checking) that a physics specialist is well-placed to crack.

---

## 1. The killer wedge: the physics-teacher shortage (all HIGH confidence)

This is the best-evidenced finding in either report, corroborated across IOP, NAO, NFER and Sutton Trust:

| Stat | Figure | Source |
|---|---|---|
| GCSE physics lessons taught by a **non-specialist** | **~58%** | IOP / NFER analysis of School Workforce Census (2,296-school sample), Sept 2025 |
| English state schools with **no specialist physics teacher at all** | **~25%** (a quarter) | IOP, 2025 |
| GCSE physics students without a specialist teacher | **700,000+** (350,000+ in Year 11 alone), 2025–26 | IOP/NFER model |
| Independent corroboration | **25%** of physics teaching *hours* taught by non-specialists | Sutton Trust "Science Shortfall" (2020 data) |
| Physics ITT recruitment, 2024/25 | only **~31% of target** met — **the worst of any secondary subject** | NAO, Apr 2025 |
| Govt response | DfE **cut** the physics target by 20%+ (further ITT need cut ~43% for 2026–27) | Schools Week |

**Why this matters commercially:** a quarter of schools, and the majority of GCSE physics lessons, are run by teachers who didn't study physics past 18. They *cannot easily mark physics extended-response or multi-step calculations to mark-scheme standard* — that's a specialist skill. **A tool that supplies that expertise is valuable to a school precisely because they lack it in-house.** Your physics specialism is the product. And because DfE is *cutting* the target rather than solving the shortage, this demand is structural and persistent, not a fad.

⚠️ *Caveat:* the 58% / 700k figures are IOP/NFER **models** (advocacy-framed — IOP is seeking £120m investment), not raw DfE census counts. Directionally robust, but estimates.
⚠️ One sub-claim ("only 17% of physics target met, target 2,610") was **refuted** (1–2) — use the verified ~31% NAO figure instead.

---

## 2. Incumbent teardown — what's saturated vs what's open

### Content & question banks = SATURATED (avoid)
- **Isaac Physics** — free, founded 2013 by Cambridge Dept of Physics, originally DfE + philanthropy funded; **200M+ questions attempted**. The gold-standard free physics question platform. *(Scale/funding from Cambridge press; treat as context, not independently verified here.)* **This is why "physics content/questions" is a dead end.**
- **Physics & Maths Tutor, Save My Exams (~£4/mo), Seneca, CGP, Physics Online/FreeScienceLessons** — all cover physics content; mostly free or near-free.

### AI marking = PARTIALLY occupied — and physics is the open sub-niche (HIGH confidence)
| Product | What it marks | Physics calculation + method/ECF marks? |
|---|---|---|
| **Save My Exams "Smart Mark"** | Exam-board-specific AI marking across SME subjects incl. physics; instant mark-aligned feedback | **Essay-oriented; NO confirmation it marks multi-step calculations with method/units/ECF** |
| **Excelas "ExamGPT"** (founded 2023) | Handwritten GCSE STEM (Maths + Science), levels-of-response (L1/2/3) mapped to AOs, AQA/Edexcel/OCR/WJEC; claims >90% marking similarity | Partially occupies 6-marker/ECF — **but science skews Combined Science/biology, not deep physics** |
| **MarkMe** | Humanities essays only | **Explicitly EXCLUDES physics and maths** |

**Net (verified, 3–0):** *physics-specific calculation marking with method/ECF marks calibrated to mark schemes is the least-occupied AI-marking sub-niche.* That is your opening.

⚠️ *Caveat:* vendor accuracy claims (ExamGPT ">90%", Smart Mark "69% more accurate than ChatGPT") are **unaudited**. And the niche could narrow within ~12 months (MarkMe is reportedly adding subjects). Move with reasonable urgency.

---

## 3. The moat is a real, hard technical problem (HIGH confidence)

The reason generic LLM tools *can't* just eat this niche: **LLMs fail at recognising mathematical equivalence.**

- Peer-reviewed (UCL; *IOPscience Physics Education*, Feb 2025, doi 10.1088/1361-6552/adb92b) tested GPT-4/4o, Gemini 1.5 Pro, Claude 3.5 Sonnet on physics problems: AI-vs-human grading disagreements were *"usually caused by a lack of recognition for mathematics, both in instances where solutions are correct but in different equivalent forms or when solutions give the wrong mathematical expressions."*
- Method-mark and **error-carried-forward (ECF)** grading — the heart of physics marking — *requires* exactly this: recognising that `v = √(2as)` and `v = √(2×a×s)` and a numerically-equivalent answer are the same, and awarding method marks even when an earlier slip changed the final number.
- The fix is **not** prompting an LLM with the mark scheme — that specific claim was **REFUTED (0–3)**. The credible approach is **symbolic/CAS checking** (e.g. SymPy / term-rewriting, as in the "AlphaPhysics" work) layered with mark-scheme calibration.

**Translation:** a physics specialist who combines (a) a symbolic-equivalence engine, (b) real mark-scheme calibration, and (c) ECF logic has a genuine, defensible edge over any generic "AI marker." This is the rare EdTech moat that *isn't* just a wrapper.

---

## 4. Required practicals / CPAC / uncertainty — promising but UNPROVEN

Required practicals, practical-skills (CPAC) and uncertainty/error-analysis are ~15% of science marks, examined in writing, and widely disliked. This *looks* like the least-served niche — **but the verification pass found NO confirmed evidence of existing competitors *or* of genuine emptiness.** So treat it as a promising hypothesis to validate, not a proven gap. (Good news: if it *is* open, it's deep, specific, and you've taught all 12 practicals.)

---

## 5. Monetisation — proven B2B science price points (HIGH confidence)

| Benchmark | Price | Source |
|---|---|---|
| **Educake Science** (KS3+GCSE) | **£880/yr + VAT per subject per school** (English/Science/Maths £880 each; humanities £550) | Educake pricing |
| **Tassomai** | capped at **£5/student** (two core subjects, all of Y7–11); **max £15/student** for single year groups; MAT/PiXL discounts | Tassomai |

**What "a few £k/month" looks like:** roughly **4–12 paying departments** at £500–900/subject/yr, **or a couple of MAT deals**. That's a realistic, concrete target — not thousands of £4 consumer subscribers. Note the constraint: Tassomai/Educake **already hold core-science budget**, so you must win on *differentiation* (physics marking depth they don't have), not price.

---

## 6. Ranked product ideas for a physics specialist (fastest path first)

### #1 — Physics calculation marker with method marks + ECF (B2B → science departments) ⭐ TOP PICK
- **Gap:** No incumbent marks multi-step physics calculations with method/units/sig-figs/ECF. Smart Mark is essay-oriented; ExamGPT skews biology; MarkMe excludes physics; Isaac only checks final answers.
- **Customer:** science departments (esp. those staffed by non-specialists) and MATs.
- **Why incumbents miss it:** the mathematical-equivalence problem is genuinely hard; generic LLMs fail it.
- **Model:** £500–900/subject/yr B2B (undercut/differentiate vs Educake's £880). **~6–10 departments ≈ a few £k/month.**
- **Build:** Medium–high — symbolic engine (SymPy) + mark-scheme calibration + handwriting OCR (later). **Moat:** equivalence engine + your calibrated mark-scheme exemplars + physics specialism. **Risk:** OCR of handwritten working; trust ("AI-assisted, teacher-reviewed" framing); ~12-month window before the niche narrows.

### #2 — Physics 6-marker (extended-response) marking, calibrated per board
- **Gap:** ExamGPT does levels-of-response but skews biology/combined; physics "explain" chains (cause→effect, named laws) need a specialist.
- **Customer:** departments + students (B2C add-on). **Model:** bundle with #1, or £6.99/mo B2C. **Moat:** your physics mark-scheme calibration. **Risk:** partially contested by ExamGPT/Smart Mark — differentiate on *physics* depth.

### #3 — Required-practical / uncertainty & error-analysis trainer
- **Gap (unproven):** ~15% of marks, hated, possibly untooled. **Customer:** departments + students. **Build:** Medium. **Moat:** specificity + your practical experience. **Risk:** demand unvalidated — **test before building** (this is the big open question).

### #4 — "Marking co-pilot for the non-specialist physics teacher"
- **Gap:** the 58%/25% shortage directly — a tool that *explains the mark scheme* and models marking for a non-specialist covering physics. **Customer:** SLT/science leads buying for non-specialist staff (CPD + marking-time budget). **Model:** £500–900/dept/yr. **Moat:** pitched at the exact, government-acknowledged pain point. **Risk:** positioning/sales (sells to SLT, not the classroom teacher).

### #5 — Physics mock/past-paper auto-marking + question-level analysis (QLA) for departments
- **Gap:** departments hand-mark mocks; QLA is manual. **Customer:** departments/MATs. **Model:** per-subject SaaS. **Moat:** physics marking accuracy + ready-made QLA dashboards. **Risk:** overlaps generic assessment tools — win on physics marking quality. *(Note: this repo already has QLA/mastery scaffolding — closest fit to existing code.)*

---

## 7. Recommendation

Build **#1 (physics calculation marker with ECF)**, positioned via **#4's framing** (the non-specialist shortage), sold **B2B per department**. It (a) sits in the one AI-marking sub-niche incumbents demonstrably don't occupy, (b) is defended by a hard technical moat you're uniquely equipped to solve, (c) targets a severe, structural, government-acknowledged demand driver, and (d) fits the `sciencekit` repo's existing marking/mastery/QLA scaffolding.

**Validate first (the £-saving step):** the verification pass could NOT confirm whether Isaac/Tassomai/Educake/Sparx Science actually mark *calculations with method/ECF marks* or only final answers (open question #1). **Before building, confirm that gap is real** — 30 minutes on each product's demo — and pre-sell to 5–10 heads of science. If 5 say "take my money," build.

---

## Appendix A — Verified findings

| # | Finding | Confidence | Vote |
|---|---|---|---|
| 1 | ~58% GCSE physics lessons non-specialist; 25% schools none; 700k+ students affected | **High** | 3-0 |
| 2 | Physics worst-hit ITT subject (~31% of target); DfE cut target 20%+ | **High** | 3-0 |
| 3 | AI physics-calculation/ECF marking is the least-occupied sub-niche (SME/ExamGPT partial; MarkMe excludes physics) | **High** | 3-0 |
| 4 | Mathematical-equivalence recognition is the core technical moat (UCL/IOP peer-reviewed) | **High** | 3-0 |
| 5 | B2B science pricing: Educake £880/subject/yr; Tassomai £5–15/student → a few £k/mo = ~4–12 depts | **High** | 3-0 |

## Appendix B — REFUTED (do NOT rely on)

| Refuted claim | Vote |
|---|---|
| "Mark-scheme prompting makes blind LLM physics grading approach human level" | 0-3 ✗ |
| "Only 17% of physics recruitment target met (target 2,610)" | 1-2 ✗ |

## Appendix C — Caveats & open questions

- 58%/700k are IOP/NFER **models** (advocacy-framed), not raw census; directionally robust.
- Vendor accuracy claims (ExamGPT >90%, Smart Mark "69% more accurate") are **unaudited**.
- Many primary pages (IOP, NAO, Tassomai, SME, Excelas) returned HTTP 403; figures confirmed via search snippets + corroboration.
- **No** confirmed evidence on the required-practicals niche, or on whether Isaac/Tassomai/Educake/Sparx mark calculations with method/ECF — **these are the key things to validate before building.**
- Time-sensitive: the physics-marking gap could narrow within ~12 months (MarkMe adding subjects).

## Appendix D — Key sources

- IOP, *More than half a million GCSE students have no specialist physics teacher* (primary) — shortage stats
- IOP, *Physics teacher shortage and addressing it through the 3Rs* (primary)
- NAO, *Teacher workforce: secondary and FE* (Apr 2025, primary) — recruitment targets
- Sutton Trust, *Science Shortfall* (primary) — independent corroboration
- *IOPscience Physics Education* / arXiv 2411.13685 (primary) — LLM mathematical-equivalence failure
- Save My Exams Smart Mark; Excelas ExamGPT; MarkMe (primary/secondary) — AI-marking landscape
- Educake pricing; Tassomai schools packages (primary) — B2B price benchmarks
