// Best-effort PowerPoint (.pptx) importer → our deck format.
// Rebuilds each slide as editable elements (text, shapes, images, tables, lines).
// To land close to the original it resolves: theme colours (schemeClr/tint/shade),
// slide-layout + master placeholder geometry & default text styles, group
// transforms, bullets and basic connectors. Charts, SmartArt, gradients and
// animations are still approximated or skipped.
import JSZip from "jszip";

const VW = 960, VH = 540;
const FONT_FACES = {
  arial: "'IBM Plex Sans', sans-serif", calibri: "'IBM Plex Sans', sans-serif", "calibri light": "'IBM Plex Sans', sans-serif",
  helvetica: "'IBM Plex Sans', sans-serif", "segoe ui": "'IBM Plex Sans', sans-serif", aptos: "'IBM Plex Sans', sans-serif",
  georgia: "Georgia, serif", "times new roman": "'Times New Roman', serif", cambria: "Georgia, serif", garamond: "Georgia, serif",
  "comic sans ms": "'Comic Sans MS', sans-serif", verdana: "Verdana, sans-serif", tahoma: "Verdana, sans-serif",
  consolas: "'IBM Plex Mono', monospace", "courier new": "'IBM Plex Mono', monospace",
};

/* ── tiny XML helpers (work with the browser DOMParser) ── */
const ln = (n) => n.localName || (n.tagName || "").replace(/^.*:/, "");
const elKids = (el) => (el ? Array.from(el.children) : []);
const kids = (el, name) => elKids(el).filter((c) => ln(c) === name);
const first = (el, name) => kids(el, name)[0] || null;
const desc = (el, name) => { const out = []; const walk = (n) => { for (const c of elKids(n)) { if (ln(c) === name) out.push(c); walk(c); } }; if (el) walk(el); return out; };
const firstDesc = (el, name) => desc(el, name)[0] || null;
const A = (el, name) => (el ? el.getAttribute(name) : null);
const numA = (el, name) => { const v = A(el, name); return v == null ? null : +v; };
const relEmbed = (blip) => A(blip, "r:embed") || A(blip, "embed") || (blip && blip.getAttributeNS && blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed"));

/* ── colour resolution ─────────────────────────────────────────── */
const COLOR_TAGS = new Set(["srgbClr", "sysClr", "schemeClr", "prstClr", "scrgbClr", "hslClr"]);
const PRST_CLR = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  cyan: "#00ffff", magenta: "#ff00ff", gray: "#808080", grey: "#808080", darkGray: "#a9a9a9", lightGray: "#d3d3d3",
  orange: "#ffa500", purple: "#800080", brown: "#a52a2a", pink: "#ffc0cb", gold: "#ffd700",
};
// Default theme→slot mapping used when a master omits its own clrMap.
const DEFAULT_CLRMAP = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2", accent1: "accent1", accent2: "accent2", accent3: "accent3", accent4: "accent4", accent5: "accent5", accent6: "accent6", hlink: "hlink", folHlink: "folHlink" };

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));
const hexToRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };
const rgbToHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");
function rgbToHsl({ r, g, b }) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; const d = mx - mn; if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return { h, s, l }; }
function hslToRgb({ h, s, l }) { const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 }; }

// Apply OOXML colour modifiers (children of the colour element).
function applyMods(hex, clrEl) {
  let rgb = hexToRgb(hex); if (!rgb) return hex;
  const frac = (el) => (numA(el, "val") || 0) / 100000;
  for (const ch of elKids(clrEl)) {
    const t = ln(ch), f = frac(ch);
    if (t === "shade") { rgb = { r: rgb.r * f, g: rgb.g * f, b: rgb.b * f }; }
    else if (t === "tint") { rgb = { r: rgb.r * f + 255 * (1 - f), g: rgb.g * f + 255 * (1 - f), b: rgb.b * f + 255 * (1 - f) }; }
    else if (t === "lumMod") { const h = rgbToHsl(rgb); h.l *= f; rgb = hslToRgb(h); }
    else if (t === "lumOff") { const h = rgbToHsl(rgb); h.l = Math.min(1, h.l + f); rgb = hslToRgb(h); }
    else if (t === "satMod") { const h = rgbToHsl(rgb); h.s = Math.min(1, h.s * f); rgb = hslToRgb(h); }
  }
  return rgbToHex(rgb);
}

