import PptxGenJS from "pptxgenjs";

/* Map the 960×540 virtual canvas onto a 10in × 5.625in 16:9 slide. */
const VW = 960, VH = 540, W_IN = 10, H_IN = 5.625;
export const xIn = (v) => +((v / VW) * W_IN).toFixed(3);
export const yIn = (v) => +((v / VH) * H_IN).toFixed(3);
export const wIn = (v) => +((v / VW) * W_IN).toFixed(3);
export const hIn = (v) => +((v / VH) * H_IN).toFixed(3);

/* PptxGenJS wants "RRGGBB" + an optional 0–100 transparency. Accepts our
   hex colours and the theme's rgba() fills. */
export function toFill(c) {
  if (!c) return { color: "FFFFFF" };
  if (c.startsWith("#")) return { color: c.slice(1).padEnd(6, "0").slice(0, 6).toUpperCase() };
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((s) => s.trim());
    const hx = (n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
    return { color: (hx(parts[0]) + hx(parts[1]) + hx(parts[2])).toUpperCase(), transparency: Math.round((1 - a) * 100) };
  }
  return { color: "CCCCCC" };
}
export const toHex = (c) => toFill(c).color;
const CHART_PALETTE = ["2e3a5f", "b95a3c", "5e7c4b", "c9a227", "7a4e7e", "3b7dd8", "9a3b5a", "3b9a86"];

/* Convert a rich-text box's HTML (el.rich) into PptxGenJS text runs, preserving
   bold/italic/underline/colour and bullet/numbered lists with indent. Returns
   null on any problem so the caller can fall back to plain text. */
export function richToRuns(html) {
  if (typeof DOMParser === "undefined") return null;
  let doc;
  try { doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html"); } catch { return null; }
  const colorOf = (node) => node.style?.color || node.getAttribute?.("color") || null;
  const lines = []; let cur = { runs: [], bullet: undefined, indent: 0 };
  const flush = () => { if (cur.runs.some((r) => r.text.trim() !== "")) lines.push(cur); cur = { runs: [], bullet: undefined, indent: 0 }; };
  const add = (text, fmt) => { if (text) cur.runs.push({ text, ...fmt }); };
  const walk = (node, fmt, list) => {
    for (const n of Array.from(node.childNodes) as any[]) {
      if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, " "); if (t) add(t, fmt); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { flush(); continue; }
      if (tag === "ul" || tag === "ol") { walk(n, fmt, { ordered: tag === "ol", depth: (list?.depth || 0) + 1 }); continue; }
      if (tag === "li") { flush(); cur.bullet = list?.ordered ? { type: "number" } : true; cur.indent = Math.max(0, (list?.depth || 1) - 1); walk(n, fmt, list); flush(); continue; }
      if (tag === "div" || tag === "p") { flush(); walk(n, fmt, list); flush(); continue; }
      const f = { ...fmt };
      if (tag === "b" || tag === "strong") f.bold = true;
      if (tag === "i" || tag === "em") f.italic = true;
      if (tag === "u") f.underline = true;
      const c = colorOf(n); if (c) f.color = c;
      walk(n, f, list);
    }
  };
  try { walk(doc.body, {}, null); } catch { return null; }
  flush();
  const out = [];
  lines.forEach((ln) => ln.runs.forEach((r, i) => out.push({
    text: r.text,
    options: { bold: r.bold || undefined, italic: r.italic || undefined, underline: r.underline || undefined,
      color: r.color ? toHex(r.color) : undefined, bullet: ln.bullet, indentLevel: ln.indent || undefined,
      breakLine: i === ln.runs.length - 1 },
  })));
  return out.length ? out : null;
}

/* Rotation: PptxGenJS wants an integer 0–359 (clockwise), matching our CSS
   `rotate(Ndeg)`. Returns undefined when there's nothing to rotate. */
export const rot = (el) => (el.rotation ? ((Math.round(el.rotation) % 360) + 360) % 360 : undefined);

