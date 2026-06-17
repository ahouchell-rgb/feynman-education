// Feynman Education — Chat-with-Claude edge function
// POST /api/chat-with-lesson
//
// Body:    { lessonId, userMessage }
// Headers: Authorization: Bearer <user JWT>
// Returns: text/event-stream of {type:"text"|"done"|"error"|"warning", ...}
//
// Required env vars (set in Vercel):
//   ANTHROPIC_API_KEY            — secret, from console.anthropic.com
//   SUPABASE_SERVICE_ROLE_KEY    — secret, from Supabase dashboard

import { supaRest } from "@/lib/supabaseRest";

export const runtime = "edge";

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
// Same anon key as src/lib/sk.js — public, used for the apikey header alongside the user's bearer.
const SK_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";

// ─── Model + cost config ────────────────────────────────────────────────
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 4096;

// Rough Sonnet pricing. Tune if Anthropic publishes new numbers.
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;
const GBP_PER_USD = 0.79;
const DAILY_CAP_GBP = 1.0;

// How much chat history to send back to Claude as context.
const HISTORY_LIMIT = 30;

// ─── Helpers ───────────────────────────────────────────────────────────
const enc = new TextEncoder();
const sse = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const todayISO = () => new Date().toISOString().slice(0, 10);

function costGBP(input, output) {
  return (input / 1e6) * INPUT_USD_PER_MTOK * GBP_PER_USD
       + (output / 1e6) * OUTPUT_USD_PER_MTOK * GBP_PER_USD;
}

