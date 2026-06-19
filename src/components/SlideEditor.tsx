"use client";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { sk } from "@/lib/sk";
import { VW, VH, elStyle, ElInner, ArrowSvg, StaticSlide, MasterFrame, CHART_COLORS } from "@/components/SlideStage";
import { SUB, SUP, mapScript, toSubscript, toSuperscript, autoSub } from "@/lib/formula";
// Constants, data, pure helpers and self-contained leaf components live in ./slideEditor/*
import { uid, ensureIds, MIN, FONTS, SYMBOLS, STATES, CHARGES, EQUATIONS, parseVideo, RET_APP_ORIGIN, THEMES, fontByLabel, TEMPLATES, HANDLES, CURSORS, HANDLE_PX, fin, DEFAULT_MASTER } from "./slideEditor/constants";
import { Sep, PanelLabel } from "./slideEditor/ui";
import { ShortcutHelp } from "./slideEditor/ShortcutHelp";
import { PropsBar } from "./slideEditor/PropsBar";
import { CropModal } from "./slideEditor/CropModal";
import { ChartDataModal } from "./slideEditor/ChartDataModal";
import { TableEditor } from "./slideEditor/TableEditor";
import { TextEditor } from "./slideEditor/TextEditor";
import { DeckQuestionsModal } from "@/components/DeckQuestionsModal";

