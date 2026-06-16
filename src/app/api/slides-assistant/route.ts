// Feynman Education — Slides assistant
// POST /api/slides-assistant
//
// Body: { slides: Slide[], currentSlide: number, instruction: string }
// Returns: { slides: Slide[], summary: string }
//
// Claude edits the whole deck and returns it via a forced tool call, so the
// response is always valid structured JSON we can apply straight to the editor.
//
// Required env: ANTHROPIC_API_KEY (set in .env.local for local dev, Vercel for prod).

export const runtime = "edge";

const MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 8000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const SYSTEM = `You edit a slide deck for a UK secondary science teacher. The deck is a JSON array of slides on a FIXED 960×540 canvas (16:9, pixels). You always return the COMPLETE updated deck via the edit_deck tool.

COORDINATES: x,y is the top-left of an element in pixels, 0–960 across and 0–540 down. Keep elements inside the canvas with ~60px margins. Never overlap text blocks.

ELEMENT TYPES YOU CAN CREATE:
- text:  { id, type:"text", x, y, width, height, text, fontSize, color, bold?, italic?, align?, bg?, font? }
    fontSize px: headings 44–72, subheadings 30–40, body 22–30. color is a #hex. align is "left"|"center"|"right".
    bg (optional) is a #hex highlight drawn behind the text — use it for labels/callouts/key terms. font (optional) is one of: "Sans","Serif","Mono","Friendly","Classic","Verdana".
- rect:  { id, type:"rect", x, y, width, height, fill, stroke?, radius? }   fill/stroke are #hex; radius is corner rounding. Use as callout boxes or panels BEHIND text (give the box a lower position in the array so text sits on top).
- arrow: { id, type:"arrow", x1, y1, x2, y2, color, thickness? }   points FROM (x1,y1) TO (x2,y2); the arrowhead is at the (x2,y2) end.
- table: { id, type:"table", x, y, width, height, rows, cols, cells, headerRow?, fontSize?, color?, borderColor?, headerBg?, headerColor?, font? }
    cells is a 2D array [rows][cols] of strings. Set headerRow:true to style the first row as a header. Great for comparisons and data.
- timer: { id, type:"timer", x, y, width, height, duration, fill?, color?, fontSize? }
    duration is SECONDS (e.g. 300 = 5 min). It counts down live when the teacher presents. Use for "Do Now" / timed tasks. A good size is ~280×150, fontSize 72, fill "#1a1714", color "#ffffff".
- equation: { id, type:"equation", x, y, width, height, latex, fontSize, color, align? }
    latex is a LaTeX math string (KaTeX), e.g. "6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2" or "v = f\\lambda". Use for any maths/science formula, equation or expression. fontSize ~36–56. Prefer this over plain text for real equations.
- chart: { id, type:"chart", x, y, width, height, chartType, title?, labels, series, showLegend?, color? }
    chartType is "bar" | "line" | "pie". labels is an array of category names. series is an array of { name, color (#hex), values (array of numbers, one per label) }. For pie, use ONE series. color is the axis/label text colour. Use for data, results, trends and comparisons. A good size is ~480×320.

ELEMENT TYPES YOU CAN KEEP/MOVE/RESIZE BUT MUST NOT CREATE (you don't have a valid source URL for them):
- image { ...src }, video { ...src }, visualiser, retrieval, html. Preserve any that already exist; reposition them if asked, but never invent new ones. An html element is an imported web-page template that fills its box and runs live when presented; its markup is hidden from you (shown as "[html omitted]") — keep it as-is, you may move/resize it but never change its html.

REVEAL ON CLICK: any element may have reveal:true. Revealed elements are hidden when the slide first appears and the teacher clicks to reveal them one at a time, in array order. Use this for answers, exit-ticket responses, and "click to check" — put the question visible and mark the answer element reveal:true.

ROTATION: any element may have rotation (degrees clockwise). Use sparingly.

SLIDE: { id, background?, notes?, elements: [...] }   background is an optional #hex (default white). notes is optional speaker-note text shown to the teacher in Presenter view — add concise teaching notes when it helps.

RULES:
- PRESERVE existing slides and elements unless the instruction asks to change them. The current slide index is given — "this slide" means that one.
- Give every NEW element a unique id like "el" followed by random digits.
- Lay out cleanly: a title near the top, content below, generous spacing. Aim for the look of a well-made teaching slide.
- Palette when sensible: biology green #5e7c4b, chemistry orange/red #b95a3c, physics blue #2e3a5f, dark text #1a1714 on light backgrounds. Soft tinted backgrounds (e.g. #f3eee2) read well on a projector.
- For labelled diagrams, draw arrows from a text label to the part it points at.
- Keep all content scientifically accurate and pitched at KS3–GCSE.
- Return EVERY slide in the deck, in order — not just the ones you changed.
- Put a one-sentence plain-English description of what you did in "summary".`;