function jsonError(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stripHtml(s) {
  if (!s) return "";
  return String(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// Supabase REST helper. Defaults to user-token auth (RLS applies).
interface SbOpts {
  method?: string;
  body?: any;
  token?: string;
  params?: Record<string, string>;
  single?: boolean;
  useServiceRole?: boolean;
}
async function sb(path: string, { method = "GET", body, token, params, single, useServiceRole = false }: SbOpts = {}): Promise<any> {
  const key = useServiceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY! : SK_ANON_KEY;
  const bearer = useServiceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY : token;
  return supaRest(SK_URL, path, { method, body, params, apikey: key, bearer, single });
}

function buildSystemPrompt({ lesson, unit, teacherContent, widgets }) {
  const sections = [
    ["Objectives",           lesson.objectives,          teacherContent?.objectives],
    ["Starter",              lesson.starter,             teacherContent?.starter],
    ["Main activities",      lesson.main_activities,     teacherContent?.main_activities],
    ["AFL checkpoint",       lesson.afl_checkpoint,      teacherContent?.afl_checkpoint],
    ["Plenary",              lesson.plenary,             teacherContent?.plenary],
    ["Differentiation",      lesson.differentiation,     teacherContent?.differentiation],
    ["Modelling notes",      lesson.modelling_notes,     teacherContent?.modelling_notes],
    ["Misconception alerts", lesson.misconception_alerts, teacherContent?.misconception_alerts],
  ];
  const sectionsText = sections.map(([title, sys, teach]) => {
    const parts = [];
    if (sys)   parts.push(`SYSTEM: ${stripHtml(sys)}`);
    if (teach) parts.push(`TEACHER OVERRIDE: ${stripHtml(teach)}`);
    if (!parts.length) return `[${title}] (empty)`;
    return `[${title}]\n${parts.join("\n")}`;
  }).join("\n\n");

  const widgetList = widgets.length
    ? widgets.map(w => `- ${w.title}`).join("\n")
    : "(none yet)";

  return `You are helping a UK secondary science teacher plan and improve a single lesson. You have read-only context for the lesson below. Keep responses focused, practical, grounded in UK Key Stage 3-4 / GCSE pedagogy. Be direct — the teacher is experienced and short on time. Avoid hedge words.

When the teacher asks for an interactive activity (sorter, simulator, drag-and-drop, quiz, animation, diagram explorer, retrieval starter, etc.), return it as ONE complete self-contained HTML document inside a single \`\`\`html ... \`\`\` code block. Include all HTML, CSS, and JavaScript inline. NO external resources — no CDNs, no remote fonts, no remote images. The widget renders inside a sandboxed iframe with sandbox="allow-scripts" only: NO cookies, NO localStorage, NO parent-page access, NO network requests. Design accordingly. Target ~700×480 but make it responsive and pleasant on a projector.

When proposing rewrites of lesson sections (objectives, starter, etc.), use clear markdown headings like "## Suggested objectives" so the teacher can identify what you're proposing.

═══════════ LESSON CONTEXT ═══════════
Unit: ${unit.title || "(untitled unit)"} · ${unit.discipline || ""} · ${unit.year_group || ""}
Lesson L${lesson.lesson_number}: ${lesson.title}
Duration: ${lesson.duration || "not set"}
Keywords: ${(lesson.keywords || []).join(", ") || "none"}

${sectionsText}

EXISTING WIDGETS ON THIS LESSON:
${widgetList}
═══════════════════════════════════════`;
}

// ─── Handler ───────────────────────────────────────────────────────────
export async function POST(req) {
  // Env checks first — better than a mystery 500
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError("ANTHROPIC_API_KEY not configured in Vercel env vars.", 500);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("SUPABASE_SERVICE_ROLE_KEY not configured in Vercel env vars.", 500);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return jsonError("Missing bearer token", 401);
  const token = authHeader.slice(7);

  let body;
  try { body = await req.json(); }
  catch { return jsonError("Invalid JSON body", 400); }

  const { lessonId, userMessage } = body || {};
  if (!lessonId || !userMessage || !String(userMessage).trim()) {
    return jsonError("lessonId and userMessage required", 400);
  }

  // Validate user (also gives us their UID)
  let userId;
  try {
    const ur = await fetch(`${SK_URL}/auth/v1/user`, {
      headers: { apikey: SK_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!ur.ok) return jsonError("Invalid auth", 401);
    const user = await ur.json();
    userId = user.id;
  } catch {
    return jsonError("Auth check failed", 401);
  }

  // Load lesson + history + usage + widgets (parallel, under user RLS)
  let lesson, unit, teacherContent, widgets, history, todayUsage;
  try {
    [lesson, history, todayUsage, widgets] = await Promise.all([
      sb("lessons", { token, params: { id: `eq.${lessonId}` }, single: true }),
      sb("lesson_chat_messages", { token, params: {
        lesson_id: `eq.${lessonId}`,
        teacher_id: `eq.${userId}`,
        order: "created_at.asc",
        limit: String(HISTORY_LIMIT),
      } }),
      sb("daily_token_usage", { token, params: {
        teacher_id: `eq.${userId}`,
        day: `eq.${todayISO()}`,
      } }),
      sb("lesson_widgets", { token, params: {
        lesson_id: `eq.${lessonId}`,
        teacher_id: `eq.${userId}`,
        select: "title",
      } }),
    ]);
    history = history || [];
    widgets = widgets || [];
    todayUsage = (todayUsage && todayUsage[0]) || { input_tokens: 0, output_tokens: 0 };

    [unit, teacherContent] = await Promise.all([
      sb("units", { token, params: { id: `eq.${lesson.unit_id}` }, single: true }).catch(() => ({})),
      sb("lesson_teacher_content", { token, params: {
        lesson_id: `eq.${lessonId}`, teacher_id: `eq.${userId}`,
      } }).then(r => (r && r[0]) || {}).catch(() => ({})),
    ]);
  } catch (e) {
    return jsonError(`Couldn't load lesson context: ${e.message}`, 500);
  }

  // Daily cap check
  const usedGBP = costGBP(todayUsage.input_tokens || 0, todayUsage.output_tokens || 0);
  if (usedGBP >= DAILY_CAP_GBP) {
    return jsonError(
      `Daily cap of £${DAILY_CAP_GBP.toFixed(2)} reached (used £${usedGBP.toFixed(3)}). Resets at midnight UTC.`,
      429
    );
  }

  // Persist user message before streaming starts
  try {
    await sb("lesson_chat_messages", {
      method: "POST", token,
      body: { lesson_id: lessonId, teacher_id: userId, role: "user", content: userMessage },
    });
  } catch (e) {
    return jsonError(`Couldn't save your message: ${e.message}`, 500);
  }

  // Build Anthropic payload
  const messages = [
    ...history.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];
  const systemPrompt = buildSystemPrompt({ lesson, unit, teacherContent, widgets });

  // Call Anthropic with streaming
  let anthropicRes;
  try {
    anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    });
  } catch (e) {
    return jsonError(`Anthropic request failed: ${e.message}`, 502);
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => "");
    return jsonError(
      `Anthropic ${anthropicRes.status}: ${errText.slice(0, 300)}`,
      502
    );
  }

  // Pipe stream to client; accumulate full text + usage; persist on close.
  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fullText = "";
      let inputTok = 0, outputTok = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              let evt;
              try { evt = JSON.parse(data); } catch { continue; }

              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                const t = evt.delta.text || "";
                fullText += t;
                controller.enqueue(sse({ type: "text", content: t }));
              } else if (evt.type === "message_start") {
                inputTok = evt.message?.usage?.input_tokens || 0;
              } else if (evt.type === "message_delta") {
                outputTok = evt.usage?.output_tokens ?? outputTok;
              } else if (evt.type === "error") {
                controller.enqueue(sse({
                  type: "error",
                  message: evt.error?.message || "Stream error",
                }));
              }
            }
          }
        }

        // Persist assistant message (under user RLS)
        try {
          await sb("lesson_chat_messages", {
            method: "POST", token,
            body: { lesson_id: lessonId, teacher_id: userId, role: "assistant", content: fullText },
          });
        } catch (e) {
          // Don't fail the stream — the user has their reply on-screen.
          controller.enqueue(sse({ type: "warning", message: `Reply shown but not saved: ${e.message}` }));
        }

        // Increment token usage via service-role RPC
        try {
          const rpcRes = await fetch(`${SK_URL}/rest/v1/rpc/increment_token_usage`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              p_teacher_id: userId,
              p_day: todayISO(),
              p_input: inputTok,
              p_output: outputTok,
            }),
          });
          if (!rpcRes.ok) {
            const t = await rpcRes.text().catch(() => "");
            controller.enqueue(sse({ type: "warning", message: `Usage not recorded: ${t.slice(0, 120)}` }));
          }
        } catch (e) {
          controller.enqueue(sse({ type: "warning", message: `Usage not recorded: ${e.message}` }));
        }

        controller.enqueue(sse({
          type: "done",
          usage: {
            inputTokens: inputTok,
            outputTokens: outputTok,
            costGBP: costGBP(inputTok, outputTok),
          },
        }));
      } catch (e) {
        controller.enqueue(sse({ type: "error", message: e.message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