/* An element's optional hyperlink, as a PptxGenJS `hyperlink` option. Only
   http/https/mailto survive (matching the in-app sanitiser) so a shared deck
   can't smuggle a script-url into the exported file. Undefined when no link. */
export function linkOpt(el) {
  const u = (el?.href || "").trim();
  if (!u) return undefined;
  if (/^mailto:/i.test(u) || /^https?:\/\//i.test(u)) return { url: u };
  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(u)) return { url: "https://" + u };
  return undefined;
}

/* ── Image crop ──────────────────────────────────────────────────────────
   Crops are stored as {x,y,w,h} fractions (0–1) of the source image. PptxGenJS
   has no clean fractional-source crop, so we draw the cropped region onto a
   canvas and embed the result. Falls back to the original image if the source
   can't be read (e.g. a cross-origin URL that taints the canvas). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image load failed"));
    img.src = src;
  });
}
async function cropToDataURL(src, crop) {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sw = Math.max(1, Math.round(crop.w * iw)), sh = Math.max(1, Math.round(crop.h * ih));
  const canvas = document.createElement("canvas");
  canvas.width = sw; canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, crop.x * iw, crop.y * ih, crop.w * iw, crop.h * ih, 0, 0, sw, sh);
  return canvas.toDataURL("image/png"); // throws if the canvas is tainted
}

/* Render a single element onto a pptx slide. Async only because images may
   need cropping; everything else resolves synchronously. */
