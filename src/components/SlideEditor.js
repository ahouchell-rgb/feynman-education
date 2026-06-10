"use client";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { sk } from "@/lib/sk";
import { VW, VH, elStyle, ElInner, ArrowSvg, StaticSlide, MasterFrame, CHART_COLORS } from "@/components/SlideStage";

// Collision-proof id: a per-session counter guarantees uniqueness even when
// many ids are minted in the same tick (templates, AI, slide clone). The old
// `performance.now()` version returned duplicates because browsers clamp its
// resolution, which made a template's slide + elements (and AI-generated
// slides) share an id — duplicate React keys made content bleed across slides.
let _idc = 0;
const uid = () => "el" + Date.now().toString(36) + (_idc++).toString(36);

// Guarantee unique slide ids and per-slide-unique element ids. Heals decks
// saved before the fix so their content stops appearing on every slide.
const ensureIds = (sl) => {
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

const MIN = 24; // smallest box size, in virtual units

// Font choices: css family for the editor, `face` for PowerPoint export.
const FONTS = [
  { label: "Sans", css: "'IBM Plex Sans', sans-serif", face: "Arial" },
  { label: "Serif", css: "Georgia, 'Instrument Serif', serif", face: "Georgia" },
  { label: "Mono", css: "'IBM Plex Mono', monospace", face: "Consolas" },
  { label: "Friendly", css: "'Comic Sans MS', 'Chalkboard SE', sans-serif", face: "Comic Sans MS" },
  { label: "Classic", css: "'Times New Roman', serif", face: "Times New Roman" },
  { label: "Verdana", css: "Verdana, sans-serif", face: "Verdana" },
];

// Formula helpers — map normal characters to Unicode sub/superscripts. Covers
// every digit + common signs, plus the subset of letters Unicode provides.
const SUB = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};
const SUP = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};
const invertMap = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const SUB_INV = invertMap(SUB);
const SUP_INV = invertMap(SUP);
const mapScript = (seg, kind) => {
  const map = kind === "sub" ? SUB : SUP;
  const inv = kind === "sub" ? SUB_INV : SUP_INV;
  const already = [...seg].every((c) => c === " " || inv[c] !== undefined);
  return [...seg].map((c) => (c === " " ? c : already ? (inv[c] ?? c) : (map[c] ?? c))).join("");
};
// Whole-text transforms used by the PropsBar X₂ / X² buttons.
const toSubscript = (t) => (t || "").replace(/([A-Za-z\)\]])(\d+)/g, (m, a, d) => a + d.replace(/\d/g, (c) => SUB[c]));
const toSuperscript = (t) => (t || "").replace(/\^(-?\d+|[+\-])/g, (m, g) => g.replace(/[\d+\-]/g, (c) => SUP[c] || c));

// Symbol palette for science slides.
const SYMBOLS = ["→", "⇌", "↑", "↓", "°", "×", "÷", "±", "≈", "≠", "≤", "≥", "∝", "√", "∞", "Δ", "Σ", "π", "λ", "μ", "α", "β", "γ", "θ", "ρ", "σ", "Ω", "ω", "ε", "φ", "⋅", "½"];
const STATES = ["(s)", "(l)", "(g)", "(aq)"];

