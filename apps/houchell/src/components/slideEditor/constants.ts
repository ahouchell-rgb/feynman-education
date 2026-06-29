/* Constants, data tables and pure helpers for the slide editor.
 * Extracted from SlideEditor.tsx so the editor file is the component logic only,
 * and so these (templates, formula palettes, caret helpers) can be reused/tested
 * without mounting the editor. No React, no JSX. */

// Collision-proof id: a per-session counter guarantees uniqueness even when
// many ids are minted in the same tick (templates, AI, slide clone). The old
// `performance.now()` version returned duplicates because browsers clamp its
// resolution, which made a template's slide + elements (and AI-generated
// slides) share an id — duplicate React keys made content bleed across slides.
let _idc = 0;
export const uid = () => "el" + Date.now().toString(36) + (_idc++).toString(36);

// Guarantee unique slide ids and per-slide-unique element ids. Heals decks
// saved before the fix so their content stops appearing on every slide.
export const ensureIds = (sl) => {
  const seenSlides = new Set();
  return (sl || []).map((s) => {
    let sid = s.id, changed = false;
    if (!sid || seenSlides.has(sid)) { sid = uid(); changed = true; }
    seenSlides.add(sid);
    const seenEls = new Set();
    const elements = (s.elements || []).map((e) => {
      let eid = e.id;
      if (!eid || seenEls.has(eid)) { eid = uid(); changed = true; }
      seenEls.add(eid);
      return eid === e.id ? e : { ...e, id: eid };
    });
    return changed ? { ...s, id: sid, elements } : s;
  });
};

export const MIN = 24; // smallest box size, in virtual units

// Font choices: css family for the editor, `face` for PowerPoint export.
export const FONTS = [
  { label: "Sans", css: "'IBM Plex Sans', sans-serif", face: "Arial" },
  { label: "Serif", css: "Georgia, 'Instrument Serif', serif", face: "Georgia" },
  { label: "Mono", css: "'IBM Plex Mono', monospace", face: "Consolas" },
  { label: "Friendly", css: "'Comic Sans MS', 'Chalkboard SE', sans-serif", face: "Comic Sans MS" },
  { label: "Classic", css: "'Times New Roman', serif", face: "Times New Roman" },
  { label: "Verdana", css: "Verdana, sans-serif", face: "Verdana" },
];

// Formula helpers (SUB/SUP maps, mapScript, toSubscript/toSuperscript, autoSub)
// live in @/lib/formula so they can be unit-tested without loading this component.

// Symbol palette for science slides.
export const SYMBOLS = ["→", "⇌", "↑", "↓", "°", "×", "÷", "±", "≈", "≠", "≤", "≥", "∝", "√", "∞", "Δ", "Σ", "π", "λ", "μ", "α", "β", "γ", "θ", "ρ", "σ", "Ω", "ω", "ε", "φ", "⋅", "½"];
export const STATES = ["(s)", "(l)", "(g)", "(aq)"];
// Common ion charges — superscript glyphs inserted at the cursor, so SO₄ + ²⁻ → SO₄²⁻.
export const CHARGES = ["⁺", "⁻", "²⁺", "²⁻", "³⁺", "³⁻"];
// Curated science equations, pre-formatted with Unicode (÷ × ² Δ ½ ρ λ) so they
// drop in clean. Inserted as text at the cursor.
export const EQUATIONS = [
  "speed = distance ÷ time",
  "a = Δv ÷ t",
  "F = m × a",
  "W = F × d",
  "P = E ÷ t",
  "E = ½ m v²",
  "E = m × g × h",
  "ρ = m ÷ V",
  "V = I × R",
  "Q = I × t",
  "p = m × v",
  "moment = F × d",
  "pressure = F ÷ A",
  "moles = mass ÷ Mr",
];

// Character offsets of the current selection within a contentEditable node.
export function caretOffsets(node) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!node.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(node);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start, end: start + range.toString().length };
}
export function selectRange(node, a, b) {
  const tn = node.firstChild || node;
  const len = (tn.textContent || "").length;
  const r = document.createRange();
  r.setStart(tn, Math.min(a, len));
  r.setEnd(tn, Math.min(b ?? a, len));
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

// Turn a pasted URL into an embeddable video element.
export function parseVideo(url) {
  const u = (url || "").trim();
  let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)))
    return { provider: "youtube", embed: `https://www.youtube.com/embed/${m[1]}`, src: u };
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)))
    return { provider: "vimeo", embed: `https://player.vimeo.com/video/${m[1]}`, src: u };
  if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(u)) return { provider: "file", embed: u, src: u };
  return { provider: "iframe", embed: u, src: u };
}

// Retrieval app embedded live in Present (teacher picks topics inside it).
export const RET_APP_ORIGIN = "https://retrieval-app.com";

