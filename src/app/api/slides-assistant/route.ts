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

import { buildSystem } from "./prompt";
import {
  SK_URL, SK_ANON, AI_MODELS,
  bearerToken, requireUserId, json, logTokenUsage, callAnthropic,
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

// Subject-aware system prompt lives in ./prompt (Next route modules may only
// export HTTP handlers, so the testable builder can't live in this file).

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
  // Subject-aware authoring (T6.3): the editor forwards the deck's subject so the
  // system prompt is built for it. Bounded + optional — absent ⇒ "science".
  const subject = String(body?.subject || "").trim().slice(0, 40);
  const system = buildSystem(subject);

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
    res = await callAnthropic({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // 1-hour TTL (write 2x, read 0.1x). Authoring is bursty: a teacher fires
      // several edits at the SAME deck with review/think-time between them, which
      // routinely exceeds the default 5-min cache. The hour-long window keeps the
      // SYSTEM scaffold AND the deck snapshot warm across the whole editing session,
      // so repeated whole-deck Opus edits read the prefix at 0.1x instead of re-writing.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{
        role: "user",
        content: [
          { type: "text", text: deckText, cache_control: { type: "ephemeral", ttl: "1h" } },
          { type: "text", text: `Instruction: ${instruction}` },
        ],
      }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "apply_edits" },
    }, { apiKey: process.env.ANTHROPIC_API_KEY });
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
