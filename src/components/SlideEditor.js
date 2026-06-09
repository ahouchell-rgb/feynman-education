"use client";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { sk } from "@/lib/sk";
import { VW, VH, elStyle, ElInner, ArrowSvg, StaticSlide } from "@/components/SlideStage";

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
];

const HANDLES = [
  ["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0],
  ["w", 0, 0.5],               ["e", 1, 0.5],
  ["sw", 0, 1], ["s", 0.5, 1], ["se", 1, 1],
];
const CURSORS = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const HANDLE_PX = 9;

/* `deck.slides` is the single source of truth. Every action builds the next
   slides array, sets local state, and calls onChange so the parent can save. */
export function SlideEditor({ deck, onChange, onUploadImage }) {
  const [slides, setSlides] = useState(() =>
    ensureIds(deck.slides?.length ? deck.slides : [{ id: uid(), elements: [] }]));
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);

  const wrapRef = useRef(null);
  const fileRef = useRef(null);
  const editorApi = useRef(null); // set by the active inline TextEditor
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(1, (wrapRef.current?.clientWidth || VW) / VW));
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const slide = slides[cur] || slides[0];
  const selEl = slide.elements.find(e => e.id === sel) || null;
  const edEl = slide.elements.find(e => e.id === editing) || null;

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

  const addEl = (el) => { snapshot(false); const id = uid(); mapSlide(s => ({ ...s, elements: [...s.elements, { id, ...el }] })); setSel(id); setEditing(null); };

  const addText = () => addEl({ type: "text", x: 120, y: 200, width: 460, height: 90, text: "New text", fontSize: 40, color: C.text, font: FONTS[0].css, fontFace: FONTS[0].face, align: "left" });
  const addLabel = () => addEl({ type: "text", x: 360, y: 240, width: 240, height: 64, text: "Label", fontSize: 28, color: "#ffffff", bold: true, align: "center", bg: C.blu, font: FONTS[0].css, fontFace: FONTS[0].face });
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

  const [cropping, setCropping] = useState(null); // image id being cropped
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
      if (el.type === "text" && el.font) {
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
    "Add a quick exit-ticket question",
    "Give this slide a soft tinted background",
  ];

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
        if (k === "d") { e.preventDefault(); duplicate(); return; }
        if (k === "c") { copyEl(); return; }
        if (k === "v") { e.preventDefault(); pasteEl(); return; }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (sel) delEl(); else delSlide();
      } else if (sel && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        nudge(e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0,
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

  const startDrag = (e, el) => {
    e.stopPropagation();
    setSel(el.id);
    const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y; let took = false;
    const move = (ev) => { if (!took) { snapshot(false); took = true; } patchEl(el.id, { x: Math.round(ox + (ev.clientX - sx) / scale), y: Math.round(oy + (ev.clientY - sy) / scale) }); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const startResize = (e, el, fx, fy) => {
    e.stopPropagation();
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
      patchEl(el.id, { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const startArrowDrag = (e, el) => {
    e.stopPropagation();
    setSel(el.id);
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

  return (
    <>
    <div style={{ display: "flex", gap: 14, height: "100%", fontFamily: C.mono, minHeight: 0 }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: "none" }} />

      {/* slide rail */}
      <div style={{ width: 132, flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {slides.map((s, i) => (
          <button key={s.id} onClick={() => { setCur(i); setSel(null); setEditing(null); }}
            draggable
            onDragStart={() => { dragIdx.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => reorderSlide(i)}
            title="Drag to reorder"
            style={{ position: "relative", padding: 0, background: "#fff", borderRadius: 5, cursor: "pointer",
                     overflow: "hidden", lineHeight: 0, border: `2px solid ${i === cur ? C.accent : C.border}` }}>
            <StaticSlide slide={s} width={120} />
            <span style={{ position: "absolute", bottom: 2, left: 4, fontSize: 9, color: C.dim, lineHeight: 1 }}>{i + 1}</span>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Btn v="ghost" onClick={undo} disabled={!histPast.current.length} title="Undo (⌘Z)">↶</Btn>
          <Btn v="ghost" onClick={redo} disabled={!histFuture.current.length} title="Redo (⌘⇧Z)">↷</Btn>
          <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 2px" }} />
          <Btn v="soft" onClick={addText}>+ Text</Btn>
          <Btn v="soft" onClick={addLabel}>+ Label</Btn>
          <Btn v="soft" onClick={addRect}>+ Box</Btn>
          <Btn v="soft" onClick={addArrow}>+ Arrow</Btn>
          <Btn v="soft" onClick={addTimer}>+ Timer</Btn>
          <Btn v="soft" onClick={() => fileRef.current?.click()}>+ Image</Btn>
          <Btn v="soft" onClick={addVideo}>+ Video</Btn>
          <Btn v="soft" onClick={addVisualiser}>+ Visualiser</Btn>
          <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 2px" }} />
          <Btn v="ghost" onClick={duplicate} disabled={!sel} title="Duplicate (⌘D)">Duplicate</Btn>
          <Btn v="ghost" onClick={bringFront} disabled={!sel} title="Bring to front">Front</Btn>
          <Btn v="ghost" onClick={sendBack} disabled={!sel} title="Send to back">Back</Btn>
          <Btn v={selEl?.reveal ? "pri" : "ghost"} onClick={() => sel && patchH(sel, { reveal: !selEl.reveal })} disabled={!sel} title="Hidden until clicked in Present">Reveal</Btn>
          <Btn v="ghost" onClick={delEl} disabled={!sel}>Delete</Btn>
          <span style={{ flex: 1 }} />
          <Btn v={aiOpen ? "pri" : "soft"} onClick={() => setAiOpen((o) => !o)}>✦ Ask Claude</Btn>
          <Btn v="ghost" onClick={delSlide} disabled={slides.length < 2}>Delete slide</Btn>
        </div>

        {/* symbol bar — visible while editing a text box */}
        {editing && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", padding: "6px 8px",
                        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <button title="Smaller (as you type)"
              onMouseDown={(e) => { e.preventDefault(); if (edEl) patchH(editing, { fontSize: Math.max(8, (edEl.fontSize || 40) - 4) }); }}
              style={{ height: 26, padding: "0 9px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 13, cursor: "pointer" }}>A−</button>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, minWidth: 22, textAlign: "center" }}>{edEl?.fontSize || 40}</span>
            <button title="Bigger (as you type)"
              onMouseDown={(e) => { e.preventDefault(); if (edEl) patchH(editing, { fontSize: (edEl.fontSize || 40) + 4 }); }}
              style={{ height: 26, padding: "0 9px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 15, cursor: "pointer" }}>A+</button>
            <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
            {[...SYMBOLS, ...STATES].map((sym) => (
              <button key={sym} title="Insert at cursor"
                onMouseDown={(e) => { e.preventDefault(); editorApi.current?.insert(sym); }}
                style={{ minWidth: 26, height: 26, padding: "0 6px", borderRadius: 4, border: `1px solid ${C.border}`,
                         background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>{sym}</button>
            ))}
            <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
            <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.subSup("sub"); }} title="Subscript selection (⌘,)"
              style={{ height: 26, padding: "0 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>x₂</button>
            <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.subSup("sup"); }} title="Superscript selection (⌘.)"
              style={{ height: 26, padding: "0 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>x²</button>
            <span style={{ fontSize: 10, color: C.faint, marginLeft: 4 }}>select text · ⌘, sub · ⌘. super</span>
          </div>
        )}

        {/* stage */}
        <div ref={wrapRef} style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center",
                                    background: C.bg, borderRadius: 8, padding: 16, overflow: "hidden" }}>
          <div style={{ width: VW * scale, height: VH * scale, position: "relative" }}>
            <div onMouseDown={() => { setSel(null); setEditing(null); }}
              style={{ width: VW, height: VH, position: "absolute", top: 0, left: 0,
                       transform: `scale(${scale})`, transformOrigin: "top left",
                       background: slide.background || "#fff", boxShadow: "0 2px 16px rgba(0,0,0,.12)", overflow: "hidden" }}>
              {slide.elements.map(el => {
                if (el.type === "arrow")
                  return <ArrowSvg key={el.id} el={el} selected={sel === el.id} hitProps={{ onMouseDown: (e) => startArrowDrag(e, el) }} />;
                if (editing === el.id)
                  return <TextEditor key={el.id} el={el} apiRef={editorApi}
                    onText={(text) => patchEl(el.id, { text })}
                    onDone={() => setEditing(null)} />;
                return (
                  <div key={el.id}
                    onMouseDown={(e) => startDrag(e, el)}
                    onDoubleClick={el.type === "text" ? () => { setSel(el.id); setEditing(el.id); } : undefined}
                    style={{ ...elStyle(el), cursor: "move", opacity: el.reveal && sel !== el.id ? 0.55 : 1,
                             outline: sel === el.id ? `2px solid ${C.accent}` : el.reveal ? `1.5px dashed ${C.dim}` : "none", outlineOffset: 1 }}>
                    <ElInner el={el} />
                  </div>
                );
              })}

              {/* box resize handles */}
              {selEl && selEl.type !== "arrow" && editing !== selEl.id && HANDLES.map(([name, fx, fy]) => {
                const h = selEl.height || (selEl.fontSize ? selEl.fontSize * 1.5 : 100);
                const sz = HANDLE_PX / scale;
                return (
                  <div key={name} onMouseDown={(e) => startResize(e, selEl, fx, fy)}
                    style={{ position: "absolute", left: selEl.x + fx * selEl.width - sz / 2, top: selEl.y + fy * h - sz / 2,
                             width: sz, height: sz, background: "#fff", border: `${1.5 / scale}px solid ${C.accent}`,
                             borderRadius: 2, cursor: CURSORS[name], boxSizing: "border-box" }} />
                );
              })}

              {/* arrow endpoint handles */}
              {selEl && selEl.type === "arrow" && [["a", selEl.x1, selEl.y1], ["b", selEl.x2, selEl.y2]].map(([k, px, py]) => {
                const sz = (HANDLE_PX + 2) / scale;
                return (
                  <div key={k} onMouseDown={(e) => startArrowEnd(e, selEl, k)}
                    style={{ position: "absolute", left: px - sz / 2, top: py - sz / 2, width: sz, height: sz,
                             background: "#fff", border: `${1.5 / scale}px solid ${C.accent}`, borderRadius: "50%", cursor: "move" }} />
                );
              })}
            </div>
          </div>
        </div>

        {/* properties bar */}
        <PropsBar selEl={selEl} slide={slide} patchEl={patchH} setSlideBg={setSlideBg}
          onCrop={() => selEl && setCropping(selEl.id)} onResetCrop={() => selEl && patchH(selEl.id, { crop: null })} />

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

      {/* Ask Claude panel */}
      {aiOpen && (
        <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
                      borderLeft: `1px solid ${C.border}`, paddingLeft: 14 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>✦ Ask Claude</div>
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
        </div>
      )}
    </div>
    {cropping && (() => {
      const el = slide.elements.find((e) => e.id === cropping);
      return el ? <CropModal el={el} onApply={(crop, w, h) => applyCrop(cropping, crop, w, h)} onCancel={() => setCropping(null)} /> : null;
    })()}
    </>
  );
}

/* ── Properties bar: element controls, or slide controls when nothing is selected ── */
function PropsBar({ selEl, slide, patchEl, setSlideBg, onCrop, onResetCrop }) {
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
      </div>
    );
  }

  if (selEl.type === "rect") {
    return (
      <div style={wrap}>
        {tag("box")}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>fill {color(selEl.fill?.startsWith("#") ? selEl.fill : "#5e7c4b", (v) => P({ fill: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          border {color(selEl.stroke || "#1a1714", (v) => P({ stroke: v }))}
          {selEl.stroke && <button onClick={() => P({ stroke: null })} style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>none</button>}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>round {num(selEl.radius ?? 6, (v) => P({ radius: Math.max(0, v) }))}</label>
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

  if (selEl.type === "image") {
    return (
      <div style={wrap}>
        {tag("image")}
        <Btn v="ghost" onClick={onCrop} style={{ fontSize: 12, padding: "5px 12px" }}>Crop</Btn>
        {selEl.crop && <Btn v="ghost" onClick={onResetCrop} style={{ fontSize: 12, padding: "5px 12px" }}>Reset crop</Btn>}
        <span style={{ color: C.dim }}>· drag the corners to resize</span>
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

/* Inline text editor: a contentEditable seeded once on mount so React never
   fights the caret. Saves on EVERY keystroke (onText) so the text is never
   lost if the editor is torn down by a click elsewhere; onDone just exits.
   Exposes insert()/subSup() via apiRef so the symbol bar and ⌘,/⌘. work. */
function TextEditor({ el, onText, onDone, apiRef }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.textContent = el.text || "";
    node.focus();
    selectRange(node, 0, (el.text || "").length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Insert a string at the caret (replacing any selection).
  const doInsert = (str) => {
    const node = ref.current;
    if (!node) return;
    const len = (node.textContent || "").length;
    const off = caretOffsets(node) || { start: len, end: len };
    const full = node.textContent || "";
    const next = full.slice(0, off.start) + str + full.slice(off.end);
    node.textContent = next;
    onText(next);
    selectRange(node, off.start + str.length);
  };

  // Sub/superscript the current selection (toggles back if already converted).
  const doSubSup = (kind) => {
    const node = ref.current;
    if (!node) return;
    const off = caretOffsets(node);
    if (!off || off.start === off.end) return;
    const full = node.textContent || "";
    const mapped = mapScript(full.slice(off.start, off.end), kind);
    const next = full.slice(0, off.start) + mapped + full.slice(off.end);
    node.textContent = next;
    onText(next);
    selectRange(node, off.start, off.start + mapped.length);
  };

  // Re-register each render so the symbol bar calls the latest closures.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { insert: doInsert, subSup: doSubSup };
    return () => { apiRef.current = null; };
  });

  return (
    <div ref={ref} contentEditable suppressContentEditableWarning
      onMouseDown={(e) => e.stopPropagation()}
      onInput={() => onText(ref.current?.textContent ?? "")}
      onBlur={onDone}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); doSubSup("sub"); }
        else if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); doSubSup("sup"); }
        else if (e.key === "Escape") { e.preventDefault(); ref.current?.blur(); }
      }}
      style={{ ...elStyle(el), outline: `2px solid ${C.accent}`, outlineOffset: 1, cursor: "text", overflow: "visible" }} />
  );
}