// Deck themes — applied across every slide (background + text fonts/colours).
export const THEMES = [
  { name: "Clean", bg: "#ffffff", text: "#1a1714", heading: "#1a1714", accent: "#2e3a5f", headingFont: "Sans", bodyFont: "Sans" },
  { name: "Editorial", bg: "#f3eee2", text: "#1a1714", heading: "#1a1714", accent: "#b95a3c", headingFont: "Serif", bodyFont: "Sans" },
  { name: "Slate", bg: "#1f2430", text: "#e8e8ea", heading: "#ffffff", accent: "#6ea8fe", headingFont: "Sans", bodyFont: "Sans" },
  { name: "Chalkboard", bg: "#22302b", text: "#eef3ee", heading: "#ffffff", accent: "#f2c14e", headingFont: "Friendly", bodyFont: "Friendly" },
  { name: "Biology", bg: "#ffffff", text: "#1a1714", heading: "#3f5733", accent: "#5e7c4b", headingFont: "Serif", bodyFont: "Sans" },
  { name: "Chemistry", bg: "#ffffff", text: "#1a1714", heading: "#8a3a22", accent: "#b95a3c", headingFont: "Serif", bodyFont: "Sans" },
  { name: "Physics", bg: "#ffffff", text: "#1a1714", heading: "#22305c", accent: "#2e3a5f", headingFont: "Serif", bodyFont: "Sans" },
];
export const fontByLabel = (label) => FONTS.find((f) => f.label === label) || FONTS[0];

// Lesson-structure templates. build() returns a slide body; ids are added on insert.
export const TEMPLATES = [
  { label: "Title slide", build: () => ({ elements: [
    { type: "text", x: 80, y: 170, width: 800, height: 120, text: "Lesson title", fontSize: 72, bold: true, align: "center", color: "#1a1714", font: "Georgia, 'Instrument Serif', serif", fontFace: "Georgia" },
    { type: "text", x: 80, y: 305, width: 800, height: 56, text: "Class · date", fontSize: 30, align: "center", color: "#8c8678" },
  ] }) },
  { label: "Learning objectives", build: () => ({ background: "#f3eee2", elements: [
    { type: "text", x: 70, y: 60, width: 820, height: 70, text: "Learning objectives", fontSize: 48, bold: true, color: "#1a1714" },
    { type: "text", x: 80, y: 165, width: 800, height: 320, text: "•  \n•  \n•  ", fontSize: 34, color: "#1a1714" },
  ] }) },
  { label: "Do Now (+ timer)", build: () => ({ elements: [
    { type: "text", x: 70, y: 60, width: 560, height: 70, text: "Do Now", fontSize: 48, bold: true, color: "#b95a3c" },
    { type: "text", x: 70, y: 165, width: 540, height: 300, text: "1.  \n2.  \n3.  ", fontSize: 32, color: "#1a1714" },
    { type: "timer", x: 645, y: 165, width: 245, height: 140, duration: 300, fill: "#1a1714", color: "#ffffff", fontSize: 64 },
  ] }) },
  { label: "Diagram + labels", build: () => ({ elements: [
    { type: "text", x: 70, y: 44, width: 820, height: 60, text: "Label the diagram", fontSize: 44, bold: true, color: "#1a1714" },
    { type: "rect", x: 340, y: 150, width: 300, height: 300, fill: "rgba(46,58,95,0.08)", stroke: "#2e3a5f", radius: 8 },
    { type: "text", x: 340, y: 285, width: 300, height: 40, text: "(add image)", fontSize: 20, align: "center", color: "#8c8678" },
    { type: "arrow", x1: 130, y1: 210, x2: 340, y2: 225, color: "#1a1714", thickness: 5 },
    { type: "text", x: 60, y: 188, width: 70, height: 40, text: "Label", fontSize: 24, color: "#1a1714" },
    { type: "arrow", x1: 830, y1: 390, x2: 640, y2: 375, color: "#1a1714", thickness: 5 },
    { type: "text", x: 830, y: 368, width: 90, height: 40, text: "Label", fontSize: 24, color: "#1a1714" },
  ] }) },
  { label: "Exit ticket", build: () => ({ background: "#f3eee2", elements: [
    { type: "text", x: 70, y: 60, width: 820, height: 70, text: "Exit ticket", fontSize: 48, bold: true, color: "#5e7c4b" },
    { type: "text", x: 80, y: 175, width: 800, height: 120, text: "Question: ", fontSize: 34, color: "#1a1714" },
    { type: "text", x: 80, y: 330, width: 800, height: 90, text: "Answer: ", fontSize: 30, bold: true, color: "#5e7c4b", reveal: true },
  ] }) },
  { label: "Plenary question", build: () => ({ elements: [
    { type: "text", x: 70, y: 60, width: 820, height: 70, text: "Plenary", fontSize: 48, bold: true, color: "#2e3a5f" },
    { type: "text", x: 80, y: 200, width: 800, height: 220, text: "", fontSize: 40, color: "#1a1714" },
  ] }) },
  { label: "Starter", build: () => ({ elements: [
    { type: "text", x: 70, y: 56, width: 820, height: 64, text: "Starter", fontSize: 48, bold: true, color: "#2e3a5f" },
    { type: "text", x: 80, y: 160, width: 800, height: 250, text: "", fontSize: 32, color: "#1a1714" },
    { type: "text", x: 80, y: 432, width: 800, height: 46, text: "Answer in your books.", fontSize: 22, italic: true, color: "#8c8678" },
  ] }) },
  { label: "MCQ — check", build: () => ({ elements: [
    { type: "text", x: 70, y: 48, width: 820, height: 56, text: "Quick check", fontSize: 40, bold: true, color: "#b95a3c" },
    { type: "text", x: 70, y: 126, width: 820, height: 110, text: "Question…", fontSize: 34, color: "#1a1714" },
    { type: "text", x: 90, y: 268, width: 370, height: 50, text: "A.  ", fontSize: 28, color: "#1a1714" },
    { type: "text", x: 500, y: 268, width: 370, height: 50, text: "B.  ", fontSize: 28, color: "#1a1714" },
    { type: "text", x: 90, y: 346, width: 370, height: 50, text: "C.  ", fontSize: 28, color: "#1a1714" },
    { type: "text", x: 500, y: 346, width: 370, height: 50, text: "D.  ", fontSize: 28, color: "#1a1714" },
    { type: "text", x: 70, y: 448, width: 820, height: 50, text: "Answer: ", fontSize: 26, bold: true, color: "#5e7c4b", reveal: true },
  ] }) },
  { label: "Questions", build: () => ({ elements: [
    { type: "text", x: 70, y: 50, width: 820, height: 56, text: "Questions", fontSize: 44, bold: true, color: "#1a1714" },
    { type: "text", x: 80, y: 140, width: 800, height: 360, text: "1.  \n2.  \n3.  \n4.  \n5.  ", fontSize: 30, color: "#1a1714" },
  ] }) },
  { label: "Answers", build: () => ({ background: "#f3eee2", elements: [
    { type: "text", x: 70, y: 50, width: 820, height: 56, text: "Answers", fontSize: 44, bold: true, color: "#5e7c4b" },
    { type: "text", x: 80, y: 140, width: 800, height: 360, text: "1.  \n2.  \n3.  \n4.  \n5.  ", fontSize: 30, color: "#1a1714", reveal: true },
  ] }) },
  { label: "Retrieval", build: () => ({ elements: [
    { type: "text", x: 50, y: 26, width: 860, height: 50, text: "Retrieval", fontSize: 36, bold: true, color: "#1a1714" },
    { type: "retrieval", x: 50, y: 88, width: 860, height: 424, url: "https://retrieval-app.com" },
  ] }) },
];

