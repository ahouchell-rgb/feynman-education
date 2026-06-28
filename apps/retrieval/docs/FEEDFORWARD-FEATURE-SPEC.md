# Feature spec — Upload-docx → Feedforward generator (in the exam/paper tool)

> Status: design approved for build. Verified against retrieval-app + feynman code and the `feedforward`/`docx` Skills.

## 1. Goal

In the exam/paper function, a teacher can:
1. **Upload a `.docx` exam paper** (currently the bucket rejects docx).
2. Open it and **tag the questions pupils struggled with** (tick parsed questions, or free-type "Q3, Q7, the 6-marker" + misconception notes).
3. **Generate a feedforward Word document** in the agreed **bordered-box HGO style** (per the `feedforward` Skill).
4. Have that `.docx` **saved and sitting in the app**, downloadable and tied to the paper.

## 2. Key finding: ~70% already exists, but in the wrong app and format

feynman's `src/app/api/feedforward/route.ts` + `FeedforwardFromPaper.tsx` **already** upload to the
`paper-uploads` bucket and run a paper-feedforward Claude call. But it:
- outputs **HTML, not a `.docx`** (the Skill mandates a real Word doc with `cantSplit` bordered boxes),
- accepts **images/PDF, not docx**,
- lives in the **authoring app**, not the exam tool.

So this is a **port + format upgrade + relocation**, not a build from scratch. A topic-level
paper→feedforward path also already ships in feynman (`PaperGaps.tsx`, HTML-only).

## 3. Current state (retrieval-app)

- `paper-uploads` bucket (`db/migrations/20260618_10`) allows `image/*` + `pdf` only — **rejects docx**.
- `PaperEditor.js` is the host (loads `paperId`, `questions`, `classes`, `topics`). Pills at `:133-136`.
- Edge templates to reuse: `mark-paper-answer/index.ts` (JWT `getAuthedUid`, cost backstop
  `resolveSchoolId`/`overBackstop` `:37-87`, `ai_usage` logging `:94-106`) and `generate-questions/index.ts`
  (staff role gate `:45-54`, JSON parse `:96-107`).
- `class_paper_gaps.sql` (`20260618_09`) has the teacher/HoD/moderator identity-gate pattern to reuse for RLS.
- `supabase.js` lacks a generic storage-upload helper and a generic edge caller (`callMarkAnswer:171-178` is hardcoded).
- **Nothing makes a real docx today.** Deps are only `next`/`react`/`react-dom`; one route `api/health`.

## 4. Architecture

**One new server function** that: staff JWT + role gate → verify paper ownership
(`papers.teacher_id = uid`, or moderator/HoD) → optionally parse the docx → call Sonnet for structured
JSON → build a Word doc with `docx-js` per the Skill helpers → upload to `paper-uploads` (service role)
→ insert a `paper_feedforward_sheets` row → log `ai_usage`. Client gets a signed/download URL.

**Runtime decision (the day-1 de-risk):** the Skill's `docx`/`mammoth` libs are Node-oriented.
- **Option A — Supabase edge function** (`supabase/functions/paper-feedforward/index.ts`): matches the
  "all AI in edge functions" convention; risk = `docx`/`mammoth` may not bundle under Supabase Deno, and
  Sonnet + docx build can exceed the ~25s edge wall.
- **Option B — Next.js Node API route** in retrieval-app (`src/app/api/paper-feedforward/route.js`,
  `runtime: "nodejs"`, `maxDuration: 60`): **proven** — feynman already moved this exact path to a Vercel
  Node route for the same reason. Keeps the API key server-side just as well.
- **Recommendation:** spike Option A on day 1; if `docx` doesn't bundle clean under Deno, ship Option B.
  Given feynman's precedent, Option B is the safe default.

**Client:** a collapsible "Feedforward" section in `PaperEditor.js` + `uploadToBucket` and `callEdge`
helpers in `supabase.js`.

## 5. docx parsing — phased

- **Tier A (MVP, no parsing):** docx stored as an attachment; teacher types struggled questions +
  misconceptions as free text (as `FeedforwardFromPaper.tsx:121` already does). Defensible because the
  Skill scaffolds from the *misconception* and references the question by *number* (`SKILL.md:79`) — it
  does not reprint the question, so question numbers + misconceptions matter more than parsed text.
- **Tier B:** parse via `mammoth` → text, ask Haiku to split into numbered questions + mark tariffs as
  JSON (reuse `generate-questions:96-107`), show a checkbox list, optionally seed `paper_questions`
  (draft-only, never auto-written without teacher confirmation). Keep feynman's images/PDF multimodal
  mode as a bonus input. **Do not hand-roll OOXML.**

## 6. Feedforward generation (the agreed style)