function clrToHex(c, ctx) {
  if (!c) return null;
  const tag = ln(c); let hex = null;
  if (tag === "srgbClr") hex = "#" + (A(c, "val") || "");
  else if (tag === "sysClr") hex = "#" + (A(c, "lastClr") || A(c, "val") || "000000");
  else if (tag === "prstClr") hex = PRST_CLR[A(c, "val")] || null;
  else if (tag === "scrgbClr") { const p = (n) => clampByte((numA(c, n) || 0) / 100000 * 255); hex = rgbToHex({ r: p("r"), g: p("g"), b: p("b") }); }
  else if (tag === "schemeClr") { let name = A(c, "val"); if (ctx && ctx.clrMap && ctx.clrMap[name]) name = ctx.clrMap[name]; hex = (ctx && ctx.scheme && ctx.scheme[name]) || null; }
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return applyMods(hex.toLowerCase(), c);
}
const firstColorChild = (parent) => elKids(parent).find((ch) => COLOR_TAGS.has(ln(ch))) || null;
// Colour of a <…><solidFill>…</solidFill></…> wrapper (e.g. spPr, rPr, ln, bgPr).
const solidFillColor = (parent, ctx) => { const sf = first(parent, "solidFill"); return sf ? clrToHex(firstColorChild(sf), ctx) : null; };
function fillColor(spPr, ctx) {
  if (!spPr) return null;
  if (first(spPr, "noFill")) return "none";
  const solid = solidFillColor(spPr, ctx); if (solid) return solid;
  const grad = first(spPr, "gradFill"); // approximate with the first gradient stop
  if (grad) { const gs = firstDesc(grad, "gs"); if (gs) return clrToHex(firstColorChild(gs), ctx); }
  return null;
}

/* ── presentation plumbing ─────────────────────────────────────── */
const parseXml = async (zip, path) => { const f = zip.file(path); if (!f) return null; return new DOMParser().parseFromString(await f.async("string"), "application/xml"); };
const loadRels = async (zip, partPath) => {
  const dir = partPath.slice(0, partPath.lastIndexOf("/"));
  const name = partPath.slice(partPath.lastIndexOf("/") + 1);
  const doc = await parseXml(zip, `${dir}/_rels/${name}.rels`);
  const entries = doc ? Array.from(doc.getElementsByTagName("Relationship")).map((r) => ({ id: r.getAttribute("Id"), target: r.getAttribute("Target"), type: r.getAttribute("Type") || "" })) : [];
  const map = {}; entries.forEach((e) => { map[e.id] = e.target; });
  return { map, entries };
};
// Resolve a relationship target (which may be relative, ../, or absolute) to a part path.
const resolve = (base, target) => {
  if (!target) return null;
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/"); parts.pop();
  target.split("/").forEach((seg) => { if (seg === "..") parts.pop(); else if (seg !== "." && seg !== "") parts.push(seg); });
  return parts.join("/");
};
const relByType = (rels, basePath, suffix) => { const e = rels.entries.find((x) => x.type.endsWith(suffix)); return e ? resolve(basePath, e.target) : null; };

let _seq = 0;
const uid = () => "el" + Date.now().toString(36) + (_seq++).toString(36);

/* ── placeholder helpers ───────────────────────────────────────── */
const phOf = (sp) => { const ph = firstDesc(first(sp, "nvSpPr"), "ph") || firstDesc(first(sp, "nvPicPr"), "ph"); return ph ? { type: A(ph, "type") || "body", idx: A(ph, "idx") || "" } : null; };
const phCategory = (ph) => { if (!ph) return "other"; if (ph.type === "title" || ph.type === "ctrTitle") return "title"; if (ph.type === "body" || ph.type === "subTitle" || ph.type === "") return "body"; return "other"; };
const phKey = (ph) => `${phCategory(ph)}|${ph.idx}`;