async function renderEl(pptx, slide, el) {
  if (el.type === "arrow") {
    const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
    const w = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
    slide.addShape(pptx.ShapeType.line, {
      x: xIn(x), y: yIn(y), w: wIn(w || 1), h: hIn(h || 1),
      flipH: el.x2 < el.x1, flipV: el.y2 < el.y1,
      line: { color: toHex(el.color), width: +((el.thickness || 6) * 0.75).toFixed(1), endArrowType: "triangle", beginArrowType: "none" },
    });
    return;
  }

  if (el.type === "timer") {
    const d = el.duration ?? 300;
    const label = `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;
    slide.addText(label, {
      x: xIn(el.x), y: yIn(el.y), w: wIn(el.width), h: hIn(el.height || 100),
      fontSize: +((el.fontSize || 72) * 0.75).toFixed(1), color: toHex(el.color || "#ffffff"),
      bold: true, fontFace: "Consolas", align: "center", valign: "middle", fill: toFill(el.fill || "#1a1714"),
      rotate: rot(el),
    });
    return;
  }

  if (el.type === "video" || el.type === "visualiser" || el.type === "retrieval" || el.type === "html") {
    const b = { x: xIn(el.x), y: yIn(el.y), w: wIn(el.width), h: hIn(el.height || 100) };
    const isHtml = el.type === "html";
    slide.addShape(pptx.ShapeType.rect, { ...b, fill: { color: isHtml ? "FFFFFF" : "0F0F12" }, line: isHtml ? { color: "9A9486", width: 1 } : { type: "none" }, rectRadius: 0.04, rotate: rot(el) });
    const label = el.type === "visualiser" ? "📷 Visualiser (live in app)"
      : el.type === "retrieval" ? `📚 Retrieval — ${el.url || "open in app"}`
      : isHtml ? `❮❯ ${el.title || "HTML template"} (interactive in app)`
      : `▶ ${el.src || "Video"}`;
    const link = el.type === "video" ? el.src : el.type === "retrieval" ? el.url : null;
    slide.addText(label, { ...b, color: isHtml ? "1A1714" : "FFFFFF", fontSize: 13, align: "center", valign: "middle",
      hyperlink: link ? { url: link } : undefined, rotate: rot(el) });
    return;
  }

  if (el.type === "table") {
    const rows = el.rows || 1, cols = el.cols || 1;
    const headerBg = (el.headerBg || "#1a1714").replace("#", "");
    const headerColor = (el.headerColor || "#ffffff").replace("#", "");
    const txt = toHex(el.color || "#1a1714");
    const tableRows = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const head = el.headerRow && r === 0;
        row.push({ text: el.cells?.[r]?.[c] || "", options: head ? { bold: true, fill: { color: headerBg }, color: headerColor } : { color: txt } });
      }
      tableRows.push(row);
    }
    slide.addTable(tableRows, {
      x: xIn(el.x), y: yIn(el.y), w: wIn(el.width), h: hIn(el.height || 100),
      border: { type: "solid", color: (el.borderColor || "#9a9486").replace("#", ""), pt: 1 },
      fontSize: +((el.fontSize || 22) * 0.75).toFixed(1), fontFace: "Arial", valign: "middle", autoPage: false,
    });
    return;
  }

  const box = { x: xIn(el.x), y: yIn(el.y), w: wIn(el.width), h: hIn(el.height || 100) };
  if (el.type === "rect") {
    // Gradient fills degrade to a solid colour (the first stop, `el.fill`) so the
    // export never chokes on a fill type PptxGenJS can't render natively here.
    const shapeType = el.shape === "ellipse" ? pptx.ShapeType.ellipse
      : el.shape === "triangle" ? pptx.ShapeType.triangle
      : el.shape === "hexagon" ? pptx.ShapeType.hexagon
      : pptx.ShapeType.rect; // star / speech / rect → rect box (closest portable shape)
    slide.addShape(shapeType, {
      ...box, fill: toFill(el.fill),
      line: el.stroke ? { color: toHex(el.stroke), width: +((el.strokeW || 3) * 0.75).toFixed(1) } : { type: "none" },
      rectRadius: el.radius ? Math.min(0.2, el.radius / 200) : 0.04,
      rotate: rot(el), hyperlink: linkOpt(el),
    });
  } else if (el.type === "image") {
    let data = null;
    if (el.crop) { try { data = await cropToDataURL(el.src, el.crop); } catch { data = null; } }
    if (data) slide.addImage({ ...box, data, rotate: rot(el), hyperlink: linkOpt(el) });
    else slide.addImage({ ...box, path: el.src, rotate: rot(el), hyperlink: linkOpt(el) });
  } else if (el.type === "text") {
    const richRuns = el.rich ? richToRuns(el.rich) : null;
    slide.addText(richRuns || (el.text || ""), {
      ...box,
      h: hIn(el.height || el.fontSize * 1.5),
      fontSize: +(el.fontSize * 0.75).toFixed(1), // px → pt at this scale
      color: toHex(el.color),
      fontFace: el.fontFace || "Arial",
      bold: !!el.bold,
      italic: !!el.italic,
      align: el.align || "left",
      valign: "top",
      lineSpacingMultiple: el.lineHeight || undefined, // line spacing (Tier 2)
      fill: el.bg ? toFill(el.bg) : undefined,
      wrap: true,
      margin: el.bg ? 6 : 0,
      rotate: rot(el), hyperlink: linkOpt(el),
    });
  } else if (el.type === "chart") {
    const labels = el.labels?.length ? el.labels.map(String) : ["A", "B", "C"];
    const series = el.series?.length ? el.series : [{ name: "Series 1", values: [1, 2, 3] }];
    const ct = el.chartType === "line" ? pptx.ChartType.line : el.chartType === "pie" ? pptx.ChartType.pie : pptx.ChartType.bar;
    const data = el.chartType === "pie"
      ? [{ name: el.title || "Data", labels, values: (series[0]?.values || []).map((v) => +v || 0) }]
      : series.map((s) => ({ name: s.name || "Series", labels, values: (s.values || []).map((v) => +v || 0) }));
    const colors = el.chartType === "pie"
      ? labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length])
      : series.map((s, i) => (s.color ? toHex(s.color) : CHART_PALETTE[i % CHART_PALETTE.length]));
    slide.addChart(ct, data, {
      ...box, chartColors: colors,
      showLegend: el.chartType === "pie" || (series.length > 1 && el.showLegend !== false), legendPos: "b",
      showTitle: !!el.title, title: el.title || "", titleColor: toHex(el.color), titleFontSize: 14,
      showValue: false, catAxisLabelColor: toHex(el.color), valAxisLabelColor: toHex(el.color),
    });
  } else if (el.type === "equation") {
    // PowerPoint has no portable way to take rendered KaTeX, so export the
    // LaTeX source as a monospace box (still readable / re-typable).
    slide.addText(el.latex || "", {
      ...box, h: hIn(el.height || 80),
      fontSize: +((el.fontSize || 36) * 0.55).toFixed(1), color: toHex(el.color),
      fontFace: "Consolas", align: el.align || "center", valign: "middle",
      fill: el.bg ? toFill(el.bg) : undefined, wrap: true, rotate: rot(el),
    });
  }
}

/* Deck "master": header/footer brand text drawn on every exported slide
   (unless the slide opts out with hideMaster). Mirrors MasterFrame in the app. */
function masterTokenExport(str, index, total, title) {
  return String(str || "")
    .replace(/\{n\}/g, index + 1).replace(/\{total\}/g, total)
    .replace(/\{title\}/g, title || "").replace(/\{date\}/g, new Date().toLocaleDateString("en-GB"));
}
function drawMaster(slide, master, index, total, title) {
  if (!master?.enabled) return;
  const color = toHex(master.color || "#6b6256");
  const cell = (txt, align, top) => {
    const t = masterTokenExport(txt, index, total, title);
    if (!t) return;
    slide.addText(t, { x: xIn(44), y: yIn(top), w: wIn(VW - 88), h: hIn(26), align, valign: "middle", fontSize: 11, color, fontFace: "Arial" });
  };
  const row = (top, l, c, r) => { cell(l, "left", top); cell(c, "center", top); cell(r, "right", top); };
  row(14, master.headerLeft, master.headerCenter, master.headerRight);
  if (master.showRule) slide.addShape("line", { x: xIn(44), y: yIn(VH - 40), w: wIn(VW - 88), h: 0, line: { color: toHex(master.accent || master.color || "#6b6256"), width: 1 } });
  row(VH - 34, master.footerLeft, master.footerCenter, master.footerRight);
}

/* A slide with reveal-on-click elements becomes a sequence of PowerPoint
   slides — one per reveal step — so the click-through teaching flow survives
   export (PPTX has no native equivalent of our reveal mechanism). A slide with
   no reveals exports as a single slide, unchanged. Returns an array of element
   lists, one per exported slide. */
export function revealFrames(elements) {
  const els = elements || [];
  const revealCount = els.filter((e) => e.reveal).length;
  if (revealCount === 0) return [els];
  const frames = [];
  for (let step = 0; step <= revealCount; step++) {
    let seen = 0;
    frames.push(els.filter((e) => (e.reveal ? seen++ < step : true)));
  }
  return frames;
}

/* A safe-ish filename stem from the deck title (no extension). */
export const deckFileStem = (deck) => (deck?.title || "deck").replace(/[^\w\- ]/g, "").trim() || "deck";

/* Build the PptxGenJS document for a deck. Shared by the local download
   (exportDeck) and the Drive save-back (exportDeckBlob) paths so the two can
   never drift. */
export async function buildDeckPptx(deck) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "SK", width: W_IN, height: H_IN });
  pptx.layout = "SK";

  const all = deck.slides || [];
  for (let si = 0; si < all.length; si++) {
    const s = all[si];
    for (const frameEls of revealFrames(s.elements)) {
      const slide = pptx.addSlide();
      if (s.background) slide.background = toFill(s.background);
      if (s.notes) slide.addNotes(s.notes);
      for (const el of frameEls) await renderEl(pptx, slide, el);
      if (!s.hideMaster) drawMaster(slide, deck.master, si, all.length, deck.title);
    }
  }
  return pptx;
}

/* Download the deck as a .pptx in the browser. */
export async function exportDeck(deck) {
  const pptx = await buildDeckPptx(deck);
  await pptx.writeFile({ fileName: `${deckFileStem(deck)}.pptx` });
}

/* Render the deck to a .pptx Blob (for uploading to Drive / OneDrive). */
export async function exportDeckBlob(deck): Promise<Blob> {
  const pptx = await buildDeckPptx(deck);
  return (await pptx.write({ outputType: "blob" })) as Blob;
}
