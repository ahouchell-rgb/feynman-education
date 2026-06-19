// Server-side feedforward PPTX generator — AHO house style (pptxgenjs).
// Mirrors the standalone python generator: red diagnostic header per topic,
// bordered activity boxes (teal stripe) with cloze/matching/exam scaffolds.
//
//   buildFeedforwardPptx({ classLabel, halfTerm, topics }) -> Promise<Buffer>
//   topics: [{ topic, stat, activities: [{ title, wordbank?, lines: [...] }] }]
//
// CommonJS so it runs both in a Node route (import) and standalone (require).
const PptxGenJS = require("pptxgenjs");

const FONT = "Arial";
const RED = "C01000", INK = "202020", GREY = "808080";
const BOX_FILL = "F5F6F8", BOX_LINE = "D3D7DD", ACCENT = "0A7A88", WB = "6A5510";
const SW = 13.333, SH = 7.5, MARGIN = 0.55, BODY_TOP = 1.65, BODY_BOT = 7.15, GUT = 0.22, CPI = 17;

const estLines = (t, w) => Math.max(1, Math.ceil(t.length / Math.max(1, Math.floor((w - 0.3) * CPI))));
function boxHeight(act, w) {
  let rows = 1 + (act.wordbank ? 1 : 0);
  for (const l of act.lines) rows += estLines(l, w) + 0.15;
  return 0.18 + rows * 0.235 + 0.12;
}

function addBox(slide, pptx, act, x, y, w, h) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06,
    fill: { color: BOX_FILL }, line: { color: BOX_LINE, width: 0.75 } });
  slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.06, h, fill: { color: ACCENT }, line: { type: "none" } });
  const runs = [{ text: act.title, options: { bold: true, color: "101010", fontSize: 12, breakLine: true } }];
  if (act.wordbank)
    runs.push({ text: "Word bank:  " + act.wordbank, options: { italic: true, color: WB, fontSize: 10.5, breakLine: true } });
  act.lines.forEach((l) => runs.push({ text: l, options: { color: INK, fontSize: 11, breakLine: true } }));
  slide.addText(runs, { x: x + 0.18, y: y + 0.1, w: w - 0.32, h: h - 0.2,
    valign: "top", align: "left", fontFace: FONT, margin: 0, lineSpacingMultiple: 1.05, paraSpaceAfter: 4 });
}

async function buildFeedforwardPptx({ classLabel, halfTerm, topics }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "W", width: SW, height: SH });
  pptx.layout = "W";

  // title slide
  let s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 2.6, w: SW, h: 0.08, fill: { color: RED }, line: { type: "none" } });
  s.addText("HALF-TERM RETRIEVAL FEEDFORWARD", { x: MARGIN, y: 2.2, w: 9, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: RED, margin: 0 });
  s.addText([
    { text: `${classLabel} · ${halfTerm}`, options: { bold: true, color: "151515", fontSize: 38, breakLine: true } },
    { text: "Topics the live retrieval data flags as weakest — scaffolded re-practice", options: { color: GREY, fontSize: 16 } },
  ], { x: MARGIN, y: 2.8, w: SW - 2 * MARGIN, h: 1.4, fontFace: FONT, valign: "top", margin: 0 });

  // one slide per weak topic
  for (const t of topics) {
    s = pptx.addSlide();
    s.background = { color: "FFFFFF" };
    s.addText(`${classLabel} · HALF-TERM RETRIEVAL REVIEW`, { x: MARGIN, y: 0.35, w: SW - 2 * MARGIN, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: GREY, margin: 0 });
    s.addText(`${t.topic}  ·  ${t.stat}`, { x: MARGIN, y: 0.72, w: SW - 2 * MARGIN, h: 0.85, fontFace: FONT, fontSize: 17, bold: true, color: RED, valign: "top", margin: 0 });
    let y = BODY_TOP;
    for (const act of t.activities) {
      if (!act.lines || !act.lines.length) continue;
      const h = boxHeight(act, SW - 2 * MARGIN);
      addBox(s, pptx, act, MARGIN, y, SW - 2 * MARGIN, h);
      y += h + GUT;
    }
    if (y - GUT > BODY_BOT) console.warn(`[feedforward] ${t.topic}: content may overflow (${(y - GUT).toFixed(2)}in > ${BODY_BOT})`);
  }

  return pptx.write({ outputType: "nodebuffer" });
}

// estLines/boxHeight exported for unit tests — the layout maths is the fragile bit
// (overflow warnings above prove it) and is pure, so it can be checked in isolation.
module.exports = { buildFeedforwardPptx, estLines, boxHeight, CPI };
