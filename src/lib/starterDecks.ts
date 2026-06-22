/* Built-in starter / exemplar decks for the cold-start path.
 *
 * A brand-new teacher's /slides is empty, which means ~20 min of building before
 * the first useful lesson. These are complete, multi-slide lesson *shapes* a
 * teacher can clone in one click and adapt: generic, curriculum-agnostic
 * placeholder text (no fabricated exam content) built from the exact same slide
 * element shapes the editor uses (see TEMPLATES in slideEditor/constants), so
 * they render and edit correctly the moment they land in the editor.
 *
 * `instantiateStarter` deep-clones one of these into a fresh deck (new deck id +
 * fresh slide/element ids via ensureIds) for either store — Supabase or guest. */

import { uid, ensureIds } from "@/components/slideEditor/constants";

// A slide body is the same shape a TEMPLATE build() returns: an optional
// per-slide background plus an array of editor elements. Ids are minted on
// instantiation, so the definitions stay declarative and id-free.
type StarterSlide = { background?: string; elements: any[] };
export type StarterDeck = {
  id: string;        // stable key for the picker (not the created deck id)
  title: string;     // becomes the new deck's title
  blurb: string;     // one-line description for the picker card
  theme?: any;       // optional deck theme (a THEMES entry shape)
  slides: StarterSlide[];
};

/* ── Reusable slide bodies (mirror the editor's TEMPLATES element shapes) ── */

const titleSlide = (title: string, sub = "Class · date"): StarterSlide => ({
  elements: [
    { type: "text", x: 80, y: 170, width: 800, height: 120, text: title, fontSize: 64, bold: true, align: "center", color: "#1a1714", font: "Georgia, 'Instrument Serif', serif", fontFace: "Georgia" },
    { type: "text", x: 80, y: 305, width: 800, height: 56, text: sub, fontSize: 28, align: "center", color: "#8c8678" },
  ],
});

const objectivesSlide = (lines = "•  \n•  \n•  "): StarterSlide => ({
  background: "#f3eee2",
  elements: [
    { type: "text", x: 70, y: 60, width: 820, height: 70, text: "Learning objectives", fontSize: 48, bold: true, color: "#1a1714" },
    { type: "text", x: 80, y: 165, width: 800, height: 320, text: lines, fontSize: 34, color: "#1a1714" },
  ],
});

const doNowSlide = (): StarterSlide => ({
  elements: [
    { type: "text", x: 70, y: 60, width: 560, height: 70, text: "Do Now", fontSize: 48, bold: true, color: "#b95a3c" },
    { type: "text", x: 70, y: 165, width: 540, height: 300, text: "1.  \n2.  \n3.  ", fontSize: 32, color: "#1a1714" },
    { type: "timer", x: 645, y: 165, width: 245, height: 140, duration: 300, fill: "#1a1714", color: "#ffffff", fontSize: 64 },
  ],
});

const keyFactsSlide = (): StarterSlide => ({
  elements: [
    { type: "text", x: 70, y: 56, width: 820, height: 64, text: "Key ideas", fontSize: 48, bold: true, color: "#2e3a5f" },
    { type: "text", x: 80, y: 150, width: 480, height: 350, text: "•  \n•  \n•  \n•  ", fontSize: 30, color: "#1a1714" },
    { type: "text", x: 600, y: 150, width: 300, height: 60, text: "Key terms", fontSize: 24, bold: true, color: "#b95a3c" },
    { type: "text", x: 600, y: 214, width: 300, height: 286, text: "•  \n•  \n•  ", fontSize: 24, color: "#1a1714" },
  ],
});