Port the prompt from feynman `route.ts` `buildPaperPrompt` (`:75-91`): one bordered box per struggled
question with a "Remember" line, two FRESH parallel exam-style questions with mark tariffs + command
words, and a faint mark-scheme line. **Change vs feynman:** ask Claude for **structured JSON** (boxes
with heading, scaffold sub-questions, parallel practice, stretch, placeholders) and build the docx
**deterministically** with `docx-js` per the `feedforward` SKILL.md helpers verbatim:
- `sectionBox` with `cantSplit: true` (keeps a box on one page),
- `boxHeading` 12pt bold,
- per-box question numbering that restarts each box,
- `diagramPlaceholder` (italic grey — the Skill mandates placeholders, never redrawn diagrams),
- A4 / Arial 11pt.

Model: **Sonnet** for generation (~4096 tokens), **Haiku** for Tier-B extraction.

## 7. Data model

**New table `paper_feedforward_sheets`:**
`id` · `paper_id → papers(id) on delete cascade` · `teacher_id default auth.uid()` · `class_id` (null) ·
`source_upload_path` · `struggled_input jsonb` · `docx_path not null` · `title` · `created_at`.

**RLS:** `teacher_id = auth.uid()` OR `is_moderator()` OR paper-teacher HoD (per `class_paper_gaps` `20260618_09`).

**Bucket:** reuse `paper-uploads` for both source + generated docx (`uid/feedforward/...`); only add the
Word MIME types — the existing staff-write/public-read policies already cover new objects
(`20260618_10:16-32`). Use **signed URLs** for generated sheets if pupil-identifying text could appear.

## 8. Changes by file

**Backend**
- `supabase/functions/paper-feedforward/index.ts` **(NEW)** — or the Node route per §4. Role gate +
  ownership check + ported prompt + Sonnet + JSON parse + `docx-js` (Packer.toBuffer) + service-role
  upload + insert row + `logUsage`/cost backstop.
- Migration: ALTER `paper-uploads` `allowed_mime_types` to add `…wordprocessingml.document` + `msword`.
- Migration: `paper_feedforward_sheets` table + RLS.
- Tier B: `mammoth` + optional Haiku extraction sub-call.

**Frontend**
- `PaperEditor.js`: third pill "Feedforward" + `FeedforwardPanel` (upload docx, checkbox list of
  `paper_questions` from the `questions` state at `:27`, free-text notes, Generate, list of sheets with
  download/regenerate/delete). Port UX from feynman `FeedforwardFromPaper.tsx`.
- `supabase.js`: add `uploadToBucket` (port `FeedforwardFromPaper.tsx:32-44`) and `callEdge`
  (generalise `callMarkAnswer:171-178`); expose on `sb` (`:324`).
- `PaperManager.js` (optional): feedforward-count badge per card (`:106-108`).

## 9. Phased plan

| Phase | Scope | Est. |
|---|---|---|
| **0** | Mime migration; `uploadToBucket` + `callEdge` in `supabase.js`; `paper_feedforward_sheets` table + RLS | ~0.5 day |
| **1 — MVP (headline ask)** | `paper-feedforward` function (auth, ownership, ported prompt, JSON, docx-js per Skill, upload, insert, `ai_usage`, backstop) + Feedforward section in `PaperEditor.js`; teacher types struggled questions, no parsing | ~2-3 days |
| **2** | `mammoth` parse + Haiku extraction + checkbox list; keep feynman images/PDF mode | ~2 days |
| **3** | Attach sheet to a class, surface in HoD/`PaperResults`, auto-suggest from `paper_responses` (`class_paper_gaps`) | ~1-2 days |
| **4 — polish** | Signed URLs, regenerate-with-tweaks, dedupe the feynman HTML path | — |

**Effort:** MVP (Phase 0+1) ~3-4 dev-days, pending the day-1 docx-runtime spike. Full incl. polish ~8-10 days.

## 10. Risks

- **`docx`/`mammoth` bundling under Supabase Deno** is the biggest unknown — de-risk day 1; fallback =
  Vercel Node route (`runtime: nodejs`, `maxDuration: 60`), proven by feynman `route.ts:25-26`.
- **Latency:** Sonnet + docx can exceed the edge ~25s wall — feynman moved this to nodejs/maxDuration 60.
- **Cost:** a paid Sonnet call by staff MUST route through `overBackstop` + `ai_usage` or it's the
  unmetered sink the `mark-paper-answer` auth lock-in closed (`:150-160`).
- **Public bucket leaks by URL** — use signed URLs if pupil names appear.
- **Tier-B parsing is best-effort** — keep parsed questions draft-only.
- **Two-app drift** — make the new function the single source post-unification.

## 11. Open questions (need a decision before/while building)

1. **Strictly a `.docx`, or is feynman's HTML good enough?** The Skill mandates docx (cantSplit boxes);
   this design assumes a true docx — the main net-new work. *(Recommendation: docx.)*
2. **Replace feynman's feedforward, or coexist?** *(Recommendation: new function = single source.)*
3. **Should the uploaded docx also seed `paper_questions`** (markable paper), or be source-only?
   *(Recommendation: source-only for MVP.)*
4. **Public vs signed URLs** — any chance pupil-identifying text appears in a sheet?
5. **Edge function vs Vercel Node route** (§4) — decided by the day-1 docx-runtime spike.
