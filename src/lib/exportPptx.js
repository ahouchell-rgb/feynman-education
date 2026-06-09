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

export async function exportDeck(deck) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "SK", width: W_IN, height: H_IN });
  pptx.layout = "SK";

  for (const s of deck.slides || []) {
    const slide = pptx.addSlide();
    if (s.background) slide.background = toFill(s.background);

    for (const el of s.elements || []) {
      if (el.type === "arrow") {
        const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
        const w = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
        slide.addShape(pptx.ShapeType.line, {
          x: xIn(x), y: yIn(y), w: wIn(w || 1), h: hIn(h || 1),
          flipH: el.x2 < el.x1, flipV: el.y2 < el.y1,
          line: { color: toHex(el.color), width: +((el.thickness || 6) * 0.75).toFixed(1), endArrowType: "triangle", beginArrowType: "none" },
        });
        continue;
      }

      if (el.type === "timer") {
        const d = el.duration ?? 300;
        const label = `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;
        slide.addText(label, {
          x: xIn(el.x), y: yIn(el.y), w: wIn(el.width), h: hIn(el.height || 100),
          fontSize: +((el.fontSize || 72) * 0.75).toFixed(1), color: toHex(el.color || "#ffffff"),
          bold: true, fontFace: "Consolas", align: "center", valign: "middle", fill: toFill(el.fill || "#1a1714"),
        });
        continue;
      }

      if (el.type === "video" || el.type === "visualiser" || el.type === "retrieval") {
        const b = { x: xIn(el.x), y: yIn(el.y), w: wIn(el.width), h: hIn(el.height || 100) };
        slide.addShape(pptx.ShapeType.rect, { ...b, fill: { color: "0F0F12" }, line: { type: "none" }, rectRadius: 0.04 });
        const label = el.type === "visualiser" ? "📷 Visualiser (live in app)"
          : el.type === "retrieval" ? `📚 Retrieval — ${el.url || "open in app"}`
          : `▶ ${el.src || "Video"}`;
        const link = el.type === "video" ? el.src : el.type === "retrieval" ? el.url : null;
        slide.addText(label, { ...b, color: "FFFFFF", fontSize: 13, align: "center", valign: "middle",
          hyperlink: link ? { url: link } : undefined });
        continue;
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
        continue;
      }

      const box = { x: xIn(el.x), y: yIn(el.y), w: wIn(el.width), h: hIn(el.height || 100) };
      if (el.type === "rect") {
        slide.addShape(pptx.ShapeType.rect, {
          ...box, fill: toFill(el.fill),
          line: el.stroke ? { color: toHex(el.stroke), width: +((el.strokeW || 3) * 0.75).toFixed(1) } : { type: "none" },
          rectRadius: el.radius ? Math.min(0.2, el.radius / 200) : 0.04,
        });
      } else if (el.type === "image") {
        slide.addImage({ ...box, path: el.src });
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
        });
      }
    }
  }

  const name = (deck.title || "deck").replace(/[^\w\- ]/g, "").trim() || "deck";
  await pptx.writeFile({ fileName: `${name}.pptx` });
}