// Map every placeholder in a layout/master spTree to its raw xfrm, by category|idx and category.
function buildPhMap(doc) {
  const map = {}, byCat = {};
  const tree = doc && (doc.getElementsByTagName("p:spTree")[0] || firstDesc(doc.documentElement, "spTree"));
  if (!tree) return { map, byCat };
  for (const sp of kids(tree, "sp")) {
    const ph = phOf(sp); if (!ph) continue;
    const xf = first(first(sp, "spPr"), "xfrm"); if (!xf) continue;
    if (!map[phKey(ph)]) map[phKey(ph)] = xf;
    if (!byCat[phCategory(ph)]) byCat[phCategory(ph)] = xf;
  }
  return { map, byCat };
}

// Default text styles from the master <p:txStyles> (title/body/other × level).
function buildTxStyles(masterDoc, ctx) {
  const ts = masterDoc && firstDesc(masterDoc.documentElement, "txStyles");
  const cat = (styleEl) => {
    const lv = {};
    if (styleEl) for (let i = 1; i <= 9; i++) {
      const lp = first(styleEl, "lvl" + i + "pPr"); if (!lp) continue;
      const dr = first(lp, "defRPr");
      lv[i] = {
        sz: dr && numA(dr, "sz") != null ? numA(dr, "sz") / 100 : undefined,
        bold: dr && A(dr, "b") === "1" || undefined,
        italic: dr && A(dr, "i") === "1" || undefined,
        color: dr ? solidFillColor(dr, ctx) : null,
        font: dr ? faceOf(first(dr, "latin")) : undefined,
        bullet: bulletOf(lp),
      };
    }
    return lv;
  };
  return { title: cat(first(ts, "titleStyle")), body: cat(first(ts, "bodyStyle")), other: cat(first(ts, "otherStyle")) };
}

const faceOf = (latin) => { const f = A(latin, "typeface"); if (!f) return undefined; return FONT_FACES[f.toLowerCase()] || (/mono|consol|courier/i.test(f) ? "'IBM Plex Mono', monospace" : /serif|times|georgia|garamond|cambria/i.test(f) ? "Georgia, serif" : undefined); };
const bulletOf = (pPr) => { if (!pPr) return undefined; if (first(pPr, "buNone")) return ""; const bc = first(pPr, "buChar"); if (bc) return A(bc, "char") || "•"; if (first(pPr, "buAutoNum")) return "#"; return undefined; };
const alignOf = (pPr) => ({ l: "left", ctr: "center", r: "right", just: "left" }[A(pPr, "algn")] || undefined);

