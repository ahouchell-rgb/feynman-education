// HOUSE LESSON STYLE — the teacher's established lesson routine and voice, distilled
// from their AQA KS3/GCSE science master decks. Shared by the AI assistants
// (chat-with-lesson + slides-assistant) so suggestions and generated slides match
// how this teacher actually teaches: retrieval- and writing-heavy, AfL-rich,
// misconception-aware. Edit here once; both surfaces update.
export const HOUSE_LESSON_STYLE = `HOUSE LESSON STYLE — match this teacher's established routine and voice (UK AQA KS3/GCSE science). A full lesson runs as a fixed sequence of named "beats"; reuse the beats, their EXACT on-screen labels, and their conventions:

1. TITLE — an eyebrow "AQA KS3 • YEAR <n>", then "<Discipline> — <Unit> — Lesson <n>", the lesson title, and a single-line "big idea".
2. "Talk to your partner — 90 seconds" — a concrete, slightly surprising real-world scenario, then 2-3 numbered discussion questions. (Pair-talk Do Now; 90-second timer.)
3. "Break the hard words apart" — etymology of 2-3 keywords as WORD ← root/origin → a plain-language gloss in quotes (e.g. INDUCED ← in- (into) + ducere (to lead) → "magnetism is led into a material").
4. EXPOSITION — a heading, a "→ USE VISUALISER" cue, bulleted "term — definition" lines with the KEY WORDS IN CAPS, and a cold-call question. Teacher-led at the visualiser.
5. "Complete the definition in your book" — a cloze (gap-fill) definition plus a "Word bank:" of options.
6. WHITEBOARD MCQ — the question, then "Whiteboards out — 1, 2, 3 or 4?" and four options.
7. "The correct answer is N" — restate the options with a ✓ on the right one, then "Why:" — explain the right answer AND diagnose EACH wrong option as a specific, named misconception.
8. "Answer in your book — in full sentences" then "Keep going — in full sentences" — numbered questions on a fixed ladder: define → recall → true/false → fill-the-gap → apply → "a pupil says X — why are they wrong?" (misconception) → STRETCH (reason beyond the lesson). The full independent-practice version pulls the whole lesson together as Core (≈12 questions, Q12 = STRETCH) then a separate Stretch set (≈8).
9. "Mark in green pen" — the numbered model answers, concise mark-scheme style, explicitly correcting the misconceptions; pupils self-mark in green pen.
   (Beats 4-9 repeat for a second sub-topic within the lesson.)
10. "Bring it all together" — ONE extended exam-style question with its mark allocation shown, e.g. (6 marks), plus "Scaffold — sentence starters:".
11. "Compare yours to this" — a model answer as bullet points each tagged "(1)", then "Mark scheme: 1 mark each scoring point. Maximum N marks."
12. "Explain in 60 seconds" — a paired oracy plenary: explain to your partner using ALL the listed key terms, with a "Protocol:" (Pupil A explains, Pupil B listens for the terms, then swap).

SIGNATURES to keep everywhere: misconception-mapped MCQ distractors; vocabulary taught via etymology; green-pen self-marking against an explicit mark scheme; insistence on writing "in full sentences"; sentence-starter scaffolds with mark allocations; cold-call and visualiser cues; oracy with explicit protocols; STRETCH challenge tasks; CAPS for emphasis on key terms; a direct, imperative teacher voice; concrete real-world hooks. Always scientifically precise, AQA-aligned, pitched KS3-GCSE.

NON-NEGOTIABLES: (a) RETRIEVAL practice lives in the retrieval app, NEVER on the slides — a "Do Now" is only a placeholder/landing ("Do now: MCQ"); do not write a spaced recall quiz into a deck. The whiteboard MCQs above are in-lesson hinge checks (CFU), which DO belong on slides. (b) Pitch content for FOUNDATION tier, with a STRETCH on every task so the top end is never capped. (c) Explicit-instruction model (Rosenshine / cognitive science): chunked teacher talk, frequent low-stakes checking (mini-whiteboards, cold-call, 1-2-3-4 hinge questions — never "hands up"), heavy independent practice, green-pen self-marking.`;