export function SlideEditor({ deck, onChange, onUploadImage, onThemeChange, onMasterChange, onCurChange }) {
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
  const [fxOpen, setFxOpen] = useState(false);          // equations palette popover
  const [find, setFind] = useState("");
  const [insertOpen, setInsertOpen] = useState(false);   // "+ Insert" dropdown
  const [qOpen, setQOpen] = useState(false);             // deck → retrieval questions modal
  const [slideMenu, setSlideMenu] = useState(null);      // { x, y, index } — slide-rail right-click menu
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

  // Report the selected slide up so the page's "Present ▾" can start from here.
  useEffect(() => { onCurChange?.(cur); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // (for clicking through an imported deck). Defaults OFF so opening a deck lands
  // you straight in edit mode — an overlay-on-by-default silently swallows every
  // edit click. Turn it on to flick through. Remembered per browser.
  const [clickThru, setClickThru] = useState(() => { try { return localStorage.getItem("sk_click_advance") === "1"; } catch { return false; } });
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
  // Index-aware variants used by the slide-rail right-click menu (operate on the
  // slide that was clicked, not the current one). Each inserts after `i` and selects it.
  const addSlideAfter = (i) => { snapshot(false); const n = [...slides]; n.splice(i + 1, 0, { id: uid(), elements: [] }); commit(n); setCur(i + 1); setSel(null); setEditing(null); };
  const duplicateSlideAt = (i) => { snapshot(false); const n = [...slides]; n.splice(i + 1, 0, cloneSlide(slides[i])); commit(n); setCur(i + 1); setSel(null); setEditing(null); };
  const delSlideAt = (i) => { if (slides.length < 2) return; snapshot(false); const n = slides.filter((_, k) => k !== i); commit(n); setCur(Math.min(i, n.length - 1)); setSel(null); setEditing(null); };
  // Copy / paste a whole slide (deep-cloned with fresh ids on paste, so the copy
  // survives editing the original and can be pasted many times).
  const slideClip = useRef(null);
  const copySlide = (i) => { slideClip.current = slides[i]; };
  const pasteSlideAfter = (i) => { if (!slideClip.current) return; snapshot(false); const n = [...slides]; n.splice(i + 1, 0, cloneSlide(slideClip.current)); commit(n); setCur(i + 1); setSel(null); setEditing(null); };
  const dragIdx = useRef(null);
  const reorderSlide = (to) => { const from = dragIdx.current; dragIdx.current = null; if (from == null || from === to) return; snapshot(false); const n = [...slides]; const [m] = n.splice(from, 1); n.splice(to, 0, m); commit(n); setCur(to); setSel(null); };
  const insertTemplate = (idx) => {
    const tpl = TEMPLATES[idx]; if (!tpl) return;
    snapshot(false);
    const b: any = tpl.build();
    const s = { id: uid(), background: b.background, elements: (b.elements || []).map((e: any) => ({ id: uid(), ...e })) };
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
      const token = sk.auth.getToken();
      if (!token) throw new Error("Sign in to use the AI assistant.");
      const r = await fetch("/api/slides-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  // Close the equations popover whenever we leave text editing.
  useEffect(() => { if (!editing) setFxOpen(false); }, [editing]);

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

  // Paste an image straight from the clipboard (screenshot, copied web image)
  // onto the current slide. Skipped while editing text, so pasting text into a
  // text box still works; non-image pastes always fall through to the default.
  useEffect(() => {
    const onPaste = async (e) => {
      if (editing) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgItem = Array.from(items).find((it: any) => it.kind === "file" && it.type.startsWith("image/")) as any;
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      try {
        const url = onUploadImage
          ? await onUploadImage(file)
          : await sk.upload(`slides/${deck.id}/${Math.floor(performance.now())}-paste`, file);
        const probe = new Image();
        probe.onload = () => { const w = 420, h = Math.round(w * (probe.naturalHeight / probe.naturalWidth || 0.66)); addEl({ type: "image", x: 140, y: 120, width: w, height: h, src: url }); };
        probe.onerror = () => addEl({ type: "image", x: 140, y: 120, width: 420, height: 280, src: url });
        probe.src = url;
      } catch (err) { alert("Image paste failed: " + err.message); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // re-bound each render so it closes over current slide / editing

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

  // Topmost element under a viewport point (for click-to-select within the group frame).
  const elAt = (clientX, clientY) => {
    const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return null;
    const vx = (clientX - rect.left) / scale, vy = (clientY - rect.top) / scale;
    return [...slide.elements].reverse().find((el) => { const b = boxOf(el); return vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h; }) || null;
  };
  // Drag the whole multi-selection from anywhere inside its bounding box (the
  // group frame). A click without movement falls through to selecting the single
  // element under the cursor, so you can still pick one out of the group.
  const startGroupDrag = (e) => {
    e.stopPropagation();
    if (e.shiftKey) {
      const hit = elAt(e.clientX, e.clientY);
      if (hit) { const ids = groupOf(hit.id); setSelIds((cur) => { const s = new Set(cur); const allIn = ids.every((i) => s.has(i)); ids.forEach((i) => (allIn ? s.delete(i) : s.add(i))); return [...s]; }); }
      return;
    }
    const originals = {};
    selIds.forEach((i) => { originals[i] = slide.elements.find((x) => x.id === i); });
    const sx = e.clientX, sy = e.clientY; let took = false, moved = false;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return; // ignore jitter
      if (!took) { snapshot(false); took = true; } moved = true;
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      commit(slides.map((s, si) => (si !== cur ? s : { ...s, elements: s.elements.map((elm) => (originals[elm.id] ? moveEl(originals[elm.id], dx, dy) : elm)) })));
    };
    const up = (ev) => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      if (!moved) { const hit = elAt(ev.clientX, ev.clientY); setSelIds(hit ? groupOf(hit.id) : []); setEditing(null); }
    };
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
      <div style={{ width: 264, flexShrink: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {slides.map((s, i) => {
          // Extract first meaningful text for the label row
          const labelTxt = (() => {
            for (const el of (s.elements || [])) {
              const t = (el.text || el.rich?.replace(/<[^>]+>/g, "") || "").trim();
              if (t) return t.replace(/\n[\s\S]*/g, "").slice(0, 28);
            }
            return "";
          })();
          return (
            <button key={s.id} onClick={() => { setCur(i); setSel(null); setEditing(null); }}
              draggable
              onDragStart={() => { dragIdx.current = i; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => reorderSlide(i)}
              onContextMenu={(e) => { e.preventDefault(); setCur(i); setSlideMenu({ x: e.clientX, y: Math.min(e.clientY, (typeof window !== "undefined" ? window.innerHeight : 800) - 210), index: i }); }}
              title={labelTxt || `Slide ${i + 1}`}
              onMouseEnter={(e) => { if (i !== cur) e.currentTarget.style.borderColor = C.accent; }}
              onMouseLeave={(e) => { if (i !== cur) e.currentTarget.style.borderColor = C.border; }}
              style={{ position: "relative", padding: 0, background: C.bg, borderRadius: 7, cursor: "pointer",
                       lineHeight: 0, transition: "border-color .12s, box-shadow .12s", textAlign: "left",
                       border: `2px solid ${i === cur ? C.accent : C.border}`,
                       boxShadow: i === cur ? `0 0 0 3px ${C.accent}22` : "none" }}>
              {/* thumbnail */}
              <div style={{ overflow: "hidden", borderRadius: "5px 5px 0 0", lineHeight: 0 }}>
                <StaticSlide slide={s} width={248} master={masterState} index={i} total={slides.length} title={deck.title} />
              </div>
              {/* label row */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 7px 5px", lineHeight: "normal" }}>
                <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0,
                               color: i === cur ? C.accent : C.muted }}>{i + 1}</span>
                <span style={{ fontSize: 10, color: C.muted, overflow: "hidden",
                               textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                               fontFamily: C.sans }}>{labelTxt || "—"}</span>
                {s.notes ? <span title="Has speaker notes" style={{ fontSize: 9, flexShrink: 0, lineHeight: 1 }}>🗒</span> : null}
              </div>
            </button>
          );
        })}
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
          <Btn v={qOpen ? "pri" : "soft"} onClick={() => setQOpen(true)} title="Generate retrieval questions for your class from this deck">❓ Questions</Btn>
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

              {/* group frame — when 2+ elements are selected, a dashed box you can
                  grab anywhere to move the whole selection together. */}
              {selIds.length >= 2 && !marquee && (() => {
                const bs = selEls.map(boxOf);
                if (!bs.length) return null;
                const minX = Math.min(...bs.map(b => b.x)), minY = Math.min(...bs.map(b => b.y));
                const maxX = Math.max(...bs.map(b => b.x + b.w)), maxY = Math.max(...bs.map(b => b.y + b.h));
                return (
                  <div onMouseDown={startGroupDrag} title="Drag to move all selected together · Shift-click to add/remove · click an item to pick just it"
                    style={{ position: "absolute", left: fin(minX), top: fin(minY), width: fin(maxX - minX), height: fin(maxY - minY),
                             border: `${1.5 / scale}px dashed ${C.accent}`, background: `${C.accent}0d`, cursor: "move", boxSizing: "border-box" }} />
                );
              })()}

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
                <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.subSup("sub"); }} title="Subscript: ⌘, toggles typing mode (or converts a selection)"
                  style={{ height: 26, padding: "0 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>x₂</button>
                <button onMouseDown={(e) => { e.preventDefault(); editorApi.current?.subSup("sup"); }} title="Superscript: ⌘. toggles typing mode (or converts a selection)"
                  style={{ height: 26, padding: "0 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>x²</button>
                <Sep />
                {CHARGES.map((ch) => (
                  <button key={ch} title="Insert ion charge at cursor"
                    onMouseDown={(e) => { e.preventDefault(); editorApi.current?.insert(ch); }}
                    style={{ minWidth: 26, height: 26, padding: "0 6px", borderRadius: 4, border: `1px solid ${C.border}`,
                             background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 14, cursor: "pointer" }}>{ch}</button>
                ))}
                <Sep />
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <button title="Insert a science equation at the cursor"
                    onMouseDown={(e) => { e.preventDefault(); setFxOpen((o) => !o); }}
                    style={{ height: 26, padding: "0 8px", borderRadius: 4, border: `1px solid ${fxOpen ? C.accent : C.border}`,
                             background: "#fff", color: C.text, fontFamily: C.sans, fontSize: 13, fontStyle: "italic", cursor: "pointer" }}>fx ▾</button>
                  {fxOpen && (
                    <div style={{ position: "absolute", top: 30, left: 0, zIndex: 50, background: "#fff",
                      border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
                      padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 210, maxHeight: 300, overflowY: "auto" }}>
                      {EQUATIONS.map((eq) => (
                        <button key={eq}
                          onMouseDown={(e) => { e.preventDefault(); editorApi.current?.insert(eq); setFxOpen(false); }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = C.surface)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          style={{ textAlign: "left", padding: "5px 8px", borderRadius: 4, border: "none",
                            background: "transparent", color: C.text, fontFamily: C.sans, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>{eq}</button>
                      ))}
                    </div>
                  )}
                </span>
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
    {qOpen && <DeckQuestionsModal slides={slides} lessonTitle={deck?.title || ""} onClose={() => setQOpen(false)} />}
    {slideMenu && (
      <>
        {/* click/right-click anywhere else dismisses the menu */}
        <div onClick={() => setSlideMenu(null)} onContextMenu={(e) => { e.preventDefault(); setSlideMenu(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 60 }} />
        <div style={{ position: "fixed", top: slideMenu.y, left: slideMenu.x, zIndex: 61, width: 188,
          background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 10px 32px rgba(0,0,0,0.16)", padding: 6 }}>
          {[
            { label: "New slide", icon: "＋", run: () => addSlideAfter(slideMenu.index) },
            { label: "Duplicate slide", icon: "⧉", run: () => duplicateSlideAt(slideMenu.index) },
            { label: "Copy slide", icon: "⎘", run: () => copySlide(slideMenu.index) },
            { label: "Paste slide", icon: "📋", disabled: !slideClip.current, run: () => pasteSlideAfter(slideMenu.index) },
            { label: "Delete slide", icon: "🗑", danger: true, disabled: slides.length < 2, run: () => delSlideAt(slideMenu.index) },
          ].map((item) => (
            <button key={item.label} disabled={item.disabled}
              onClick={() => { setSlideMenu(null); item.run(); }}
              onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = C.bg; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "7px 9px",
                border: "none", background: "transparent", borderRadius: 5, cursor: item.disabled ? "default" : "pointer",
                fontFamily: C.sans, fontSize: 13, opacity: item.disabled ? 0.45 : 1,
                color: item.danger ? "#b4332a" : C.text }}>
              <span style={{ width: 18, textAlign: "center", fontSize: 14, color: item.danger ? "#b4332a" : C.muted }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
      </>
    )}
    </>
  );
}
