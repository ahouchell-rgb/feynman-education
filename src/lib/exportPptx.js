import PptxGenJS from "pptxgenjs";

/* Map the 960×540 virtual canvas onto a 10in × 5.625in 16:9 slide. */
const VW = 960, VH = 540, W_IN = 10, H_IN = 5.625;
const xIn = (v) => +((v / VW) * W_IN).toFixed(3);
const yIn = (v) => +((v / VH) * H_IN).toFixed(3);
const wIn = (v) => +((v / VW) * W_IN).toFixed(3);
const hIn = (v) => +((v / VH) * H_IN).toFixed(3);

/* PptxGenJS wants "RRGGBB" + an optional 0–100 transparency. Accepts our
   hex colours and the theme's rgba() fills. */
function toFill(c) {
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
const toHex = (c) => toFill(c).color;

/* Rotation: PptxGenJS wants an integer 0–359 (clockwise), matching our CSS
   `rotate(Ndeg)`. Returns undefined when there's nothing to rotate. */
const rot = (el) => (el.rotation ? ((Math.round(el.rotation) % 360) + 360) % 360 : undefined);

/* ── Image crop ──────────────────────────────────────────────────────────
   Crops are stored as {x,y,w,h} fractions (0–1) of the source image. PptxGenJS
   has no clean fractional-source crop, so we draw the cropped region onto a
   canvas and embed the result. Falls back to the original image if the source
   can't be read (e.g. a cross-origin URL that taints the canvas). */
function loadImage(src) {
  return new Promise((res, rej) => {
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

  if (el.type === "video" || el.type === "visualiser" || el.type === "retrieval") {
    const b = { x: xIn(el.x), y: yIn(el.y), w: wIn(el.width), h: hIn(el.height || 100) };
    slide.addShape(pptx.ShapeType.rect, { ...b, fill: { color: "0F0F12" }, line: { type: "none" }, rectRadius: 0.04, rotate: rot(el) });
    const label = el.type === "visualiser" ? "📷 Visualiser (live in app)"
      : el.type === "retrieval" ? `📚 Retrieval — ${el.url || "open in app"}`
      : `▶ ${el.src || "Video"}`;
    const link = el.type === "video" ? el.src : el.type === "retrieval" ? el.url : null;
    slide.addText(label, { ...b, color: "FFFFFF", fontSize: 13, align: "center", valign: "middle",
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
    slide.addShape(pptx.ShapeType.rect, {
      ...box, fill: toFill(el.fill),
      line: el.stroke ? { color: toHex(el.stroke), width: +((el.strokeW || 3) * 0.75).toFixed(1) } : { type: "none" },
      rectRadius: el.radius ? Math.min(0.2, el.radius / 200) : 0.04,
      rotate: rot(el),
    });
  } else if (el.type === "image") {
    let data = null;
    if (el.crop) { try { data = await cropToDataURL(el.src, el.crop); } catch { data = null; } }
    if (data) slide.addImage({ ...box, data, rotate: rot(el) });
    else slide.addImage({ ...box, path: el.src, rotate: rot(el) });
  } else if (el.type === "text") {
    slide.addText(el.text || "", {
      ...box,
      h: hIn(el.height || el.fontSize * 1.5),
      fontSize: +(el.fontSize * 0.75).toFixed(1), // px → pt at this scale
      color: toHex(el.color),
      fontFace: el.fontFace || "Arial",
      bold: !!el.bold,
      italic: !!el.italic,
      align: el.align || "left",
      valign: "top",
      fill: el.bg ? toFill(el.bg) : undefined,
      wrap: true,
      margin: el.bg ? 6 : 0,
      rotate: rot(el),
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
function revealFrames(elements) {
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

export async function exportDeck(deck) {
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

  const name = (deck.title || "deck").replace(/[^\w\- ]/g, "").trim() || "deck";
  await pptx.writeFile({ fileName: `${name}.pptx` });
}