const diagramSlide = (): StarterSlide => ({
  elements: [
    { type: "text", x: 70, y: 44, width: 820, height: 60, text: "Label the diagram", fontSize: 44, bold: true, color: "#1a1714" },
    { type: "rect", x: 340, y: 150, width: 300, height: 300, fill: "rgba(46,58,95,0.08)", stroke: "#2e3a5f", radius: 8 },
    { type: "text", x: 340, y: 285, width: 300, height: 40, text: "(add image)", fontSize: 20, align: "center", color: "#8c8678" },
    { type: "arrow", x1: 130, y1: 210, x2: 340, y2: 225, color: "#1a1714", thickness: 5 },
    { type: "text", x: 60, y: 188, width: 70, height: 40, text: "Label", fontSize: 24, color: "#1a1714" },
    { type: "arrow", x1: 830, y1: 390, x2: 640, y2: 375, color: "#1a1714", thickness: 5 },
    { type: "text", x: 830, y: 368, width: 90, height: 40, text: "Label", fontSize: 24, color: "#1a1714" },
  ],
});

const questionsSlide = (): StarterSlide => ({
  elements: [
    { type: "text", x: 70, y: 50, width: 820, height: 56, text: "Questions", fontSize: 44, bold: true, color: "#1a1714" },
    { type: "text", x: 80, y: 140, width: 800, height: 360, text: "1.  \n2.  \n3.  \n4.  \n5.  ", fontSize: 30, color: "#1a1714" },
  ],
});

const answersSlide = (): StarterSlide => ({
  background: "#f3eee2",
  elements: [
    { type: "text", x: 70, y: 50, width: 820, height: 56, text: "Answers", fontSize: 44, bold: true, color: "#5e7c4b" },
    { type: "text", x: 80, y: 140, width: 800, height: 360, text: "1.  \n2.  \n3.  \n4.  \n5.  ", fontSize: 30, color: "#1a1714", reveal: true },
  ],
});

const exitTicketSlide = (): StarterSlide => ({
  background: "#f3eee2",
  elements: [
    { type: "text", x: 70, y: 60, width: 820, height: 70, text: "Exit ticket", fontSize: 48, bold: true, color: "#5e7c4b" },
    { type: "text", x: 80, y: 175, width: 800, height: 120, text: "Question: ", fontSize: 34, color: "#1a1714" },
    { type: "text", x: 80, y: 330, width: 800, height: 90, text: "Answer: ", fontSize: 30, bold: true, color: "#5e7c4b", reveal: true },
  ],
});

const retrievalSlide = (): StarterSlide => ({
  elements: [
    { type: "text", x: 50, y: 26, width: 860, height: 50, text: "Retrieval", fontSize: 36, bold: true, color: "#1a1714" },
    { type: "retrieval", x: 50, y: 88, width: 860, height: 424, url: "https://retrieval-app.com" },
  ],
});

/* ── The starter decks ── */

