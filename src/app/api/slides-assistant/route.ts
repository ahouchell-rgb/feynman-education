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

import { HOUSE_LESSON_STYLE } from "@/lib/lessonStyle";
import {
  SK_URL, SK_ANON, AI_MODELS, ANTHROPIC_URL, ANTHROPIC_VERSION,
  bearerToken, requireUserId, json, logTokenUsage,
} from "@/lib/serverHelpers";
import { enforceAiBudget } from "@/lib/aiBudget";
import { getEntitlement, can } from "@/lib/entitlements";

export const runtime = "edge";

const MODEL = AI_MODELS.OPUS;
const MAX_OUTPUT_TOKENS = 16000; // slide-scoped edits keep output to the change size; the higher ceiling is only for whole-lesson builds (stays under non-streaming HTTP timeouts)

// ─── Auth + cost backstop (mirrors chat-with-lesson) ─────────────────────
// This route drives Opus, so it MUST require an authenticated teacher and meter
// spend (enforceAiBudget) — otherwise it is an open, uncapped Opus endpoint on
// our API key. The daily/org caps are opt-in via AI_DAILY_CAP_GBP /
// AI_ORG_MONTHLY_CAP_GBP and fail OPEN, so a read blip never blocks authoring.

const SYSTEM = `You edit a slide deck for a UK secondary science teacher. The deck is a JSON array of slides on a FIXED 960×540 canvas (16:9, pixels), 0-indexed by array position. You return the updated deck via the apply_edits tool.

RETURN FORMAT — call apply_edits with an "order" array describing the WHOLE deck after your change, in order. Each item is EITHER {"keep": i} (reuse existing slide i unchanged — use this for every slide you are NOT changing, and NEVER re-describe a kept slide) OR {"slide": { ...full slide object... }} (a new slide, or the full replacement of a slide you edited). To tweak one slide: emit {"keep": i} for all the others and one {"slide": {...}} in its place. To insert: add a {"slide": {...}} at the right position. To delete a slide: omit that index. To reorder: change the order of the {"keep": i} items. This keeps your output small — only spell out the slides you actually create or change.

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

HOUSE LESSON TEMPLATE — when the instruction is to BUILD, DRAFT or EXTEND a lesson (not a one-off tweak), follow this teacher's routine below: one slide per beat, in order, using the EXACT on-screen labels. Map beats to elements — use a timer element for the "90 seconds"/"60 seconds" tasks; for the MCQ keep the question + four options visible and put the "The correct answer is N" tick and the "Why:" misconception diagnosis on reveal:true elements (or the following slide); keep "→ USE VISUALISER" as a cue line and leave space for a visualiser/retrieval element where a beat needs one; use a table for comparisons. Keep the teacher's wording and conventions verbatim. For a one-off edit, ignore the template and just do what's asked.

${HOUSE_LESSON_STYLE}

RULES:
- PRESERVE existing slides and elements unless the instruction asks to change them. The current slide index is given — "this slide" means that one.
- Give every NEW element a unique id like "el" followed by random digits.
- Lay out cleanly: a title near the top, content below, generous spacing. Aim for the look of a well-made teaching slide.
- Palette when sensible: biology green #5e7c4b, chemistry orange/red #b95a3c, physics blue #2e3a5f, dark text #1a1714 on light backgrounds. Soft tinted backgrounds (e.g. #f3eee2) read well on a projector.
- For labelled diagrams, draw arrows from a text label to the part it points at.
- Keep all content scientifically accurate and pitched at KS3–GCSE.
- Your "order" must cover the WHOLE deck, in final order — every slide appears exactly once, as {keep:i} or {slide:{...}} (omit an index only to delete that slide). Reuse unchanged slides as {keep:i}; never re-emit their contents.
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

const SLIDE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    background: { type: "string" },
    notes: { type: "string" },
    elements: { type: "array", items: ELEMENT_SCHEMA },
  },
  required: ["elements"],
};

const TOOL = {
  name: "apply_edits",
  description: "Return the updated deck as an ordered list. For each position output either {keep:<index>} to reuse an existing slide unchanged, or {slide:{...}} for a new or edited slide. Only spell out the slides you create or change.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One short sentence describing what changed." },
      order: {
        type: "array",
        description: "The whole deck after the edit, in final order. Each item is EITHER {keep:<existing 0-based slide index>} for an unchanged slide, OR {slide:{...}} for a new/edited slide.",
        items: {
          type: "object",
          properties: {
            keep: { type: "integer", description: "Index of an existing slide to reuse unchanged." },
            slide: SLIDE_SCHEMA,
          },
        },
      },
    },
    required: ["summary", "order"],
  },
};

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." }, 500);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 500);
  }

  // Require an authenticated teacher — this is no longer an open Opus endpoint.
  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to use the AI assistant." }, 401);

  // Entitlement gate (soft): only enforced when BILLING_ENFORCED=1, so current
  // pilots stay open until billing is switched on.
  if (process.env.BILLING_ENFORCED === "1") {
    const ent = await getEntitlement({ skUrl: SK_URL, apikey: SK_ANON, bearer: token });
    if (!can(ent, "ai_generators")) return json({ error: "The slides assistant is a Pro feature. Upgrade on the Billing page.", upgrade: true }, 402);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const slides = Array.isArray(body?.slides) ? body.slides : [];
  const currentSlide = Number.isInteger(body?.currentSlide) ? body.currentSlide : 0;
  const instruction = String(body?.instruction || "").trim();

  if (!instruction) return json({ error: "instruction is required" }, 400);
  if (instruction.length > 2000) return json({ error: "Instruction is too long." }, 400);

  // Validate the session and get the teacher's UID (also the usage key).
  const userId = await requireUserId(token);
  if (!userId) return json({ error: "Invalid or expired session — sign in again." }, 401);

  // Daily/org cost backstop (Opus-priced). Opt-in + fails OPEN — the auth
  // requirement above is the primary defence.
  const budget = await enforceAiBudget({ userId, token, model: MODEL });
  if (!budget.ok) return json({ error: budget.error }, budget.status);

  // Imported HTML templates can be tens of KB each — too large to round-trip through
  // the model. Strip the markup (keyed by element id) before the call and splice it
  // back into any slide the model re-emits afterwards (kept slides never round-trip).
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

  // Split the prompt so prompt caching can fire: the stable scaffold (tools +
  // SYSTEM + the deck snapshot) goes in cached blocks; only the volatile
  // instruction is uncached and trails the breakpoint. On Opus the tools+SYSTEM
  // alone (~3k tok) sit under the 4096-token cache floor, but tools+SYSTEM+deck
  // clears it for any real deck — so iterating / retrying against the same deck
  // state within the 5-min TTL reads the prefix at ~0.1x instead of full price.
  const deckText =
    `Current slide index: ${currentSlide}\n` +
    `Current deck (JSON):\n${JSON.stringify(sentSlides)}`;

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
        // 1-hour TTL (write 2x, read 0.1x). Authoring is bursty: a teacher fires
        // several edits at the SAME deck with review/think-time between them, which
        // routinely exceeds the default 5-min cache. The hour-long window keeps the
        // SYSTEM scaffold AND the deck snapshot warm across the whole editing session,
        // so repeated whole-deck Opus edits read the prefix at 0.1x instead of re-writing.
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{
          role: "user",
          content: [
            { type: "text", text: deckText, cache_control: { type: "ephemeral", ttl: "1h" } },
            { type: "text", text: `Instruction: ${instruction}` },
          ],
        }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: "apply_edits" },
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

  // Record token spend so the daily cap accrues (service-role RPC; counts cache
  // reads/writes). Best-effort: a logging hiccup must not fail the user's edit.
  await logTokenUsage(userId, data.usage);

  const toolBlock = (data.content || []).find((b) => b.type === "tool_use" && b.name === "apply_edits");
  const order = toolBlock?.input?.order;
  if (!Array.isArray(order) || !order.length) {
    return json({ error: "Claude did not return a deck. Try rephrasing." }, 502);
  }

  // Map font labels → the CSS/face the editor uses, and restore the html/rich we
  // stripped before the call. Applied ONLY to model-emitted slides.
  const FONT_CSS = { Sans: "'IBM Plex Sans', sans-serif", Serif: "Georgia, 'Instrument Serif', serif", Mono: "'IBM Plex Mono', monospace", Friendly: "'Comic Sans MS', 'Chalkboard SE', sans-serif", Classic: "'Times New Roman', serif", Verdana: "Verdana, sans-serif" };
  const FONT_FACE = { Sans: "Arial", Serif: "Georgia", Mono: "Consolas", Friendly: "Comic Sans MS", Classic: "Times New Roman", Verdana: "Verdana" };
  const usesFont = (t) => t === "text" || t === "table";
  const restoreSlide = (s) => ({
    ...s,
    elements: (s.elements || []).map((e) => {
      if (e.type === "html") return { ...e, html: htmlById[e.id] ?? (e.html === "[html omitted]" ? "" : e.html) };
      let out = usesFont(e.type) && e.font && FONT_CSS[e.font] ? { ...e, font: FONT_CSS[e.font], fontFace: FONT_FACE[e.font] } : e;
      // Restore inline rich formatting only if Claude left the text untouched.
      if (e.type === "text" && richById[e.id]) out = e.text === richById[e.id].text ? { ...out, rich: richById[e.id].rich } : out;
      return out;
    }),
  });

  // Reconstruct the full deck from the order list: {keep:i} reuses the ORIGINAL
  // (full-fidelity, never-round-tripped) slide; {slide:{...}} is a new/edited slide
  // we restore. Unchanged slides can't be corrupted because the model never re-emits
  // them. An out-of-range keep or a malformed item is skipped rather than trusted.
  const slidesOut = [];
  for (const item of order) {
    if (item && item.slide && Array.isArray(item.slide.elements)) {
      slidesOut.push(restoreSlide(item.slide));
    } else if (item && Number.isInteger(item.keep) && slides[item.keep]) {
      slidesOut.push(slides[item.keep]);
    }
  }
  if (!slidesOut.length) {
    return json({ error: "Claude did not return any slides. Try rephrasing." }, 502);
  }

  return json({ slides: slidesOut, summary: toolBlock.input.summary || "Done." });
}