// opts.uploadImage(File) => Promise<url>. When provided, images are uploaded to
// storage and referenced by URL (keeps the deck row tiny — base64-inlining a
// graphics-heavy deck makes the row many MB and times out the DB on save).
// Without it, images are inlined as base64 data URLs (guest / localStorage).
export async function importPptx(file, opts = {}) {
  const uploadImage = opts.uploadImage;
  const zip = await JSZip.loadAsync(file);
  const pres = await parseXml(zip, "ppt/presentation.xml");
  const sz = pres && firstDesc(pres.documentElement, "sldSz");
  const slideW = (sz && numA(sz, "cx")) || 12192000;
  const slideH = (sz && numA(sz, "cy")) || 6858000;
  const sx = VW / slideW, sy = VH / slideH;
  const pxPerPt = (VW * 12700) / slideW; // pt → our px

  // Caches keyed by part path so masters/layouts/themes are parsed once.
  const themeCache = {}, ctxCache = {}, phCache = {}, styleCache = {};
  const getTheme = async (path) => { if (!path) return {}; if (themeCache[path]) return themeCache[path]; const doc = await parseXml(zip, path); const out = {}; const cs = doc && firstDesc(doc.documentElement, "clrScheme"); if (cs) for (const ch of elKids(cs)) { const hex = clrToHex(firstColorChild(ch), null); if (hex) out[ln(ch)] = hex; } return (themeCache[path] = out); };

  // Resolve the full layout→master→theme context for one slide.
  const contextForSlide = async (slidePath, slideRels) => {
    const layoutPath = relByType(slideRels, slidePath, "slideLayout");
    const layoutDoc = layoutPath ? await parseXml(zip, layoutPath) : null;
    const layoutRels = layoutPath ? await loadRels(zip, layoutPath) : { map: {}, entries: [] };
    const masterPath = layoutPath ? relByType(layoutRels, layoutPath, "slideMaster") : null;
    const masterDoc = masterPath ? await parseXml(zip, masterPath) : null;
    const masterRels = masterPath ? await loadRels(zip, masterPath) : { map: {}, entries: [] };
    const themePath = masterPath ? relByType(masterRels, masterPath, "theme") : null;
    const scheme = await getTheme(themePath);
    const cmEl = masterDoc && firstDesc(masterDoc.documentElement, "clrMap");
    const clrMap = {}; Object.assign(clrMap, DEFAULT_CLRMAP); if (cmEl) for (const k of Object.keys(DEFAULT_CLRMAP)) { const v = A(cmEl, k); if (v) clrMap[k] = v; }
    const ctx = { scheme, clrMap, text: scheme[clrMap.tx1] || scheme.dk1 || "#1a1714" };
    const layoutPh = layoutPath ? (phCache[layoutPath] || (phCache[layoutPath] = buildPhMap(layoutDoc))) : { map: {}, byCat: {} };
    const masterPh = masterPath ? (phCache[masterPath] || (phCache[masterPath] = buildPhMap(masterDoc))) : { map: {}, byCat: {} };
    const styles = masterPath ? (styleCache[masterPath] || (styleCache[masterPath] = buildTxStyles(masterDoc, ctx))) : { title: {}, body: {}, other: {} };
    return { ctx, layoutPh, masterPh, styles, layoutDoc, masterDoc };
  };

  // Geometry: read a raw xfrm in EMU; transforms compose group → slide space.
  const rawXfrm = (xf) => { if (!xf) return null; const off = first(xf, "off"), ext = first(xf, "ext"); if (!off || !ext) return null; return { x: numA(off, "x") || 0, y: numA(off, "y") || 0, cx: numA(ext, "cx") || 0, cy: numA(ext, "cy") || 0, rot: numA(xf, "rot") || 0, flipH: A(xf, "flipH") === "1", flipV: A(xf, "flipV") === "1" }; };
  const T0 = { a: 1, d: 1, e: 0, f: 0 };
  const toPx = (raw, T) => raw && ({ x: Math.round((raw.x * T.a + T.e) * sx), y: Math.round((raw.y * T.d + T.f) * sy), w: Math.round(raw.cx * T.a * sx), h: Math.round(raw.cy * T.d * sy), rot: raw.rot ? Math.round(raw.rot / 60000) : 0, sa: T.a });

  const slidePaths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => +a.match(/slide(\d+)/)[1] - +b.match(/slide(\d+)/)[1]);

  const slides = [];
  for (const path of slidePaths) {
    const doc = await parseXml(zip, path); if (!doc) continue;
    const slideRels = await loadRels(zip, path);
    const { ctx, layoutPh, masterPh, styles, layoutDoc, masterDoc } = await contextForSlide(path, slideRels);
    const elements = [];

    // Geometry for a placeholder shape, inheriting from layout then master.
    const xfrmForShape = (sp, spPr) => {
      const own = first(spPr, "xfrm"); if (own) return rawXfrm(own);
      const ph = phOf(sp); if (!ph) return null;
      const k = phKey(ph), c = phCategory(ph);
      const inherited = layoutPh.map[k] || masterPh.map[k] || layoutPh.byCat[c] || masterPh.byCat[c];
      return inherited ? rawXfrm(inherited) : null;
    };

    const textOf = (r) => { const t = first(r, "t"); return t ? t.textContent : ""; };
    const buildText = (sp, spPr, rect) => {
      const txBody = first(sp, "txBody"); if (!txBody) return null;
      const ph = phOf(sp), cat = phCategory(ph), levels = styles[cat] || {};
      const lines = []; const sizes = []; let style = null; let auto = 0;
      const paras = kids(txBody, "p");
      for (const p of paras) {
        const pPr = first(p, "pPr");
        const lvl = (pPr ? numA(pPr, "lvl") || 0 : 0) + 1;
        const lvlDef = levels[lvl] || levels[1] || {};
        const runs = kids(p, "r");
        const txt = runs.map(textOf).join("") || (firstDesc(p, "t")?.textContent || "");
        const rp = runs.map((r) => first(r, "rPr")).find(Boolean);
        const sz = (rp && numA(rp, "sz") != null ? numA(rp, "sz") / 100 : undefined) ?? lvlDef.sz ?? (cat === "title" ? 40 : 18);
        sizes.push(sz);
        if (!style) style = {
          color: (rp ? solidFillColor(rp, ctx) : null) || lvlDef.color || ctx.text || "#1a1714",
          bold: rp && A(rp, "b") != null ? A(rp, "b") === "1" : !!lvlDef.bold,
          italic: (rp && A(rp, "i") === "1") || !!lvlDef.italic,
          font: faceOf(first(rp, "latin")) || lvlDef.font,
          align: alignOf(pPr),
        };
        let bullet = bulletOf(pPr); if (bullet === undefined) bullet = cat === "body" ? (lvlDef.bullet ?? "") : "";
        let prefix = "  ".repeat(Math.max(0, lvl - 1));
        if (bullet === "#") { auto++; prefix += auto + ". "; } else if (bullet) prefix += bullet + " ";
        if (txt.trim() !== "" || paras.length > 1) lines.push(prefix + txt);
      }
      const text = lines.join("\n").replace(/\s+$/, "");
      if (!text.trim()) return null;
      const basePt = cat === "title" ? Math.max(...sizes) : sizes[0];
      return {
        id: uid(), type: "text", x: rect?.x ?? 60, y: rect?.y ?? 60, width: rect?.w || 400, height: rect?.h || 80,
        text, fontSize: Math.max(8, Math.round(basePt * pxPerPt * (rect?.sa || 1))),
        color: style.color, bold: style.bold || undefined, italic: style.italic || undefined,
        align: style.align, font: style.font, rotation: rect?.rot || undefined,
      };
    };

    const walkShapes = (parent, T) => {
      for (const node of elKids(parent)) {
        const tag = ln(node);
        try {
          if (tag === "sp") {
            const spPr = first(node, "spPr");
            const rect = toPx(xfrmForShape(node, spPr), T);
            const hasText = !!firstDesc(first(node, "txBody"), "t");
            if (hasText) { const el = buildText(node, spPr, rect); if (el) elements.push(el); }
            else if (rect) {
              const geom = first(spPr, "prstGeom"); const prst = (geom && A(geom, "prst")) || "rect";
              const shape = prst === "ellipse" || prst === "circle" ? "ellipse" : /triangle/i.test(prst) ? "triangle" : /star/i.test(prst) ? "star" : "rect";
              const fill = fillColor(spPr, ctx); const lnEl = first(spPr, "ln");
              const stroke = solidFillColor(lnEl, ctx); const strokeW = lnEl && numA(lnEl, "w") != null ? Math.max(1, Math.round(numA(lnEl, "w") / 12700 * pxPerPt)) : undefined;
              if ((fill && fill !== "none") || stroke) elements.push({ id: uid(), type: "rect", shape, x: rect.x, y: rect.y, width: rect.w, height: rect.h, fill: fill === "none" ? undefined : fill || "#cccccc", stroke: stroke || undefined, strokeW, radius: /round/i.test(prst) ? 16 : undefined, dashed: lnEl && first(lnEl, "prstDash") && A(first(lnEl, "prstDash"), "val") !== "solid" || undefined, rotation: rect.rot || undefined });
            }
          } else if (tag === "cxnSp") {
            const spPr = first(node, "spPr"); const r = toPx(rawXfrm(first(spPr, "xfrm")), T);
            if (r) { const lnEl = first(spPr, "ln"); const color = solidFillColor(lnEl, ctx) || "#1a1714"; const raw = rawXfrm(first(spPr, "xfrm")); const thickness = lnEl && numA(lnEl, "w") != null ? Math.max(2, Math.round(numA(lnEl, "w") / 12700 * pxPerPt)) : 3; const x1 = raw.flipH ? r.x + r.w : r.x, x2 = raw.flipH ? r.x : r.x + r.w, y1 = raw.flipV ? r.y + r.h : r.y, y2 = raw.flipV ? r.y : r.y + r.h; elements.push({ id: uid(), type: "arrow", x1, y1, x2, y2, color, thickness }); }
          } else if (tag === "pic") {
            const spPr = firstDesc(node, "spPr"); const rect = toPx(rawXfrm(first(spPr, "xfrm")), T);
            const blip = firstDesc(node, "blip"); const id = blip && relEmbed(blip); const target = id && slideRels.map[id];
            if (rect && target) { const p = resolve(path, target); const f = zip.file(p); if (f) { const ext = p.split(".").pop().toLowerCase(); const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg"; elements.push({ id: uid(), type: "image", x: rect.x, y: rect.y, width: rect.w, height: rect.h, rotation: rect.rot || undefined, _src: { f, mime } }); } }
          } else if (tag === "graphicFrame") {
            const tbl = firstDesc(node, "tbl"); const rect = toPx(rawXfrm(first(node, "xfrm")), T);
            if (tbl && rect) {
              const grid = first(tbl, "tblGrid"); const cols = grid ? kids(grid, "gridCol").length : 0;
              const trs = kids(tbl, "tr");
              const cells = trs.map((tr) => kids(tr, "tc").map((tc) => { const tb = first(tc, "txBody"); return tb ? kids(tb, "p").map((p) => kids(p, "r").map(textOf).join("")).join("\n").trim() : ""; }));
              const headerRow = A(first(tbl, "tblPr"), "firstRow") !== "0"; // PPTX defaults a banded first row to header styling
              if (trs.length && cols) elements.push({ id: uid(), type: "table", x: rect.x, y: rect.y, width: rect.w, height: rect.h, rows: trs.length, cols, cells, headerRow, fontSize: 20, color: "#1a1714", borderColor: "#9a9486", headerBg: ctx.scheme.accent1 || "#1a1714", headerColor: "#ffffff" });
            }
          } else if (tag === "grpSp") {
            const g = rawXfrm(firstDesc(first(node, "grpSpPr"), "xfrm"));
            let Tn = T;
            if (g && g.cx && g.cy) { const off = first(firstDesc(first(node, "grpSpPr"), "xfrm"), "chOff"); const ext = first(firstDesc(first(node, "grpSpPr"), "xfrm"), "chExt"); const cox = off ? numA(off, "x") || 0 : 0, coy = off ? numA(off, "y") || 0 : 0; const ccx = ext ? numA(ext, "cx") || g.cx : g.cx, ccy = ext ? numA(ext, "cy") || g.cy : g.cy; const ga = g.cx / (ccx || 1), gd = g.cy / (ccy || 1); const ge = g.x - cox * ga, gf = g.y - coy * gd; Tn = { a: T.a * ga, d: T.d * gd, e: T.a * ge + T.e, f: T.d * gf + T.f }; }
            walkShapes(node, Tn);
          }
        } catch { /* skip malformed shape */ }
      }
    };

    const tree = doc.getElementsByTagName("p:spTree")[0] || firstDesc(doc.documentElement, "spTree");
    walkShapes(tree, T0);

    // Background: slide → layout → master, resolving theme colours; skip plain white.
    const bgOf = (d) => { const bg = d && firstDesc(d.documentElement, "bg"); if (!bg) return null; const bgPr = first(bg, "bgPr"); if (bgPr) return fillColor(bgPr, ctx); const bgRef = first(bg, "bgRef"); if (bgRef) return clrToHex(firstColorChild(bgRef), ctx); return null; };
    let bg = bgOf(doc) || bgOf(layoutDoc) || bgOf(masterDoc) || undefined;
    if (bg === "none" || bg === "#ffffff") bg = undefined;

    slides.push({ id: uid(), background: bg, elements });
  }

  // Resolve images — upload to storage (small deck row) or inline as base64.
  const imgEls = [];
  for (const s of slides) for (const el of s.elements) if (el._src) imgEls.push(el);
  const resolveImg = async (el) => {
    try {
      if (uploadImage) {
        const blob = await el._src.f.async("blob");
        const ext = ({ "image/png": "png", "image/gif": "gif", "image/svg+xml": "svg", "image/webp": "webp" })[el._src.mime] || "jpg";
        el.src = await uploadImage(new File([blob], `img.${ext}`, { type: el._src.mime }));
      } else {
        el.src = `data:${el._src.mime};base64,${await el._src.f.async("base64")}`;
      }
    } catch {}
    delete el._src;
  };
  const POOL = 6;
  for (let i = 0; i < imgEls.length; i += POOL) await Promise.all(imgEls.slice(i, i + POOL).map(resolveImg));
  for (const s of slides) s.elements = s.elements.filter((e) => e.type !== "image" || e.src);

  if (!slides.length) throw new Error("No slides found in this file.");
  return slides;
}