// Character offsets of the current selection within a contentEditable node.
function caretOffsets(node) {
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
function selectRange(node, a, b) {
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
function parseVideo(url) {
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
const RET_APP_ORIGIN = "https://retrieval-app.com";

// Deck themes — applied across every slide (background + text fonts/colours).
const THEMES = [
  { name: "Clean", bg: "#ffffff", text: "#1a1714", heading: "#1a1714", accent: "#2e3a5f", headingFont: "Sans", bodyFont: "Sans" },
  { name: "Editorial", bg: "#f3eee2", text: "#1a1714", heading: "#1a1714", accent: "#b95a3c", headingFont: "Serif", bodyFont: "Sans" },
  { name: "Slate", bg: "#1f2430", text: "#e8e8ea", heading: "#ffffff", accent: "#6ea8fe", headingFont: "Sans", bodyFont: "Sans" },
  { name: "Chalkboard", bg: "#22302b", text: "#eef3ee", heading: "#ffffff", accent: "#f2c14e", headingFont: "Friendly", bodyFont: "Friendly" },
  { name: "Biology", bg: "#ffffff", text: "#1a1714", heading: "#3f5733", accent: "#5e7c4b", headingFont: "Serif", bodyFont: "Sans" },
  { name: "Chemistry", bg: "#ffffff", text: "#1a1714", heading: "#8a3a22", accent: "#b95a3c", headingFont: "Serif", bodyFont: "Sans" },
  { name: "Physics", bg: "#ffffff", text: "#1a1714", heading: "#22305c", accent: "#2e3a5f", headingFont: "Serif", bodyFont: "Sans" },
];
const fontByLabel = (label) => FONTS.find((f) => f.label === label) || FONTS[0];

// Lesson-structure templates. build() returns a slide body; ids are added on insert.
const TEMPLATES = [
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

const HANDLES = [
  ["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0],
  ["w", 0, 0.5],               ["e", 1, 0.5],
  ["sw", 0, 1], ["s", 0.5, 1], ["se", 1, 1],
];
const CURSORS = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const HANDLE_PX = 9;

// Keep computed overlay coordinates finite — a non-finite element coordinate
// (bad import / AI deck) would otherwise reach a CSS length and make React
// flood the dev console with "`Infinity` is an invalid value for `left`".
const fin = (v) => (typeof v === "number" && !Number.isFinite(v) ? 0 : v);

/* `deck.slides` is the single source of truth. Every action builds the next
   slides array, sets local state, and calls onChange so the parent can save. */
const DEFAULT_MASTER = { enabled: true, headerLeft: "", headerCenter: "", headerRight: "", footerLeft: "{title}", footerCenter: "", footerRight: "{n} / {total}", color: "#6b6256", accent: "#b95a3c", showRule: true };

// Thin vertical divider used to group toolbar clusters.
const Sep = () => <span style={{ width: 1, height: 22, alignSelf: "center", background: C.border, margin: "0 2px" }} />;
// Small uppercase section label for the right inspector panel.
const PanelLabel = ({ children }) => <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>{children}</div>;

export function SlideEditor({ deck, onChange, onUploadImage, onThemeChange, onMasterChange }) {
  const [slides, setSlides] = useState(() =>
    ensureIds(deck.slides?.length ? deck.slides : [{ id: uid(), elements: [] }]));
  const [cur, setCur] = useState(0);
  const [selIds, setSelIds] = useState([]);          // multi-selection
  const sel = selIds.length === 1 ? selIds[0] : null; // single-primary (drives props/handles)
  const setSel = (id) => setSelIds(id ? [id] : []);
  const [editing, setEditing] = useState(null);
  const [guides, setGuides] = useState([]);           // smart-align guide lines (virtual coords)
  const [marquee, setMarquee] = useState(null);       // rubber-band rectangle (virtual coords)
  const [themeState, setThemeState] = useState(deck.theme || null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [masterState, setMasterState] = useState(deck.master || null);
  const [masterOpen, setMasterOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [find, setFind] = useState("");
  const [insertOpen, setInsertOpen] = useState(false);   // "+ Insert" dropdown
  // Right panel is single-occupancy: opening one view closes the others, and
  // the column is always mounted so toggling never changes canvas width.
  const openPanel = (name) => {
    setThemeOpen(name === "theme" ? (v) => !v : false);
    setMasterOpen(name === "brand" ? (v) => !v : false);
    setAiOpen(name === "claude" ? (v) => !v : false);
  };
  const updateMaster = (patch) => {
    const next = { ...DEFAULT_MASTER, ...(masterState || {}), ...patch };
    setMasterState(next); onMasterChange?.(next);
  };

  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const fileRef = useRef(null);
  const htmlRef = useRef(null);
  const editorApi = useRef(null); // set by the active inline TextEditor
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const scale = fitScale * zoom;
  const zoomBy = (d) => setZoom((z) => Math.min(4, Math.max(0.25, +(z + d).toFixed(2))));

  useLayoutEffect(() => {
    const fit = () => setFitScale(Math.max(0.05, Math.min(1, ((wrapRef.current?.clientWidth || VW) - 32) / VW))); // clamp >0 so 1/scale never blows up
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const slide = slides[cur] || slides[0];
  const selEl = slide.elements.find(e => e.id === sel) || null;
  const edEl = slide.elements.find(e => e.id === editing) || null;
  const selSet = new Set(selIds);
  const selEls = slide.elements.filter(e => selSet.has(e.id));

  const commit = (next) => { setSlides(next); onChange?.(next); };
  const mapSlide = (fn) => commit(slides.map((s, i) => (i === cur ? fn(s) : s)));
  const patchEl = (id, patch) =>
    mapSlide(s => ({ ...s, elements: s.elements.map(e => (e.id === id ? { ...e, ...patch } : e)) }));

  // ── History (undo / redo) ──
  const histPast = useRef([]);
  const histFuture = useRef([]);
  const lastSnap = useRef(0);
  const [, forceTick] = useState(0); // re-render so undo/redo buttons enable/disable
  // Capture the pre-change deck. `coalesce` folds a rapid burst (slider drags,
  // arrow-key nudges) into one history entry.
  const snapshot = (coalesce = false) => {
    const now = Date.now();
    if (coalesce && histPast.current.length && now - lastSnap.current < 400) { lastSnap.current = now; return; }
    histPast.current.push(slides);
    if (histPast.current.length > 60) histPast.current.shift();
    histFuture.current = [];
    lastSnap.current = now;
    forceTick(t => t + 1);
  };
  const restore = (stackFrom, stackTo) => {
    if (!stackFrom.current.length) return;
    stackTo.current.push(slides);
    const next = stackFrom.current.pop();
    setSlides(next); onChange?.(next);
    setCur(c => Math.min(c, next.length - 1));
    setSel(null); setEditing(null);
    forceTick(t => t + 1);
  };
  const undo = () => restore(histPast, histFuture);
  const redo = () => restore(histFuture, histPast);

  const patchH = (id, patch) => { snapshot(true); patchEl(id, patch); };
  const setSlideBg = (bg) => { snapshot(true); mapSlide(s => ({ ...s, background: bg })); };
  const setNotes = (notes) => { snapshot(true); mapSlide(s => ({ ...s, notes })); };
  const setHideMaster = (v) => { snapshot(false); mapSlide(s => ({ ...s, hideMaster: v })); };

  const addEl = (el) => { snapshot(false); const id = uid(); mapSlide(s => ({ ...s, elements: [...s.elements, { id, ...el }] })); setSel(id); setEditing(null); };

  const addText = () => { const f = themeState ? fontByLabel(themeState.bodyFont) : FONTS[0]; addEl({ type: "text", x: 120, y: 200, width: 460, height: 90, text: "New text", fontSize: 40, color: themeState?.text || C.text, font: f.css, fontFace: f.face, align: "left" }); };
  const addLabel = () => { const f = themeState ? fontByLabel(themeState.bodyFont) : FONTS[0]; addEl({ type: "text", x: 360, y: 240, width: 240, height: 64, text: "Label", fontSize: 28, color: "#ffffff", bold: true, align: "center", bg: themeState?.accent || C.blu, font: f.css, fontFace: f.face }); };
  const addRect = () => addEl({ type: "rect", x: 180, y: 160, width: 280, height: 180, fill: C.grnS });
  const addArrow = () => addEl({ type: "arrow", x1: 300, y1: 270, x2: 640, y2: 270, color: C.text, thickness: 6 });
  const addTimer = () => addEl({ type: "timer", x: 340, y: 190, width: 280, height: 150, duration: 300, fill: "#1a1714", color: "#ffffff", fontSize: 72 });
  const addVideo = () => {
    const url = prompt("Video URL (YouTube, Vimeo, or a direct .mp4):");
    if (!url || !url.trim()) return;
    const v = parseVideo(url);
    addEl({ type: "video", x: 200, y: 110, width: 560, height: 315, ...v, title: v.provider === "file" ? "Video" : url.trim() });
  };
  const addVisualiser = () => addEl({ type: "visualiser", x: 260, y: 110, width: 440, height: 300 });
  const addRetrieval = () => addEl({ type: "retrieval", x: 50, y: 90, width: 860, height: 410, url: RET_APP_ORIGIN });
  const addEquation = () => addEl({ type: "equation", x: 280, y: 210, width: 400, height: 120, latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", fontSize: 44, color: themeState?.text || C.text });
  const addChart = () => addEl({ type: "chart", x: 240, y: 120, width: 480, height: 320, chartType: "bar", title: "Results", labels: ["A", "B", "C", "D"], series: [{ name: "Series 1", color: CHART_COLORS[0], values: [4, 7, 3, 6] }], font: (themeState ? fontByLabel(themeState.bodyFont) : FONTS[0]).css, color: themeState?.text || "#1a1714" });
  const addTable = () => {
    const rows = 3, cols = 3;
    const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
    cells[0] = ["Column 1", "Column 2", "Column 3"];
    addEl({ type: "table", x: 110, y: 150, width: 740, height: 280, rows, cols, cells, headerRow: true, fontSize: 22, color: "#1a1714", borderColor: "#9a9486", headerBg: "#1a1714", headerColor: "#ffffff", font: (themeState ? fontByLabel(themeState.bodyFont) : FONTS[0]).css });
  };

  const [cropping, setCropping] = useState(null); // image id being cropped
  const [charting, setCharting] = useState(null);  // chart id whose data is being edited
  // Click-advance: when on, a click anywhere on the slide jumps to the next slide
  // (for clicking through an imported deck). Turn off to edit. Remembered per browser.
  const [clickThru, setClickThru] = useState(() => { try { return localStorage.getItem("sk_click_advance") !== "0"; } catch { return true; } });
  const toggleClickThru = () => setClickThru((v) => { const n = !v; try { localStorage.setItem("sk_click_advance", n ? "1" : "0"); } catch {} if (n) { setSel(null); setEditing(null); } return n; });
  const applyCrop = (id, crop, natW, natH) => {
    snapshot(false);
    const el = slide.elements.find((e) => e.id === id);
    if (el && natW && natH && crop.w > 0 && crop.h > 0) {
      const ratio = (crop.h * natH) / (crop.w * natW);
      patchEl(id, { crop, height: Math.max(20, Math.round(el.width * ratio)) });
    } else {
      patchEl(id, { crop });
    }
    setCropping(null);
  };

  const delEl = () => { if (sel) { snapshot(false); mapSlide(s => ({ ...s, elements: s.elements.filter(e => e.id !== sel) })); setSel(null); setEditing(null); } };
  const addSlide = () => { snapshot(false); const n = [...slides, { id: uid(), elements: [] }]; commit(n); setCur(n.length - 1); setSel(null); };
  const delSlide = () => {
    if (slides.length < 2) return;
    snapshot(false);
    const n = slides.filter((_, i) => i !== cur);
    commit(n); setCur(Math.max(0, cur - 1)); setSel(null);
  };

  const nudge = (dx, dy) => {
    if (!selEl) return;
    snapshot(true);
    if (selEl.type === "arrow") patchEl(selEl.id, { x1: selEl.x1 + dx, y1: selEl.y1 + dy, x2: selEl.x2 + dx, y2: selEl.y2 + dy });
    else patchEl(selEl.id, { x: selEl.x + dx, y: selEl.y + dy });
  };

  // ── Clipboard + element ops ──
  const clip = useRef(null);
  const cloneOffset = (el, d) => el.type === "arrow"
    ? { x1: el.x1 + d, y1: el.y1 + d, x2: el.x2 + d, y2: el.y2 + d }
    : { x: (el.x || 0) + d, y: (el.y || 0) + d };
  const addClone = (src, d) => {
    snapshot(false);
    const id = uid();
    const copy = { ...src, id, ...cloneOffset(src, d) };
    mapSlide(s => ({ ...s, elements: [...s.elements, copy] }));
    setSel(id); setEditing(null);
  };
  const duplicate = () => { if (selEl) addClone(selEl, 22); };
  const copyEl = () => { if (selEl) clip.current = selEl; };
  const pasteEl = () => { if (clip.current) addClone(clip.current, 26); };
  const bringFront = () => { if (!sel) return; snapshot(false); mapSlide(s => { const el = s.elements.find(e => e.id === sel); return { ...s, elements: [...s.elements.filter(e => e.id !== sel), el] }; }); };
  const sendBack = () => { if (!sel) return; snapshot(false); mapSlide(s => { const el = s.elements.find(e => e.id === sel); return { ...s, elements: [el, ...s.elements.filter(e => e.id !== sel)] }; }); };

  // Lock, centre-on-slide, and format painter.
  const STYLE_KEYS = ["color", "font", "fontFace", "bold", "italic", "align", "bg", "fill", "stroke", "strokeW", "dashed", "radius", "shape", "fontSize", "shadow", "opacity"];
  const styleClip = useRef(null);
  const copyStyle = () => { if (!selEl) return; const s = {}; STYLE_KEYS.forEach((k) => { if (selEl[k] !== undefined) s[k] = selEl[k]; }); styleClip.current = s; forceTick((t) => t + 1); };
  const pasteStyle = () => { if (selEl && styleClip.current) patchH(selEl.id, styleClip.current); };
  const toggleLock = () => { if (sel) patchH(sel, { locked: !selEl.locked }); };
  const centerOnSlide = (axis) => {
    if (!selEl || selEl.type === "arrow") return;
    const w = selEl.width, h = selEl.height || (selEl.fontSize ? selEl.fontSize * 1.5 : 100);
    if (axis === "h") patchH(selEl.id, { x: Math.round((VW - w) / 2) });
    else patchH(selEl.id, { y: Math.round((VH - h) / 2) });
  };

  // Apply a theme to every slide: background + heading/body fonts & colours.
  const applyTheme = (t) => {
    snapshot(false);
    setThemeState(t);
    onThemeChange?.(t);
    const hf = fontByLabel(t.headingFont), bf = fontByLabel(t.bodyFont);
    commit(slides.map((s) => ({
      ...s,
      background: t.bg,
      elements: s.elements.map((e) => {
        if (e.type !== "text") return e;
        const heading = e.bold || (e.fontSize || 0) >= 40;
        const f = heading ? hf : bf;
        if (e.bg) return { ...e, bg: t.accent, color: "#ffffff", font: f.css, fontFace: f.face };
        return { ...e, color: heading ? t.heading : t.text, font: f.css, fontFace: f.face };
      }),
    })));
    setThemeOpen(false);
  };

  // ── Multi-select engine ──
  const groupOf = (id) => { const el = slide.elements.find((e) => e.id === id); if (!el?.groupId) return [id]; return slide.elements.filter((e) => e.groupId === el.groupId).map((e) => e.id); };
  const boxOf = (el) => el.type === "arrow"
    ? { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) }
    : { x: el.x, y: el.y, w: el.width || 0, h: el.height || (el.fontSize ? el.fontSize * 1.5 : 100) };
  const moveEl = (el, dx, dy) => el.type === "arrow"
    ? { ...el, x1: Math.round(el.x1 + dx), y1: Math.round(el.y1 + dy), x2: Math.round(el.x2 + dx), y2: Math.round(el.y2 + dy) }
    : { ...el, x: Math.round(el.x + dx), y: Math.round(el.y + dy) };
  const mapSel = (fn) => mapSlide((s) => ({ ...s, elements: s.elements.map((e) => (selSet.has(e.id) ? fn(e) : e)) }));

  const delSelection = () => { if (!selIds.length) return; snapshot(false); mapSlide((s) => ({ ...s, elements: s.elements.filter((e) => !selSet.has(e.id)) })); setSelIds([]); setEditing(null); };
  const duplicateSelection = () => {
    if (!selIds.length) return; snapshot(false);
    const newIds = []; const copies = selEls.map((e) => { const nid = uid(); newIds.push(nid); return { ...e, id: nid, ...cloneOffset(e, 22) }; });
    mapSlide((s) => ({ ...s, elements: [...s.elements, ...copies] })); setSelIds(newIds); setEditing(null);
  };
  const nudgeSelection = (dx, dy) => { if (!selIds.length) return; snapshot(true); mapSel((e) => moveEl(e, dx, dy)); };
  const bringSelFront = () => { if (!selIds.length) return; snapshot(false); mapSlide((s) => ({ ...s, elements: [...s.elements.filter((e) => !selSet.has(e.id)), ...s.elements.filter((e) => selSet.has(e.id))] })); };
  const sendSelBack = () => { if (!selIds.length) return; snapshot(false); mapSlide((s) => ({ ...s, elements: [...s.elements.filter((e) => selSet.has(e.id)), ...s.elements.filter((e) => !selSet.has(e.id))] })); };
  const groupSel = () => { if (selIds.length < 2) return; snapshot(false); const gid = "grp" + uid(); mapSel((e) => ({ ...e, groupId: gid })); };
  const ungroupSel = () => { const gids = new Set(selEls.map((e) => e.groupId).filter(Boolean)); if (!gids.size) return; snapshot(false); mapSlide((s) => ({ ...s, elements: s.elements.map((e) => (gids.has(e.groupId) ? { ...e, groupId: null } : e)) })); };

  const alignSel = (how) => {
    if (selIds.length < 2) return; snapshot(false);
    const bs = selEls.map((e) => boxOf(e));
    const minX = Math.min(...bs.map((b) => b.x)), maxX = Math.max(...bs.map((b) => b.x + b.w));
    const minY = Math.min(...bs.map((b) => b.y)), maxY = Math.max(...bs.map((b) => b.y + b.h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    mapSel((e) => { const b = boxOf(e); let dx = 0, dy = 0;
      if (how === "left") dx = minX - b.x; else if (how === "right") dx = maxX - (b.x + b.w); else if (how === "cx") dx = cx - (b.x + b.w / 2);
      else if (how === "top") dy = minY - b.y; else if (how === "bottom") dy = maxY - (b.y + b.h); else if (how === "cy") dy = cy - (b.y + b.h / 2);
      return moveEl(e, dx, dy);
    });
  };
  const distributeSel = (axis) => {
    if (selIds.length < 3) return; snapshot(false);
    const arr = selEls.map((e) => ({ e, b: boxOf(e) })).sort((a, z) => axis === "h" ? a.b.x - z.b.x : a.b.y - z.b.y);
    const first = arr[0].b, last = arr[arr.length - 1].b;
    const step = (axis === "h" ? last.x - first.x : last.y - first.y) / (arr.length - 1);
    const target = {}; arr.forEach((o, i) => { target[o.e.id] = (axis === "h" ? first.x : first.y) + step * i; });
    mapSel((e) => { const b = boxOf(e); return axis === "h" ? moveEl(e, target[e.id] - b.x, 0) : moveEl(e, 0, target[e.id] - b.y); });
  };

  // Smart guides: snap a single dragged box to other elements' / the slide's edges & centres.
  const SNAP = 8;
  const computeSnap = (movingId, b) => {
    const xs = [0, VW / 2, VW], ys = [0, VH / 2, VH];
    slide.elements.forEach((e) => { if (e.id === movingId || selSet.has(e.id)) return; const o = boxOf(e); xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); });
    let dX = 0, gx = null, bX = SNAP;
    [b.x, b.x + b.w / 2, b.x + b.w].forEach((ex) => xs.forEach((t) => { const d = Math.abs(ex - t); if (d < bX) { bX = d; dX = t - ex; gx = t; } }));
    let dY = 0, gy = null, bY = SNAP;
    [b.y, b.y + b.h / 2, b.y + b.h].forEach((ey) => ys.forEach((t) => { const d = Math.abs(ey - t); if (d < bY) { bY = d; dY = t - ey; gy = t; } }));
    const gl = []; if (gx !== null) gl.push({ type: "v", pos: gx }); if (gy !== null) gl.push({ type: "h", pos: gy });
    return { dX, dY, guides: gl };
  };

  const startMarquee = (e) => {
    // A clean click on empty canvas (nothing selected / not typing) flips to the
    // next slide — lets you click through an imported deck. A drag still box-selects.
    const wasBusy = editing != null || selIds.length > 0;
    setEditing(null);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) { if (!e.shiftKey) setSelIds([]); return; }
    const sx = (e.clientX - rect.left) / scale, sy = (e.clientY - rect.top) / scale;
    let moved = false;
    const move = (ev) => { const cx = (ev.clientX - rect.left) / scale, cy = (ev.clientY - rect.top) / scale; moved = true; setMarquee({ x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) }); };
    const up = () => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      setMarquee((m) => {
        if (!moved || !m || (m.w < 5 && m.h < 5)) {
          if (!e.shiftKey) setSelIds([]);
          // not a drag, nothing was selected/being edited → advance a slide
          if (!moved && !wasBusy && !e.shiftKey && cur < slides.length - 1) { setCur(cur + 1); setEditing(null); }
          return null;
        }
        const expanded = new Set();
        slide.elements.forEach((el) => { const b = boxOf(el); if (b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y) groupOf(el.id).forEach((i) => expanded.add(i)); });
        setSelIds(e.shiftKey ? [...new Set([...selIds, ...expanded])] : [...expanded]);
        return null;
      });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const startRotate = (e, el) => {
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return;
    const w = el.width, h = el.height || (el.fontSize ? el.fontSize * 1.5 : 100);
    const cxs = rect.left + (el.x + w / 2) * scale, cys = rect.top + (el.y + h / 2) * scale;
    let took = false;
    const move = (ev) => {
      if (!took) { snapshot(false); took = true; }
      let deg = Math.atan2(ev.clientY - cys, ev.clientX - cxs) * 180 / Math.PI + 90;
      deg = ((deg + 180) % 360 + 360) % 360 - 180;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      else { const near = [-180, -90, 0, 90, 180].find((a) => Math.abs(deg - a) < 5); if (near !== undefined) deg = near; }
      patchEl(el.id, { rotation: Math.round(deg) });
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  // ── Slide ops ──
  const cloneSlide = (s) => ({ id: uid(), background: s.background, notes: s.notes, elements: (s.elements || []).map(e => ({ ...e, id: uid() })) });
  const duplicateSlide = () => { snapshot(false); const n = [...slides]; n.splice(cur + 1, 0, cloneSlide(slide)); commit(n); setCur(cur + 1); setSel(null); };
  const dragIdx = useRef(null);
  const reorderSlide = (to) => { const from = dragIdx.current; dragIdx.current = null; if (from == null || from === to) return; snapshot(false); const n = [...slides]; const [m] = n.splice(from, 1); n.splice(to, 0, m); commit(n); setCur(to); setSel(null); };
  const insertTemplate = (idx) => {
    const tpl = TEMPLATES[idx]; if (!tpl) return;
    snapshot(false);
    const b = tpl.build();
    const s = { id: uid(), background: b.background, elements: (b.elements || []).map(e => ({ id: uid(), ...e })) };
    const n = [...slides]; n.splice(cur + 1, 0, s); commit(n); setCur(cur + 1); setSel(null); setEditing(null);
  };

  // ── Ask Claude: edits the whole deck live via the slides-assistant route ──
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const aiPrev = useRef(null); // previous slides, for one-step undo

  // Claude may name a font by label; map it back to the css/face the editor uses.
  const normalize = (sl) => (sl || []).map((s) => ({
    id: s.id || uid(),
    background: s.background,
    elements: (s.elements || []).map((e) => {
      const el = { ...e, id: e.id || uid() };
      if ((el.type === "text" || el.type === "table") && el.font) {
        const f = FONTS.find((x) => x.label === el.font || x.css === el.font);
        if (f) { el.font = f.css; el.fontFace = f.face; }
      }
      return el;
    }),
  }));

  const askClaude = async () => {
    const instruction = aiInput.trim();
    if (!instruction || aiBusy) return;
    setAiBusy(true); setAiMsg("");
    try {
      const r = await fetch("/api/slides-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides, currentSlide: cur, instruction }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Request failed");
      const next = normalize(d.slides);
      if (!next.length) throw new Error("No slides returned");
      aiPrev.current = slides;
      snapshot(false);
      commit(next);
      setCur((c) => Math.min(c, next.length - 1));
      setSel(null); setEditing(null);
      setAiMsg(d.summary || "Done.");
      setAiInput("");
    } catch (e) {
      setAiMsg("⚠ " + e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const undoAI = () => {
    if (!aiPrev.current) return;
    commit(aiPrev.current);
    aiPrev.current = null;
    setSel(null); setEditing(null);
    setAiMsg("Reverted Claude's last change.");
  };

  const AI_QUICK = [
    "Make a title slide for today's lesson",
    "Add 3 key facts as bullet points",
    "Add a labelled diagram with arrows",
    "Add a Do Now with a 5-minute timer",
    "Add a comparison table",
    "Add an exit-ticket question with the answer hidden until I click",
    "Give this slide a soft tinted background",
  ];

  // Find text across the whole deck; jump to the next slide that contains it.
  const findNext = () => {
    const q = find.trim().toLowerCase();
    if (!q) return;
    const has = (s) => (s.elements || []).some((el) => {
      const hay = [el.text, el.url, ...(el.cells ? el.cells.flat() : [])].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    const n = slides.length;
    for (let off = 1; off <= n; off++) {
      const idx = (cur + off) % n;
      if (has(slides[idx])) { setCur(idx); setSel(null); setEditing(null); return; }
    }
  };

  // Keyboard: Delete removes the selection (or current slide); arrows nudge.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (editing || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
        if (k === "y") { e.preventDefault(); redo(); return; }
        if (k === "d") { e.preventDefault(); duplicateSelection(); return; }
        if (k === "c") { copyEl(); return; }
        if (k === "v") { e.preventDefault(); pasteEl(); return; }
        if (k === "a") { e.preventDefault(); setSelIds(slide.elements.map((el) => el.id)); return; }
        if (k === "=" || k === "+") { e.preventDefault(); zoomBy(0.1); return; }
        if (k === "-" || k === "_") { e.preventDefault(); zoomBy(-0.1); return; }
        if (k === "0") { e.preventDefault(); setZoom(1); return; }
      }
      if (e.key === "?") { e.preventDefault(); setHelpOpen((o) => !o); return; }
      if (e.key === "Escape" && helpOpen) { setHelpOpen(false); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selIds.length) delSelection(); else delSlide();
      } else if (selIds.length && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        nudgeSelection(e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0,
              e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bound each render so it closes over current sel/slides

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = onUploadImage
        ? await onUploadImage(file)
        : await sk.upload(`slides/${deck.id}/${Math.floor(performance.now())}-${file.name.replace(/[^\w.\-]/g, "_")}`, file);
      const probe = new Image();
      probe.onload = () => { const w = 420, h = Math.round(w * (probe.naturalHeight / probe.naturalWidth || 0.66)); addEl({ type: "image", x: 140, y: 120, width: w, height: h, src: url }); };
      probe.onerror = () => addEl({ type: "image", x: 140, y: 120, width: 420, height: 280, src: url });
      probe.src = url;
    } catch (err) { alert("Image upload failed: " + err.message); }
  };

  // Insert an imported HTML page as a full-slide, interactive template element.
  const pickHtml = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const html = await file.text();
      if (!html.trim()) { alert("That HTML file looks empty."); return; }
      const title = file.name.replace(/\.(html?|htm)$/i, "");
      addEl({ type: "html", x: 0, y: 0, width: VW, height: VH, html, title });
    } catch (err) { alert("Couldn't read that HTML file: " + err.message); }
  };

  const startDrag = (e, el) => {
    e.stopPropagation();
    if (editing && editing !== el.id) setEditing(null);
    if (e.shiftKey) {
      const ids = groupOf(el.id);
      setSelIds((cur) => { const s = new Set(cur); const allIn = ids.every((i) => s.has(i)); ids.forEach((i) => (allIn ? s.delete(i) : s.add(i))); return [...s]; });
      return;
    }
    const ids = selSet.has(el.id) ? selIds : groupOf(el.id);
    if (!selSet.has(el.id)) setSelIds(ids);
    if (el.locked) return;
    const originals = {};
    ids.forEach((i) => { originals[i] = slide.elements.find((x) => x.id === i); });
    const single = ids.length === 1 ? originals[ids[0]] : null;
    const sx = e.clientX, sy = e.clientY; let took = false;
    const move = (ev) => {
      if (!took) { snapshot(false); took = true; }
      let dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      if (single && single.type !== "arrow") {
        const h = single.height || (single.fontSize ? single.fontSize * 1.5 : 100);
        const snap = computeSnap(single.id, { x: single.x + dx, y: single.y + dy, w: single.width, h });
        dx += snap.dX; dy += snap.dY; setGuides(snap.guides);
      }
      commit(slides.map((s, si) => (si !== cur ? s : { ...s, elements: s.elements.map((elm) => (originals[elm.id] ? moveEl(originals[elm.id], dx, dy) : elm)) })));
    };
    const up = () => { setGuides([]); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const startResize = (e, el, fx, fy) => {
    e.stopPropagation();
    if (el.locked) return;
    const hx = fx === 0 ? -1 : fx === 1 ? 1 : 0;
    const hy = fy === 0 ? -1 : fy === 1 ? 1 : 0;
    const sx = e.clientX, sy = e.clientY;
    const ox = el.x, oy = el.y, ow = el.width, oh = el.height || (el.fontSize ? el.fontSize * 1.5 : 100); let took = false;
    const move = (ev) => {
      if (!took) { snapshot(false); took = true; }
      const vx = (ev.clientX - sx) / scale, vy = (ev.clientY - sy) / scale;
      let x = ox, y = oy, w = ow, h = oh;
      if (hx === -1) { w = ow - vx; x = ox + vx; if (w < MIN) { x = ox + ow - MIN; w = MIN; } }
      if (hx === 1) w = Math.max(MIN, ow + vx);
      if (hy === -1) { h = oh - vy; y = oy + vy; if (h < MIN) { y = oy + oh - MIN; h = MIN; } }
      if (hy === 1) h = Math.max(MIN, oh + vy);
      // Images keep their proportions on a corner drag (hold ⇧ to free-resize),
      // so photos and diagrams don't get stretched. The anchored corner stays put.
      if (el.type === "image" && hx !== 0 && hy !== 0 && !ev.shiftKey && oh) {
        const aspect = ow / oh;
        h = w / aspect;
        if (h < MIN) { h = MIN; w = h * aspect; }
        if (hx === -1) x = ox + ow - w;
        if (hy === -1) y = oy + oh - h;
      }
      patchEl(el.id, { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const startArrowDrag = (e, el) => {
    e.stopPropagation();
    if (e.shiftKey) { setSelIds((cur) => { const s = new Set(cur); s.has(el.id) ? s.delete(el.id) : s.add(el.id); return [...s]; }); return; }
    setSel(el.id);
    if (el.locked) return;
    const sx = e.clientX, sy = e.clientY, o = { x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2 }; let took = false;
    const move = (ev) => { if (!took) { snapshot(false); took = true; } const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      patchEl(el.id, { x1: Math.round(o.x1 + dx), y1: Math.round(o.y1 + dy), x2: Math.round(o.x2 + dx), y2: Math.round(o.y2 + dy) }); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const startArrowEnd = (e, el, which) => {
    e.stopPropagation();
    setSel(el.id);
    const sx = e.clientX, sy = e.clientY; let took = false;
    const ox = which === "a" ? el.x1 : el.x2, oy = which === "a" ? el.y1 : el.y2;
    const move = (ev) => { if (!took) { snapshot(false); took = true; } const nx = Math.round(ox + (ev.clientX - sx) / scale), ny = Math.round(oy + (ev.clientY - sy) / scale);
      patchEl(el.id, which === "a" ? { x1: nx, y1: ny } : { x2: nx, y2: ny }); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  // Grouped insert menu — replaces the old flat row of ten "+" buttons.
  const INSERT_GROUPS = [
    [
      { icon: "T", label: "Text", run: addText },
      { icon: "▸", label: "Label", run: addLabel },
      { icon: "▭", label: "Box", run: addRect },
      { icon: "▦", label: "Table", run: addTable },
      { icon: "↘", label: "Arrow", run: addArrow },
      { icon: "∑", label: "Equation", run: addEquation },
      { icon: "▥", label: "Chart", run: addChart },
    ],
    [
      { icon: "▣", label: "Image", run: () => fileRef.current?.click() },
      { icon: "▶", label: "Video", run: addVideo },
      { icon: "◉", label: "Visualiser", run: addVisualiser },
      { icon: "❮❯", label: "HTML file", run: () => htmlRef.current?.click() },
    ],
    [
      { icon: "⏱", label: "Timer", run: addTimer },
      { icon: "✦", label: "Retrieval", run: addRetrieval },
    ],
  ];

  return (
    <>
    <div style={{ display: "flex", gap: 14, height: "100%", fontFamily: C.mono, minHeight: 0 }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: "none" }} />
      <input ref={htmlRef} type="file" accept=".html,.htm,text/html" onChange={pickHtml} style={{ display: "none" }} />

      {/* slide rail */}
      <div style={{ width: 500, flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {slides.map((s, i) => (
          <button key={s.id} onClick={() => { setCur(i); setSel(null); setEditing(null); }}
            draggable
            onDragStart={() => { dragIdx.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => reorderSlide(i)}
            title="Drag to reorder"
            onMouseEnter={(e) => { if (i !== cur) e.currentTarget.style.borderColor = C.accent; }}
            onMouseLeave={(e) => { if (i !== cur) e.currentTarget.style.borderColor = C.border; }}
            style={{ position: "relative", padding: 0, background: "#fff", borderRadius: 8, cursor: "pointer",
                     overflow: "hidden", lineHeight: 0, transition: "border-color .12s, box-shadow .12s",
                     border: `2px solid ${i === cur ? C.accent : C.border}`,
                     boxShadow: i === cur ? `0 0 0 3px ${C.accent}22` : "none" }}>
            <StaticSlide slide={s} width={492} master={masterState} index={i} total={slides.length} title={deck.title} />
            <span style={{ position: "absolute", bottom: 3, left: 4, fontSize: 9, fontWeight: 600, color: i === cur ? C.accent : C.dim, background: "rgba(255,255,255,.82)", borderRadius: 3, padding: "0 3px", lineHeight: 1.4 }}>{i + 1}</span>
            {s.notes ? <span title="Has speaker notes" style={{ position: "absolute", top: 3, right: 4, fontSize: 10, lineHeight: 1 }}>🗒</span> : null}
          </button>
        ))}
        <Btn v="soft" onClick={addSlide}>+ Slide</Btn>
        <select value="" onChange={(e) => { if (e.target.value !== "") { insertTemplate(+e.target.value); e.target.value = ""; } }}
          style={{ padding: "7px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 11, background: C.bg, color: C.text, cursor: "pointer" }}>
          <option value="" disabled>+ Template…</option>
          {TEMPLATES.map((t, idx) => <option key={t.label} value={idx}>{t.label}</option>)}
        </select>
        <Btn v="ghost" onClick={duplicateSlide}>Duplicate slide</Btn>
      </div>

      {/* editor column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        {/* toolbar — one calm, grouped row. Selection & style controls live in the right panel. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Btn v="ghost" onClick={undo} disabled={!histPast.current.length} title="Undo (⌘Z)">↶</Btn>
          <Btn v="ghost" onClick={redo} disabled={!histFuture.current.length} title="Redo (⌘⇧Z)">↷</Btn>
          <Sep />
          {/* Insert menu — one button in place of the old ten */}
          <div style={{ position: "relative" }}>
            <Btn v={insertOpen ? "pri" : "soft"} onClick={() => setInsertOpen((o) => !o)} title="Add to slide">＋ Insert ▾</Btn>
            {insertOpen && (
              <>
                <div onClick={() => setInsertOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41, width: 196, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 10px 32px rgba(0,0,0,0.16)", padding: 6 }}>
                  {INSERT_GROUPS.map((grp, gi) => (
                    <div key={gi} style={{ marginBottom: gi < INSERT_GROUPS.length - 1 ? 5 : 0, paddingBottom: gi < INSERT_GROUPS.length - 1 ? 5 : 0, borderBottom: gi < INSERT_GROUPS.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      {grp.map((item) => (
                        <button key={item.label} onClick={() => { setInsertOpen(false); item.run(); }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "7px 9px", border: "none", background: "transparent", borderRadius: 5, cursor: "pointer", fontFamily: C.sans, fontSize: 13, color: C.text }}>
                          <span style={{ width: 18, textAlign: "center", fontSize: 14, color: C.muted }}>{item.icon}</span>{item.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <Btn v="ghost" onClick={() => zoomBy(-0.1)} title="Zoom out (⌘−)">−</Btn>
            <button onClick={() => setZoom(1)} title="Reset to fit (⌘0)"
              style={{ minWidth: 48, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.mono, fontSize: 12, cursor: "pointer" }}>{Math.round(scale * 100)}%</button>
            <Btn v="ghost" onClick={() => zoomBy(0.1)} title="Zoom in (⌘+)">+</Btn>
          </div>
          <input value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") findNext(); }}
            placeholder="Find…" title="Find text across all slides (Enter = next match)"
            style={{ width: 104, padding: "6px 9px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: "#fff", color: C.text, outline: "none" }} />
          <Btn v="ghost" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">?</Btn>
          <Sep />
          <Btn v={clickThru ? "pri" : "ghost"} onClick={toggleClickThru} title="When on, click anywhere on the slide to go to the next slide. Turn off to edit.">{clickThru ? "🖱 Click → next: on" : "🖱 Click → next: off"}</Btn>
          <Btn v={themeOpen ? "pri" : "soft"} onClick={() => openPanel("theme")} title="Deck theme">🎨 Theme</Btn>
          <Btn v={masterOpen ? "pri" : "soft"} onClick={() => openPanel("brand")} title="Header / footer brand frame">🏷 Brand</Btn>
          <Btn v={aiOpen ? "pri" : "soft"} onClick={() => openPanel("claude")} title="Ask Claude">✦ Claude</Btn>
          <Btn v="ghost" onClick={delSlide} disabled={slides.length < 2} title="Delete this slide">🗑</Btn>
        </div>

        {/* stage */}
        <div ref={wrapRef} style={{ flex: 1, overflow: "auto", background: C.bg, borderRadius: 8, padding: 16 }}>
          <div style={{ width: VW * scale, height: VH * scale, position: "relative", margin: "auto" }}>
            <div ref={stageRef} onMouseDown={startMarquee}
              style={{ width: VW, height: VH, position: "absolute", top: 0, left: 0,
                       transform: `scale(${scale})`, transformOrigin: "top left",
                       background: slide.background || "#fff", boxShadow: "0 2px 16px rgba(0,0,0,.12)", overflow: "hidden" }}>
              {!slide.hideMaster && masterState?.enabled && <MasterFrame master={masterState} index={cur} total={slides.length} title={deck.title} />}
              {slide.elements.map(el => {
                if (el.type === "arrow")
                  return <ArrowSvg key={el.id} el={el} selected={selSet.has(el.id)} hitProps={{ onMouseDown: (e) => startArrowDrag(e, el) }} />;
                if (editing === el.id && el.type === "text")
                  return <TextEditor key={el.id} el={el} apiRef={editorApi}
                    onText={(text, rich) => patchEl(el.id, { text, rich: rich || null })}
                    onDone={() => setEditing(null)} />;
                if (editing === el.id && el.type === "table")
                  return (
                    <div key={el.id} style={{ ...elStyle(el), outline: `2px solid ${C.accent}`, outlineOffset: 1 }}>
                      <TableEditor el={el} onCells={(cells) => patchEl(el.id, { cells })} />
                    </div>
                  );
                return (
                  <div key={el.id}
                    onMouseDown={(e) => startDrag(e, el)}
                    onDoubleClick={(el.type === "text" || el.type === "table") ? () => { setSel(el.id); setEditing(el.id); } : undefined}
                    style={{ ...elStyle(el), cursor: "move", opacity: el.reveal && !selSet.has(el.id) ? 0.55 : (el.opacity ?? 1),
                             outline: selSet.has(el.id) ? `2px solid ${C.accent}` : el.reveal ? `1.5px dashed ${C.dim}` : "none", outlineOffset: 1 }}>
                    <ElInner el={el} />
                  </div>
                );
              })}

              {/* box resize handles */}
              {selEl && selEl.type !== "arrow" && editing !== selEl.id && !selEl.locked && !selEl.rotation && HANDLES.map(([name, fx, fy]) => {
                const h = selEl.height || (selEl.fontSize ? selEl.fontSize * 1.5 : 100);
                const sz = HANDLE_PX / scale;
                return (
                  <div key={name} onMouseDown={(e) => startResize(e, selEl, fx, fy)}
                    style={{ position: "absolute", left: fin(selEl.x + fx * selEl.width - sz / 2), top: fin(selEl.y + fy * h - sz / 2),
                             width: sz, height: sz, background: "#fff", border: `${1.5 / scale}px solid ${C.accent}`,
                             borderRadius: 2, cursor: CURSORS[name], boxSizing: "border-box" }} />
                );
              })}

              {/* arrow endpoint handles */}
              {selEl && selEl.type === "arrow" && !selEl.locked && [["a", selEl.x1, selEl.y1], ["b", selEl.x2, selEl.y2]].map(([k, px, py]) => {
                const sz = (HANDLE_PX + 2) / scale;
                return (
                  <div key={k} onMouseDown={(e) => startArrowEnd(e, selEl, k)}
                    style={{ position: "absolute", left: fin(px - sz / 2), top: fin(py - sz / 2), width: sz, height: sz,
                             background: "#fff", border: `${1.5 / scale}px solid ${C.accent}`, borderRadius: "50%", cursor: "move" }} />
                );
              })}

              {/* rotate handle (single box element) */}
              {selEl && selEl.type !== "arrow" && editing !== selEl.id && !selEl.locked && (() => {
                const w = selEl.width, h = selEl.height || (selEl.fontSize ? selEl.fontSize * 1.5 : 100);
                const cx = selEl.x + w / 2, cy = selEl.y + h / 2;
                const rad = (selEl.rotation || 0) * Math.PI / 180;
                const ly = -(h / 2 + 26);
                const hx = cx - ly * Math.sin(rad), hy = cy + ly * Math.cos(rad);
                const sz = (HANDLE_PX + 3) / scale;
                return (
                  <div key="rot" onMouseDown={(e) => startRotate(e, selEl)} title="Drag to rotate (Shift = 15°)"
                    style={{ position: "absolute", left: fin(hx - sz / 2), top: fin(hy - sz / 2), width: sz, height: sz,
                             background: "#fff", border: `${1.5 / scale}px solid ${C.accent}`, borderRadius: "50%", cursor: "grab" }} />
                );
              })()}

              {/* smart-align guide lines */}
              {guides.map((g, i) => g.type === "v"
                ? <div key={"g" + i} style={{ position: "absolute", left: fin(g.pos), top: 0, width: 1 / scale, height: VH, background: "#e23b2e", pointerEvents: "none" }} />
                : <div key={"g" + i} style={{ position: "absolute", top: fin(g.pos), left: 0, height: 1 / scale, width: VW, background: "#e23b2e", pointerEvents: "none" }} />
              )}

              {/* marquee rectangle */}
              {marquee && <div style={{ position: "absolute", left: fin(marquee.x), top: fin(marquee.y), width: fin(marquee.w), height: fin(marquee.h), border: `${1 / scale}px solid ${C.accent}`, background: `${C.accent}14`, pointerEvents: "none" }} />}

              {/* click-advance overlay — sits on top so a click anywhere flips to the next slide */}
              {clickThru && (
                <div title="Click → next slide. Turn off “Click → next” in the toolbar to edit."
                  onMouseDown={(e) => { e.stopPropagation(); setSel(null); setEditing(null); if (cur < slides.length - 1) setCur(cur + 1); }}
                  style={{ position: "absolute", inset: 0, zIndex: 50, cursor: "pointer" }} />
              )}
            </div>
          </div>
        </div>

        {/* speaker notes */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: C.dim, paddingTop: 7, flexShrink: 0 }}>Notes</span>
          <textarea value={slide.notes || ""} onChange={(e) => setNotes(e.target.value)}
            placeholder="Speaker notes for this slide — shown in Presenter view, never on the screen."
            rows={2}
            style={{ flex: 1, resize: "vertical", padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 6,
                     fontFamily: C.sans, fontSize: 12.5, lineHeight: 1.4, background: C.surface, color: C.text, outline: "none" }} />
        </div>
      </div>

      {/* right panel — Claude / Theme / Brand / selection inspector. Always mounted at a fixed
          width, so selecting an element or opening a panel never reflows or rescales the canvas. */}
      <div style={{ width: 272, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12,
                    borderLeft: `1px solid ${C.border}`, paddingLeft: 14, overflowY: "auto" }}>
        {aiOpen ? (
          <>
            <PanelLabel>✦ Ask Claude</PanelLabel>
            <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) askClaude(); }}
              placeholder="Tell Claude what to make, e.g. “a title slide about photosynthesis, then 3 key facts”"
              rows={5}
              style={{ width: "100%", resize: "vertical", padding: "9px 11px", border: `1px solid ${C.border}`,
                       borderRadius: 6, fontFamily: C.sans, fontSize: 13, lineHeight: 1.4, background: "#fff", color: C.text, outline: "none" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={askClaude} disabled={aiBusy || !aiInput.trim()} style={{ flex: 1 }}>
                {aiBusy ? "thinking…" : "Generate"}
              </Btn>
              <Btn v="ghost" onClick={undoAI} disabled={!aiPrev.current}>Undo</Btn>
            </div>
            {aiMsg && (
              <div style={{ fontSize: 12, lineHeight: 1.45, color: aiMsg.startsWith("⚠") ? C.red : C.muted }}>{aiMsg}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
              {AI_QUICK.map((q) => (
                <button key={q} onClick={() => setAiInput(q)}
                  style={{ textAlign: "left", padding: "6px 9px", border: `1px solid ${C.border}`, borderRadius: 6,
                           background: C.surface, color: C.muted, fontFamily: C.sans, fontSize: 12, cursor: "pointer" }}>
                  {q}
                </button>
              ))}
            </div>
            <div style={{ marginTop: "auto", fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
              Claude edits the whole deck live — it can add slides, text, boxes, arrows and labels. It can’t create images. Press ⌘/Ctrl+Enter to send.
            </div>
          </>
        ) : themeOpen ? (
          <>
            <PanelLabel>Deck theme</PanelLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {THEMES.map((t) => (
                <button key={t.name} onClick={() => applyTheme(t)} title={`Apply ${t.name} to all slides`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                           border: `1px solid ${themeState?.name === t.name ? C.accent : C.border}`, background: themeState?.name === t.name ? C.bg : "#fff", fontFamily: C.sans, fontSize: 13, color: C.text }}>
                  <span style={{ display: "inline-flex", flexShrink: 0 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: t.bg, border: `1px solid ${C.border}` }} />
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: t.accent, marginLeft: -5, border: `1px solid ${C.border}` }} />
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>Sets the background, fonts and colours on every slide.</div>
          </>
        ) : masterOpen ? (() => {
          const m = masterState || DEFAULT_MASTER;
          const on = !!(masterState && m.enabled);
          const fld = (label, key) => (
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
              <input value={m[key] || ""} onChange={(e) => updateMaster({ [key]: e.target.value })} disabled={!on}
                style={{ padding: "5px 7px", border: `1px solid ${C.border}`, borderRadius: 5, fontFamily: C.sans, fontSize: 12, background: on ? "#fff" : C.bg, color: C.text, outline: "none" }} />
            </label>
          );
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <PanelLabel>Brand frame</PanelLabel>
                <Btn v={on ? "pri" : "soft"} onClick={() => updateMaster({ enabled: !on })}>{on ? "✓ On" : "Off"}</Btn>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!slide.hideMaster} onChange={(e) => setHideMaster(e.target.checked)} />
                  Hide here
                </label>
              </div>
              <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>Header &amp; footer on every slide · tokens: {"{n}"} {"{total}"} {"{title}"} {"{date}"}</div>
              {fld("Header left", "headerLeft")}{fld("Header centre", "headerCenter")}{fld("Header right", "headerRight")}
              {fld("Footer left", "footerLeft")}{fld("Footer centre", "footerCenter")}{fld("Footer right", "footerRight")}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted }}>
                  Text <input type="color" value={m.color || "#6b6256"} onChange={(e) => updateMaster({ color: e.target.value })} disabled={!on} style={{ width: 28, height: 24, border: "none", background: "none", cursor: "pointer" }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted }}>
                  Rule <input type="color" value={m.accent || "#b95a3c"} onChange={(e) => updateMaster({ accent: e.target.value })} disabled={!on || !m.showRule} style={{ width: 28, height: 24, border: "none", background: "none", cursor: "pointer" }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!m.showRule} onChange={(e) => updateMaster({ showRule: e.target.checked })} disabled={!on} />
                  Rule line
                </label>
              </div>
            </>
          );
        })() : (
          <>
            {/* selection inspector — style + arrange in one place; nothing here reflows the canvas */}
            {editing && edEl?.type === "text" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                <button title="Smaller (as you type)"
                  onMouseDown={(e) => { e.preventDefault(); if (edEl) patchH(editing, { fontSize: Math.max(8, (edEl.fontSize || 40) - 4) }); }}
                  style={{ height: 26, padding: "0 9px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 13, cursor: "pointer" }}>A−</button>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, minWidth: 22, textAlign: "center" }}>{edEl?.fontSize || 40}</span>
                <button title="Bigger (as you type)"
                  onMouseDown={(e) => { e.preventDefault(); if (edEl) patchH(editing, { fontSize: (edEl.fontSize || 40) + 4 }); }}
                  style={{ height: 26, padding: "0 9px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 15, cursor: "pointer" }}>A+</button>
                <Sep />
                {/* inline formatting — acts on the current selection while editing */}
                {(() => { const fb = { height: 26, minWidth: 26, padding: "0 7px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, cursor: "pointer", fontSize: 14 }; return (
                  <>
                    <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.bold(); }} title="Bold (⌘B)" style={{ ...fb, fontWeight: 700 }}>B</button>
                    <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.italic(); }} title="Italic (⌘I)" style={{ ...fb, fontStyle: "italic" }}>I</button>
                    <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.bullet(); }} title="Bulleted list" style={fb}>•≡</button>
                    <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.number(); }} title="Numbered list" style={fb}>1.≡</button>
                    <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.outdent(); }} title="Decrease indent" style={fb}>⇤</button>
                    <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.indent(); }} title="Increase indent" style={fb}>⇥</button>
                    {["#1a1714", "#b95a3c", "#2c5f2d", "#1e2761", "#c9a227"].map((c) => (
                      <button key={c} onMouseDown={(e) => { e.preventDefault(); editorApi.current?.color(c); }} title={`Colour selection ${c}`}
                        style={{ width: 20, height: 20, borderRadius: "50%", border: `1px solid ${C.border}`, background: c, cursor: "pointer", padding: 0 }} />
                    ))}
                  </>
                ); })()}
                <Sep />
                {[...SYMBOLS, ...STATES].map((sym) => (
                  <button key={sym} title="Insert at cursor"
                    onMouseDown={(e) => { e.preventDefault(); editorApi.current?.insert(sym); }}
                    style={{ minWidth: 26, height: 26, padding: "0 6px", borderRadius: 4, border: `1px solid ${C.border}`,
                             background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>{sym}</button>
                ))}
                <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.subSup("sub"); }} title="Subscript selection (⌘,)"
                  style={{ height: 26, padding: "0 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>x₂</button>
                <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.subSup("sup"); }} title="Superscript selection (⌘.)"
                  style={{ height: 26, padding: "0 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>x²</button>
              </div>
            )}

            <PropsBar selEl={selEl} slide={slide} patchEl={patchH} setSlideBg={setSlideBg}
              onCrop={() => selEl && setCropping(selEl.id)} onResetCrop={() => selEl && patchH(selEl.id, { crop: null })}
              onEditChart={() => selEl && setCharting(selEl.id)} />

            {sel && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <PanelLabel>Arrange</PanelLabel>
                <Btn v="ghost" onClick={duplicateSelection} title="Duplicate (⌘D)">Duplicate</Btn>
                <Btn v="ghost" onClick={bringSelFront} title="Bring to front">Front</Btn>
                <Btn v="ghost" onClick={sendSelBack} title="Send to back">Back</Btn>
                <Btn v={selEl?.locked ? "pri" : "ghost"} onClick={toggleLock}>{selEl?.locked ? "🔒 Locked" : "Lock"}</Btn>
                <Btn v={selEl?.reveal ? "pri" : "ghost"} onClick={() => sel && patchH(sel, { reveal: !selEl.reveal })} title="Hidden until clicked in Present">Reveal</Btn>
                <Btn v="ghost" onClick={() => centerOnSlide("h")} disabled={selEl?.type === "arrow"}>Centre ⬄</Btn>
                <Btn v="ghost" onClick={() => centerOnSlide("v")} disabled={selEl?.type === "arrow"}>Centre ⬍</Btn>
                {selEl?.rotation ? <Btn v="ghost" onClick={() => patchH(sel, { rotation: 0 })}>↺ {selEl.rotation}°</Btn> : null}
                <Btn v="ghost" onClick={copyStyle}>Copy style</Btn>
                <Btn v="ghost" onClick={pasteStyle} disabled={!styleClip.current}>Paste style</Btn>
                <Btn v="ghost" onClick={delSelection}>Delete</Btn>
              </div>
            )}

            {selIds.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <PanelLabel>{selIds.length} selected</PanelLabel>
                <Btn v="ghost" onClick={() => alignSel("left")} title="Align left">⬅</Btn>
                <Btn v="ghost" onClick={() => alignSel("cx")} title="Align centre">↔</Btn>
                <Btn v="ghost" onClick={() => alignSel("right")} title="Align right">➡</Btn>
                <Btn v="ghost" onClick={() => alignSel("top")} title="Align top">⬆</Btn>
                <Btn v="ghost" onClick={() => alignSel("cy")} title="Align middle">↕</Btn>
                <Btn v="ghost" onClick={() => alignSel("bottom")} title="Align bottom">⬇</Btn>
                <Btn v="ghost" onClick={() => distributeSel("h")} disabled={selIds.length < 3} title="Distribute horizontally">Dist ⬄</Btn>
                <Btn v="ghost" onClick={() => distributeSel("v")} disabled={selIds.length < 3} title="Distribute vertically">Dist ⬍</Btn>
                <Btn v="ghost" onClick={groupSel}>Group</Btn>
                <Btn v="ghost" onClick={ungroupSel}>Ungroup</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    {cropping && (() => {
      const el = slide.elements.find((e) => e.id === cropping);
      return el ? <CropModal el={el} onApply={(crop, w, h) => applyCrop(cropping, crop, w, h)} onCancel={() => setCropping(null)} /> : null;
    })()}
    {charting && (() => {
      const el = slide.elements.find((e) => e.id === charting);
      return el ? <ChartDataModal el={el} onApply={(patch) => { patchH(charting, patch); setCharting(null); }} onCancel={() => setCharting(null)} /> : null;
    })()}
    {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </>
  );
}

/* Keyboard-shortcut cheat sheet (press ?). Surfaces the editor's many shortcuts,
   which were previously undiscoverable. */
const SHORTCUTS = [
  ["Editing", [
    ["Undo / Redo", "⌘Z / ⌘⇧Z"],
    ["Duplicate selection", "⌘D"],
    ["Copy / Paste element", "⌘C / ⌘V"],
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
  ]],
  ["General", [
    ["Edit text / table", "Double-click"],
    ["Find text in deck", "Find box · Enter"],
    ["This cheat sheet", "?"],
    ["Close overlay", "Esc"],
  ]],
];
function ShortcutHelp({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "22px 26px", maxWidth: 640, width: "100%", boxShadow: "0 12px 48px rgba(0,0,0,0.3)", fontFamily: C.sans }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: C.serif, fontSize: 22, color: C.text }}>Keyboard shortcuts</div>
          <button onClick={onClose} style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Esc</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "18px 28px" }}>
          {SHORTCUTS.map(([group, rows]) => (
            <div key={group}>
              <div style={{ fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: C.accent, marginBottom: 8 }}>{group}</div>
              {rows.map(([label, keys]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: C.text, padding: "3px 0" }}>
                  <span style={{ color: C.muted }}>{label}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, whiteSpace: "nowrap" }}>{keys}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Properties bar: element controls, or slide controls when nothing is selected ── */
function PropsBar({ selEl, slide, patchEl, setSlideBg, onCrop, onResetCrop, onEditChart }) {
  const wrap = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 12px",
                 background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.muted };
  const tag = (t) => <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10, color: C.dim }}>{t}</span>;
  const color = (val, on) => <input type="color" value={val} onChange={(e) => on(e.target.value)} style={{ width: 30, height: 24, border: "none", background: "none", cursor: "pointer", padding: 0 }} />;
  const num = (val, on) => <input type="number" value={val} onChange={(e) => on(+e.target.value || 1)} style={{ width: 52, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12 }} />;
  const toggle = (active, label, on) => (
    <button onClick={on} style={{ width: 28, height: 26, borderRadius: 4, cursor: "pointer", fontSize: 13,
      border: `1px solid ${active ? C.accent : C.border}`, background: active ? C.bg : "#fff", color: C.text,
      fontWeight: label === "B" ? 700 : 400, fontStyle: label === "I" ? "italic" : "normal" }}>{label}</button>
  );

  if (!selEl) {
    const hex = slide.background?.startsWith?.("#") ? slide.background : "#ffffff";
    return (
      <div style={wrap}>
        {tag("slide")}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>background {color(hex, setSlideBg)}</label>
        <button onClick={() => setSlideBg("#ffffff")} style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>white</button>
        <span style={{ color: C.dim }}>· click an element to style it · Delete to remove · arrows to nudge</span>
      </div>
    );
  }

  const P = (patch) => patchEl(selEl.id, patch);
  const selStyle = { padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12, background: "#fff" };
  const pill = (active) => ({ height: 26, padding: "0 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, border: `1px solid ${active ? C.accent : C.border}`, background: active ? C.bg : "#fff", color: C.text });
  const opacityCtl = (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>opacity
      <input type="range" min={20} max={100} value={Math.round((selEl.opacity ?? 1) * 100)} onChange={(e) => P({ opacity: +e.target.value / 100 })} style={{ width: 70 }} />
    </label>
  );

  if (selEl.type === "text") {
    return (
      <div style={wrap}>
        {tag("text")}
        <select value={selEl.font || FONTS[0].css}
          onChange={(e) => { const f = FONTS.find(x => x.css === e.target.value) || FONTS[0]; P({ font: f.css, fontFace: f.face }); }}
          style={{ padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12, background: "#fff" }}>
          {FONTS.map(f => <option key={f.label} value={f.css}>{f.label}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>size {num(selEl.fontSize, (v) => P({ fontSize: v }))}</label>
        {toggle(selEl.bold, "B", () => P({ bold: !selEl.bold }))}
        {toggle(selEl.italic, "I", () => P({ italic: !selEl.italic }))}
        <span style={{ display: "flex", gap: 4 }}>
          {["left", "center", "right"].map(a =>
            <button key={a} onClick={() => P({ align: a })}
              style={{ width: 28, height: 26, borderRadius: 4, cursor: "pointer", border: `1px solid ${selEl.align === a || (!selEl.align && a === "left") ? C.accent : C.border}`, background: "#fff", color: C.text }}>
              {a === "left" ? "⬅" : a === "center" ? "↔" : "➡"}
            </button>)}
        </span>
        <span style={{ display: "flex", gap: 4 }}>
          <button onClick={() => P({ text: toSubscript(selEl.text) })} title="Subscript numbers — H2O → H₂O"
            style={{ height: 26, padding: "0 7px", borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.mono, fontSize: 12 }}>X₂</button>
          <button onClick={() => P({ text: toSuperscript(selEl.text) })} title="Superscript after ^ — 10^23 → 10²³"
            style={{ height: 26, padding: "0 7px", borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.mono, fontSize: 12 }}>X²</button>
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>colour {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          highlight {color(selEl.bg?.startsWith("#") ? selEl.bg : "#2e3a5f", (v) => P({ bg: v }))}
          {selEl.bg && <button onClick={() => P({ bg: null })} style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>none</button>}
        </label>
        <button onClick={() => P({ shadow: !selEl.shadow })} style={pill(selEl.shadow)}>shadow</button>
        {opacityCtl}
      </div>
    );
  }

  if (selEl.type === "rect") {
    const shape = selEl.shape || "rect";
    return (
      <div style={wrap}>
        {tag("shape")}
        <select value={shape} onChange={(e) => P({ shape: e.target.value })} style={selStyle}>
          <option value="rect">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="triangle">Triangle</option>
          <option value="star">Star</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>fill {color(selEl.fill?.startsWith("#") ? selEl.fill : "#5e7c4b", (v) => P({ fill: v }))}</label>
        {(shape === "rect" || shape === "ellipse") && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              border {color(selEl.stroke || "#1a1714", (v) => P({ stroke: v }))}
              {selEl.stroke && <button onClick={() => P({ stroke: null })} style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>none</button>}
            </label>
            {selEl.stroke && <button onClick={() => P({ dashed: !selEl.dashed })} style={pill(selEl.dashed)}>dashed</button>}
          </>
        )}
        {shape === "rect" && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>round {num(selEl.radius ?? 6, (v) => P({ radius: Math.max(0, v) }))}</label>}
        <button onClick={() => P({ shadow: !selEl.shadow })} style={pill(selEl.shadow)}>shadow</button>
        {opacityCtl}
      </div>
    );
  }

  if (selEl.type === "arrow") {
    return (
      <div style={wrap}>
        {tag("arrow")}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>colour {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>thickness {num(selEl.thickness || 6, (v) => P({ thickness: Math.max(1, v) }))}</label>
        <span style={{ color: C.dim }}>· drag the round ends to aim</span>
      </div>
    );
  }

  if (selEl.type === "timer") {
    const d = selEl.duration ?? 300;
    const mm = Math.floor(d / 60), ss = d % 60;
    const setDur = (sec) => P({ duration: Math.max(0, Math.round(sec)) });
    const tnum = (val, on) => <input type="number" value={val} min={0} onChange={(e) => on(Math.max(0, +e.target.value || 0))}
      style={{ width: 48, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12 }} />;
    return (
      <div style={wrap}>
        {tag("timer")}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>min {tnum(mm, (v) => setDur(v * 60 + ss))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>sec {tnum(ss, (v) => setDur(mm * 60 + (v % 60)))}</label>
        <span style={{ display: "flex", gap: 4 }}>
          {[1, 2, 5, 10].map((m) => (
            <button key={m} onClick={() => setDur(m * 60)}
              style={{ height: 26, padding: "0 8px", borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.mono, fontSize: 11 }}>{m}m</button>
          ))}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>face {color(selEl.fill?.startsWith("#") ? selEl.fill : "#1a1714", (v) => P({ fill: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>digits {color(selEl.color?.startsWith("#") ? selEl.color : "#ffffff", (v) => P({ color: v }))}</label>
        <span style={{ color: C.dim }}>· counts down live in Present</span>
      </div>
    );
  }

  if (selEl.type === "table") {
    const resize = (rows, cols) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => selEl.cells?.[r]?.[c] ?? ""));
    return (
      <div style={wrap}>
        {tag("table")}
        <span style={{ color: C.dim }}>{selEl.rows}×{selEl.cols}</span>
        <button onClick={() => P({ rows: selEl.rows + 1, cells: resize(selEl.rows + 1, selEl.cols) })} style={pill(false)}>+ Row</button>
        <button onClick={() => selEl.rows > 1 && P({ rows: selEl.rows - 1, cells: resize(selEl.rows - 1, selEl.cols) })} style={pill(false)}>− Row</button>
        <button onClick={() => P({ cols: selEl.cols + 1, cells: resize(selEl.rows, selEl.cols + 1) })} style={pill(false)}>+ Col</button>
        <button onClick={() => selEl.cols > 1 && P({ cols: selEl.cols - 1, cells: resize(selEl.rows, selEl.cols - 1) })} style={pill(false)}>− Col</button>
        <button onClick={() => P({ headerRow: !selEl.headerRow })} style={pill(selEl.headerRow)}>header</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>size {num(selEl.fontSize || 22, (v) => P({ fontSize: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>text {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>lines {color(selEl.borderColor || "#9a9486", (v) => P({ borderColor: v }))}</label>
        {selEl.headerRow && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>header {color(selEl.headerBg || "#1a1714", (v) => P({ headerBg: v }))}</label>}
        <span style={{ color: C.dim }}>· double-click to type</span>
      </div>
    );
  }

  if (selEl.type === "image") {
    return (
      <div style={wrap}>
        {tag("image")}
        <Btn v="ghost" onClick={onCrop} style={{ fontSize: 12, padding: "5px 12px" }}>Crop</Btn>
        {selEl.crop && <Btn v="ghost" onClick={onResetCrop} style={{ fontSize: 12, padding: "5px 12px" }}>Reset crop</Btn>}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>round {num(selEl.radius ?? 0, (v) => P({ radius: Math.max(0, v) }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          border {color(selEl.stroke || "#1a1714", (v) => P({ stroke: v }))}
          {selEl.stroke && <button onClick={() => P({ stroke: null })} style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>none</button>}
        </label>
        <button onClick={() => P({ shadow: !selEl.shadow })} style={pill(selEl.shadow)}>shadow</button>
        {opacityCtl}
      </div>
    );
  }

  if (selEl.type === "chart") {
    return (
      <div style={wrap}>
        {tag("chart")}
        <select value={selEl.chartType || "bar"} onChange={(e) => P({ chartType: e.target.value })} style={selStyle}>
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
        </select>
        <input value={selEl.title || ""} onChange={(e) => P({ title: e.target.value })} placeholder="Title"
          style={{ width: 120, padding: "5px 7px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12 }} />
        <Btn v="soft" onClick={onEditChart} style={{ fontSize: 12, padding: "5px 12px" }}>Edit data…</Btn>
        {selEl.chartType !== "pie" && <button onClick={() => P({ showLegend: !(selEl.showLegend !== false) })} style={pill(selEl.showLegend !== false)}>legend</button>}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>labels {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <span style={{ color: C.dim }}>· {(selEl.series || []).length} series × {(selEl.labels || []).length} cats</span>
      </div>
    );
  }

  if (selEl.type === "equation") {
    return (
      <div style={{ ...wrap, alignItems: "flex-start" }}>
        {tag("equation")}
        <textarea value={selEl.latex || ""} onChange={(e) => P({ latex: e.target.value })} spellCheck={false}
          placeholder="LaTeX, e.g. \\frac{1}{2}mv^2"
          style={{ width: 280, height: 56, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12, background: "#fff", resize: "vertical" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>size {num(selEl.fontSize || 36, (v) => P({ fontSize: Math.max(8, v) }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>colour {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <span style={{ display: "flex", gap: 4 }}>
          {["left", "center", "right"].map(a =>
            <button key={a} onClick={() => P({ align: a })}
              style={{ width: 28, height: 26, borderRadius: 4, cursor: "pointer", border: `1px solid ${selEl.align === a || (!selEl.align && a === "center") ? C.accent : C.border}`, background: "#fff", color: C.text }}>
              {a === "left" ? "⬅" : a === "center" ? "↔" : "➡"}
            </button>)}
        </span>
        <a href="https://katex.org/docs/supported.html" target="_blank" rel="noreferrer" style={{ color: C.dim, fontSize: 11 }}>LaTeX help ↗</a>
      </div>
    );
  }

  return (
    <div style={wrap}>{tag(selEl.type)}<span style={{ color: C.dim }}>drag the corners to resize</span></div>
  );
}

/* Crop modal: drag the box to move, drag the corner to resize. Stores the crop
   as 0–1 fractions of the source image. */
function CropModal({ el, onApply, onCancel }) {
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState(el.crop || { x: 0, y: 0, w: 1, h: 1 });

  const onLoad = (e) => {
    const im = e.target;
    const r = Math.min(680 / im.naturalWidth, 440 / im.naturalHeight, 1);
    setNat({ w: im.naturalWidth, h: im.naturalHeight });
    setDisp({ w: Math.round(im.naturalWidth * r), h: Math.round(im.naturalHeight * r) });
  };

  const startMove = (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ox = box.x, oy = box.y, bw = box.w, bh = box.h;
    const move = (ev) => {
      const nx = Math.max(0, Math.min(ox + (ev.clientX - sx) / disp.w, 1 - bw));
      const ny = Math.max(0, Math.min(oy + (ev.clientY - sy) / disp.h, 1 - bh));
      setBox((b) => ({ ...b, x: nx, y: ny }));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ow = box.w, oh = box.h, bx = box.x, by = box.y;
    const move = (ev) => {
      const nw = Math.max(0.05, Math.min(ow + (ev.clientX - sx) / disp.w, 1 - bx));
      const nh = Math.max(0.05, Math.min(oh + (ev.clientY - sy) / disp.h, 1 - by));
      setBox((b) => ({ ...b, w: nw, h: nh }));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  return (
    <div onMouseDown={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 18 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.dim, marginBottom: 10 }}>Crop image</div>
        <div style={{ position: "relative", width: disp.w || 320, height: disp.h || 200, userSelect: "none" }}>
          <img src={el.src} alt="" draggable={false} onLoad={onLoad}
            style={{ width: disp.w || "auto", height: disp.h || "auto", maxWidth: 680, maxHeight: 440, display: "block" }} />
          {disp.w > 0 && (
            <div onMouseDown={startMove}
              style={{ position: "absolute", cursor: "move", boxSizing: "border-box",
                       left: box.x * disp.w, top: box.y * disp.h, width: box.w * disp.w, height: box.h * disp.h,
                       border: `2px solid ${C.accent}`, boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}>
              <div onMouseDown={startResize}
                style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, background: "#fff", border: `2px solid ${C.accent}`, borderRadius: 2, cursor: "nwse-resize" }} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <Btn v="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn onClick={() => onApply(box, nat.w, nat.h)}>Apply crop</Btn>
        </div>
      </div>
    </div>
  );
}

/* Chart data editor: categories down the side, one column per series
   (name + colour + a value per category). Add/remove either dimension. */
function ChartDataModal({ el, onApply, onCancel }) {
  const [labels, setLabels] = useState(() => (el.labels?.length ? [...el.labels] : ["A", "B", "C"]));
  const [series, setSeries] = useState(() => (el.series?.length ? el.series.map((s) => ({ name: s.name || "", color: s.color || CHART_COLORS[0], values: [...(s.values || [])] })) : [{ name: "Series 1", color: CHART_COLORS[0], values: [1, 2, 3] }]));

  const inp = { padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12, width: "100%", boxSizing: "border-box" };
  const setLabel = (i, v) => setLabels((a) => a.map((x, j) => (j === i ? v : x)));
  const setVal = (si, ri, v) => setSeries((a) => a.map((s, j) => (j === si ? { ...s, values: labels.map((_, ri2) => (ri2 === ri ? v : (s.values[ri2] ?? ""))) } : s)));
  const setSName = (si, v) => setSeries((a) => a.map((s, j) => (j === si ? { ...s, name: v } : s)));
  const setSColor = (si, v) => setSeries((a) => a.map((s, j) => (j === si ? { ...s, color: v } : s)));
  const addRow = () => { setLabels((a) => [...a, `Cat ${a.length + 1}`]); setSeries((a) => a.map((s) => ({ ...s, values: [...s.values, 0] }))); };
  const delRow = (i) => { if (labels.length <= 1) return; setLabels((a) => a.filter((_, j) => j !== i)); setSeries((a) => a.map((s) => ({ ...s, values: s.values.filter((_, j) => j !== i) }))); };
  const addSeries = () => setSeries((a) => [...a, { name: `Series ${a.length + 1}`, color: CHART_COLORS[a.length % CHART_COLORS.length], values: labels.map(() => 0) }]);
  const delSeries = (si) => setSeries((a) => (a.length <= 1 ? a : a.filter((_, j) => j !== si)));
  const apply = () => onApply({ labels, series: series.map((s) => ({ ...s, values: labels.map((_, i) => +s.values[i] || 0) })) });

  return (
    <div onMouseDown={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 18, maxWidth: 720, maxHeight: "84vh", overflow: "auto" }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.dim, marginBottom: 12 }}>Chart data</div>
        <table style={{ borderCollapse: "collapse", fontFamily: C.sans }}>
          <thead>
            <tr>
              <th style={{ padding: 4, fontSize: 11, color: C.dim, textAlign: "left" }}>Category</th>
              {series.map((s, si) => (
                <th key={si} style={{ padding: 4, minWidth: 90 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="color" value={s.color} onChange={(e) => setSColor(si, e.target.value)} style={{ width: 22, height: 22, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
                    <input value={s.name} onChange={(e) => setSName(si, e.target.value)} style={{ ...inp, width: 80 }} />
                    {series.length > 1 && <button onClick={() => delSeries(si)} title="Remove series" style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>}
                  </div>
                </th>
              ))}
              <th style={{ padding: 4 }}><button onClick={addSeries} style={{ fontSize: 11, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer" }}>+ Series</button></th>
            </tr>
          </thead>
          <tbody>
            {labels.map((lab, ri) => (
              <tr key={ri}>
                <td style={{ padding: 3 }}><input value={lab} onChange={(e) => setLabel(ri, e.target.value)} style={{ ...inp, width: 110 }} /></td>
                {series.map((s, si) => (
                  <td key={si} style={{ padding: 3 }}><input type="number" value={s.values[ri] ?? 0} onChange={(e) => setVal(si, ri, e.target.value)} style={inp} /></td>
                ))}
                <td style={{ padding: 3 }}>{labels.length > 1 && <button onClick={() => delRow(ri)} title="Remove row" style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addRow} style={{ marginTop: 8, fontSize: 11, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer" }}>+ Category</button>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <Btn v="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn onClick={apply}>Apply</Btn>
        </div>
      </div>
    </div>
  );
}

/* Editable table — each cell is a contentEditable seeded once on mount, so the
   caret survives re-renders. Typing rebuilds the full cells matrix. */
function TableEditor({ el, onCells }) {
  const rows = el.rows || 1, cols = el.cols || 1;
  const border = el.borderColor || "#9a9486";
  const headerBg = el.headerBg || "#1a1714", headerColor = el.headerColor || "#ffffff";
  const setCell = (r, c, text) => {
    onCells(Array.from({ length: rows }, (_, rr) => Array.from({ length: cols }, (_, cc) => (rr === r && cc === c ? text : (el.cells?.[rr]?.[cc] ?? "")))));
  };
  return (
    <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontFamily: el.font || C.sans, fontSize: el.fontSize || 22, color: el.color || "#1a1714" }}>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => {
              const head = el.headerRow && r === 0;
              return <Cell key={c} value={el.cells?.[r]?.[c] || ""} onInput={(t) => setCell(r, c, t)}
                style={{ border: `1px solid ${border}`, padding: "4px 9px", verticalAlign: "middle", background: head ? headerBg : "transparent", color: head ? headerColor : (el.color || "#1a1714"), fontWeight: head ? 700 : 400, overflow: "hidden" }} />;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Cell({ value, onInput, style }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.textContent = value || ""; }, []); // seed once
  return <td ref={ref} contentEditable suppressContentEditableWarning
    onMouseDown={(e) => e.stopPropagation()}
    onInput={() => onInput(ref.current?.textContent ?? "")}
    style={{ ...style, outline: "none", cursor: "text" }} />;
}

/* Inline text editor: a contentEditable seeded once on mount so React never
   fights the caret. Saves on EVERY keystroke (onText) so the text is never
   lost if the editor is torn down by a click elsewhere; onDone just exits.
   Exposes insert()/subSup() via apiRef so the symbol bar and ⌘,/⌘. work. */
// Does this contentEditable HTML carry any inline formatting / lists worth
// persisting as `rich`? Plain typing (incl. <div>/<br> line breaks) does not.
const isRich = (html) => /<(b|strong|i|em|u|s|span|font|ul|ol|li)\b/i.test(html || "");

function TextEditor({ el, onText, onDone, apiRef }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (el.rich) node.innerHTML = el.rich; else node.textContent = el.text || "";
    node.focus();
    // place caret at end (selecting all rich HTML is jarring)
    const sel = window.getSelection(); const r = document.createRange();
    r.selectNodeContents(node); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist both a plain-text fallback and the rich HTML (only when formatted).
  const persist = () => {
    const node = ref.current; if (!node) return;
    const html = node.innerHTML;
    onText(node.textContent ?? "", isRich(html) ? html : null);
  };

  const exec = (cmd, val) => { ref.current?.focus(); try { document.execCommand(cmd, false, val); } catch {} persist(); };
  const doInsert = (str) => { ref.current?.focus(); try { document.execCommand("insertText", false, str); } catch {} persist(); };
  const doSubSup = (kind) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const mapped = mapScript(sel.toString(), kind);
    ref.current?.focus(); try { document.execCommand("insertText", false, mapped); } catch {} persist();
  };

  // Re-register each render so the toolbar calls the latest closures.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      insert: doInsert, subSup: doSubSup,
      bold: () => exec("bold"), italic: () => exec("italic"), underline: () => exec("underline"),
      color: (v) => exec("foreColor", v),
      bullet: () => exec("insertUnorderedList"), number: () => exec("insertOrderedList"),
      indent: () => exec("indent"), outdent: () => exec("outdent"),
    };
    return () => { apiRef.current = null; };
  });

  return (
    <div ref={ref} contentEditable suppressContentEditableWarning
      onMouseDown={(e) => e.stopPropagation()}
      onInput={persist}
      onBlur={onDone}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) { e.preventDefault(); exec("bold"); }
        else if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) { e.preventDefault(); exec("italic"); }
        else if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); doSubSup("sub"); }
        else if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); doSubSup("sup"); }
        else if (e.key === "Escape") { e.preventDefault(); ref.current?.blur(); }
      }}
      className={el.rich ? "rt" : undefined}
      style={{ ...elStyle(el), outline: `2px solid ${C.accent}`, outlineOffset: 1, cursor: "text", overflow: "visible" }} />
  );
}