const ELEMENT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: ["text", "rect", "arrow", "image", "table", "timer", "video", "visualiser", "retrieval", "html", "equation", "chart"] },
    x: { type: "number" }, y: { type: "number" },
    width: { type: "number" }, height: { type: "number" },
    text: { type: "string" }, fontSize: { type: "number" }, color: { type: "string" },
    bold: { type: "boolean" }, italic: { type: "boolean" }, align: { type: "string" },
    bg: { type: "string" }, font: { type: "string" }, rich: { type: "string" },
    fill: { type: "string" }, stroke: { type: "string" }, radius: { type: "number" },
    x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" },
    thickness: { type: "number" }, src: { type: "string" },
    // table
    rows: { type: "number" }, cols: { type: "number" },
    cells: { type: "array", items: { type: "array", items: { type: "string" } } },
    headerRow: { type: "boolean" }, headerBg: { type: "string" }, headerColor: { type: "string" }, borderColor: { type: "string" },
    // timer
    duration: { type: "number" },
    // html template (content is stripped before the call and restored after)
    html: { type: "string" }, title: { type: "string" },
    // equation (LaTeX)
    latex: { type: "string" },
    // chart
    chartType: { type: "string" }, showLegend: { type: "boolean" },
    labels: { type: "array", items: { type: "string" } },
    series: { type: "array", items: { type: "object", properties: { name: { type: "string" }, color: { type: "string" }, values: { type: "array", items: { type: "number" } } } } },
    // shared flags
    reveal: { type: "boolean" }, rotation: { type: "number" },
  },
  required: ["type"],
};

const TOOL = {
  name: "edit_deck",
  description: "Replace the deck with the full updated set of slides.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One short sentence describing what changed." },
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            background: { type: "string" },
            notes: { type: "string" },
            elements: { type: "array", items: ELEMENT_SCHEMA },
          },
          required: ["elements"],
        },
      },
    },
    required: ["summary", "slides"],
  },
};

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." }, 500);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const slides = Array.isArray(body?.slides) ? body.slides : [];
  const currentSlide = Number.isInteger(body?.currentSlide) ? body.currentSlide : 0;
  const instruction = String(body?.instruction || "").trim();

  if (!instruction) return json({ error: "instruction is required" }, 400);
  if (instruction.length > 2000) return json({ error: "Instruction is too long." }, 400);

  // Imported HTML templates can be tens of KB each — far too large for Claude to
  // echo back inside the 8K output budget. Strip the markup (keyed by element id)
  // before the call and splice it back into the result afterwards.
  const htmlById = {};
  const richById = {}; // id → { rich, text } so we can restore inline formatting Claude can't see
  const sentSlides = slides.map((s) => ({
    ...s,
    elements: (s.elements || []).map((e) => {
      if (e && e.type === "html") { if (e.id) htmlById[e.id] = e.html; return { ...e, html: "[html omitted]" }; }
      if (e && e.type === "text" && e.rich) { if (e.id) richById[e.id] = { rich: e.rich, text: e.text }; const { rich, ...rest } = e; return rest; }
      return e;
    }),
  }));

  const userText =
    `Current slide index: ${currentSlide}\n` +
    `Current deck (JSON):\n${JSON.stringify(sentSlides)}\n\n` +
    `Instruction: ${instruction}`;

  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: "edit_deck" },
      }),
    });
  } catch (e) {
    return json({ error: `Request to Claude failed: ${e.message}` }, 502);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return json({ error: `Claude ${res.status}: ${t.slice(0, 300)}` }, 502);
  }

  const data = await res.json();
  const toolBlock = (data.content || []).find((b) => b.type === "tool_use" && b.name === "edit_deck");
  if (!toolBlock?.input?.slides) {
    return json({ error: "Claude did not return a deck. Try rephrasing." }, 502);
  }

  // Map font labels → the CSS/face the editor uses.
  const FONT_CSS = { Sans: "'IBM Plex Sans', sans-serif", Serif: "Georgia, 'Instrument Serif', serif", Mono: "'IBM Plex Mono', monospace", Friendly: "'Comic Sans MS', 'Chalkboard SE', sans-serif", Classic: "'Times New Roman', serif", Verdana: "Verdana, sans-serif" };
  const FONT_FACE = { Sans: "Arial", Serif: "Georgia", Mono: "Consolas", Friendly: "Comic Sans MS", Classic: "Times New Roman", Verdana: "Verdana" };
  const usesFont = (t) => t === "text" || t === "table";
  const slidesOut = (toolBlock.input.slides || []).map((s) => ({
    ...s,
    elements: (s.elements || []).map((e) => {
      if (e.type === "html") return { ...e, html: htmlById[e.id] ?? (e.html === "[html omitted]" ? "" : e.html) };
      let out = usesFont(e.type) && e.font && FONT_CSS[e.font] ? { ...e, font: FONT_CSS[e.font], fontFace: FONT_FACE[e.font] } : e;
      // Restore inline rich formatting only if Claude left the text untouched.
      if (e.type === "text" && richById[e.id]) out = e.text === richById[e.id].text ? { ...out, rich: richById[e.id].rich } : out;
      return out;
    }),
  }));

  return json({ slides: slidesOut, summary: toolBlock.input.summary || "Done." });
}