export const STARTER_DECKS: StarterDeck[] = [
  {
    id: "full-lesson",
    title: "Full lesson",
    blurb: "Title · objectives · Do Now · key ideas · diagram · exit ticket",
    slides: [
      titleSlide("Lesson title"),
      objectivesSlide(),
      doNowSlide(),
      keyFactsSlide(),
      diagramSlide(),
      exitTicketSlide(),
    ],
  },
  {
    id: "practical-lesson",
    title: "Practical lesson",
    blurb: "Method · safety · results table · conclusion",
    slides: [
      titleSlide("Practical: title"),
      objectivesSlide("•  Carry out the method safely\n•  Record results accurately\n•  Draw a valid conclusion"),
      {
        elements: [
          { type: "text", x: 70, y: 56, width: 820, height: 64, text: "Method", fontSize: 48, bold: true, color: "#8a3a22" },
          { type: "text", x: 80, y: 150, width: 800, height: 360, text: "1.  \n2.  \n3.  \n4.  \n5.  ", fontSize: 30, color: "#1a1714" },
        ],
      },
      {
        background: "#f3eee2",
        elements: [
          { type: "text", x: 70, y: 60, width: 820, height: 70, text: "Safety", fontSize: 48, bold: true, color: "#b95a3c" },
          { type: "text", x: 80, y: 165, width: 800, height: 300, text: "Hazard → Risk → Control\n•  \n•  \n•  ", fontSize: 32, color: "#1a1714" },
        ],
      },
      {
        elements: [
          { type: "text", x: 70, y: 50, width: 820, height: 56, text: "Results", fontSize: 44, bold: true, color: "#2e3a5f" },
          { type: "table", x: 70, y: 140, width: 820, height: 320, rows: 4, cols: 4, headerRow: true, fontSize: 22, color: "#1a1714", borderColor: "#9a9486", headerBg: "#1a1714", headerColor: "#ffffff", cells: [["Variable", "Reading 1", "Reading 2", "Mean"], ["", "", "", ""], ["", "", "", ""], ["", "", "", ""]] },
        ],
      },
      {
        elements: [
          { type: "text", x: 70, y: 56, width: 820, height: 64, text: "Conclusion", fontSize: 48, bold: true, color: "#5e7c4b" },
          { type: "text", x: 80, y: 160, width: 800, height: 200, text: "What did the results show? Link back to the science.", fontSize: 30, color: "#1a1714" },
          { type: "text", x: 80, y: 380, width: 800, height: 120, text: "Evaluation: how could it be improved?", fontSize: 26, italic: true, color: "#8c8678" },
        ],
      },
      exitTicketSlide(),
    ],
  },
  {
    id: "revision-retrieval",
    title: "Revision / retrieval lesson",
    blurb: "Retrieval starter · recap · questions · answers",
    slides: [
      titleSlide("Revision: topic"),
      retrievalSlide(),
      keyFactsSlide(),
      questionsSlide(),
      answersSlide(),
      exitTicketSlide(),
    ],
  },
  {
    id: "explanation-lesson",
    title: "Explanation lesson",
    blurb: "I do · we do · you do — worked example to practice",
    slides: [
      titleSlide("Lesson title"),
      objectivesSlide(),
      doNowSlide(),
      {
        elements: [
          { type: "text", x: 70, y: 56, width: 820, height: 64, text: "I do — worked example", fontSize: 44, bold: true, color: "#2e3a5f" },
          { type: "text", x: 80, y: 150, width: 800, height: 350, text: "Model the steps here.", fontSize: 30, color: "#1a1714" },
        ],
      },
      {
        background: "#f3eee2",
        elements: [
          { type: "text", x: 70, y: 56, width: 820, height: 64, text: "We do — together", fontSize: 44, bold: true, color: "#b95a3c" },
          { type: "text", x: 80, y: 150, width: 800, height: 350, text: "Work through one as a class.", fontSize: 30, color: "#1a1714" },
        ],
      },
      {
        elements: [
          { type: "text", x: 70, y: 56, width: 820, height: 64, text: "You do — your turn", fontSize: 44, bold: true, color: "#5e7c4b" },
          { type: "text", x: 80, y: 150, width: 800, height: 320, text: "1.  \n2.  \n3.  ", fontSize: 30, color: "#1a1714" },
        ],
      },
      exitTicketSlide(),
    ],
  },
  {
    id: "do-now-only",
    title: "Quick starter",
    blurb: "Just a Do Now + a single objective — a 5-minute opener",
    slides: [
      doNowSlide(),
      objectivesSlide("•  "),
    ],
  },
];

export const starterById = (id: string) => STARTER_DECKS.find((d) => d.id === id) || null;

/* Deep-clone a starter into a brand-new, fully-owned deck and persist it via the
 * page's store (Supabase when signed in, guest store otherwise). Fresh slide and
 * element ids are minted by ensureIds so nothing is shared with the template or
 * across the new deck's slides. Returns the created deck row (with its real id).
 *
 * `store.create` already stamps id/updated_at; we only set title, slides and the
 * owner (when signed in — the guest store has no owner column). */
export async function instantiateStarter(
  starter: StarterDeck,
  store: { create: (deck: any) => Promise<any> },
  opts: { ownerId?: string | null } = {},
) {
  const slides = ensureIds(starter.slides.map((s) => ({ ...s, elements: (s.elements || []).map((e) => ({ ...e })) })));
  const deck: any = { title: starter.title, slides };
  if (starter.theme) deck.theme = starter.theme;
  if (opts.ownerId) deck.owner = opts.ownerId;
  return store.create(deck);
}