export const HANDLES: [string, number, number][] = [
  ["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0],
  ["w", 0, 0.5],               ["e", 1, 0.5],
  ["sw", 0, 1], ["s", 0.5, 1], ["se", 1, 1],
];
export const CURSORS = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
export const HANDLE_PX = 9;

// Keep computed overlay coordinates finite — a non-finite element coordinate
// (bad import / AI deck) would otherwise reach a CSS length and make React
// flood the dev console with "`Infinity` is an invalid value for `left`".
export const fin = (v) => (typeof v === "number" && !Number.isFinite(v) ? 0 : v);

/* `deck.slides` is the single source of truth. Every action builds the next
   slides array, sets local state, and calls onChange so the parent can save. */
export const DEFAULT_MASTER = { enabled: true, headerLeft: "", headerCenter: "", headerRight: "", footerLeft: "{title}", footerCenter: "", footerRight: "{n} / {total}", color: "#6b6256", accent: "#b95a3c", showRule: true };

/* Keyboard-shortcut cheat sheet (press ?). Surfaces the editor's many shortcuts,
   which were previously undiscoverable. */
export const SHORTCUTS: [string, [string, string][]][] = [
  ["Editing", [
    ["Undo / Redo", "⌘Z / ⌘⇧Z"],
    ["Duplicate selection", "⌘D"],
    ["Cut / Copy / Paste", "⌘X / ⌘C / ⌘V"],
    ["Select all on slide", "⌘A"],
    ["Delete selection / slide", "Delete"],
    ["Nudge (10px with ⇧)", "Arrow keys"],
  ]],
  ["Canvas", [
    ["Zoom in / out", "⌘+ / ⌘−"],
    ["Reset zoom to fit", "⌘0"],
    ["Multi-select", "Shift-click / drag"],
    ["Free-resize an image", "⇧ + corner drag"],
    ["Rotate in 15° steps", "⇧ while rotating"],
    ["Add an image", "Drag a file onto the canvas"],
  ]],
  ["General", [
    ["Edit text / table", "Double-click"],
    ["Element / slide menu", "Right-click"],
    ["Find text in deck", "Find box · Enter"],
    ["This cheat sheet", "?"],
    ["Close overlay", "Esc"],
  ]],
];

// Does this contentEditable HTML carry any inline formatting / lists worth
// persisting as `rich`? Plain typing (incl. <div>/<br> line breaks) does not.
export const isRich = (html) => /<(b|strong|i|em|u|s|span|font|ul|ol|li)\b/i.test(html || "");
