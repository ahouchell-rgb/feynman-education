// Houchell Education — Chat-with-Claude edge function
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
import { HOUSE_LESSON_STYLE } from "@/lib/lessonStyle";
import {
  SK_URL, SK_ANON, AI_MODELS,
  bearerToken, requireUserId, logTokenUsage, callAnthropic,
} from "@/lib/serverHelpers";
import { costGBP, enforceAiBudget } from "@/lib/aiBudget";
import { getEntitlement, can } from "@/lib/entitlements";

export const runtime = "edge";

const SK_ANON_KEY = SK_ANON; // public anon key, used as the apikey header alongside the user's bearer

// ─── Model config ───────────────────────────────────────────────────────
const MODEL = AI_MODELS.SONNET;
const MAX_OUTPUT_TOKENS = 4096;

// How much chat history to send back to Claude as context.
const HISTORY_LIMIT = 30;

// ─── Helpers ───────────────────────────────────────────────────────────
const enc = new TextEncoder();
const sse = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

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

When the teacher asks for a starter, hook, retrieval question, MCQ, written task, model answer, scaffold, plenary or a whole lesson, MATCH the house style below — reuse its named beats, exact on-screen labels and conventions (etymology vocab, whiteboard MCQs with misconception-mapped distractors, "in full sentences" writing, green-pen model answers with mark schemes, sentence-starter scaffolds, 60-second oracy plenaries). Adapt the content to THIS lesson's topic.

${HOUSE_LESSON_STYLE}

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

  const token = bearerToken(req);
  if (!token) return jsonError("Missing bearer token", 401);

  // Entitlement gate (soft): only enforced when BILLING_ENFORCED=1, so current
  // pilots stay open until billing is switched on.
  if (process.env.BILLING_ENFORCED === "1") {
    const ent = await getEntitlement({ skUrl: SK_URL, apikey: SK_ANON, bearer: token });
    if (!can(ent, "ai_generators")) {
      return new Response(JSON.stringify({ error: "The lesson AI chat is a Pro feature. Upgrade on the Billing page.", upgrade: true }), { status: 402, headers: { "content-type": "application/json" } });
    }
  }

  let body;
  try { body = await req.json(); }
  catch { return jsonError("Invalid JSON body", 400); }

  const { lessonId, userMessage } = body || {};
  if (!lessonId || !userMessage || !String(userMessage).trim()) {
    return jsonError("lessonId and userMessage required", 400);
  }

  // Validate user (also gives us their UID)
  const userId = await requireUserId(token);
  if (!userId) return jsonError("Invalid auth", 401);

  // Daily/org cost backstop (opt-in via AI_DAILY_CAP_GBP / AI_ORG_MONTHLY_CAP_GBP; fails OPEN).
  const budget = await enforceAiBudget({ userId, token, model: MODEL });
  if (!budget.ok) return jsonError(budget.error, budget.status);

  // Load lesson + history + widgets (parallel, under user RLS)
  let lesson, unit, teacherContent, widgets, history;
  try {
    [lesson, history, widgets] = await Promise.all([
      sb("lessons", { token, params: { id: `eq.${lessonId}` }, single: true }),
      sb("lesson_chat_messages", { token, params: {
        lesson_id: `eq.${lessonId}`,
        teacher_id: `eq.${userId}`,
        order: "created_at.asc",
        limit: String(HISTORY_LIMIT),
      } }),
      sb("lesson_widgets", { token, params: {
        lesson_id: `eq.${lessonId}`,
        teacher_id: `eq.${userId}`,
        select: "title",
      } }),
    ]);
    history = history || [];
    widgets = widgets || [];

    [unit, teacherContent] = await Promise.all([
      sb("units", { token, params: { id: `eq.${lesson.unit_id}` }, single: true }).catch(() => ({})),
      sb("lesson_teacher_content", { token, params: {
        lesson_id: `eq.${lessonId}`, teacher_id: `eq.${userId}`,
      } }).then(r => (r && r[0]) || {}).catch(() => ({})),
    ]);
  } catch (e) {
    return jsonError(`Couldn't load lesson context: ${e.message}`, 500);
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
  const historyMsgs = history.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  // Prompt caching: mark the last prior turn so each new message re-reads the
  // cached conversation prefix (~0.1x) instead of re-billing the whole history.
  // Holds until the 30-message window slides; the system block (below) is cached
  // regardless. 1-hour TTL (write 2x, read 0.1x): a teacher iterating on a lesson
  // plan leaves minutes of think-time between turns, so the default 5-min cache
  // expires mid-session and each turn re-pays the prefix at a 1.25x write. The 1h
  // window spans a realistic planning session, turning those writes into 0.1x reads.
  if (historyMsgs.length) {
    const last: any = historyMsgs[historyMsgs.length - 1];
    last.content = [{ type: "text", text: String(last.content ?? ""), cache_control: { type: "ephemeral", ttl: "1h" } }];
  }
  const messages = [...historyMsgs, { role: "user", content: userMessage }];
  const systemPrompt = buildSystemPrompt({ lesson, unit, teacherContent, widgets });

  // Call Anthropic with streaming. We retry only the INITIAL connection here (via
  // callAnthropic) — once the stream is established its body is piped through
  // untouched, so a mid-stream failure is NOT retried (that would corrupt output).
  // callAnthropic returns successful responses without reading the body, so the SSE
  // stream is left intact for the reader below.
  let anthropicRes;
  try {
    anthropicRes = await callAnthropic({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Cache the large, lesson-stable system prompt (base instructions +
      // HOUSE_LESSON_STYLE + lesson context) on a 1-hour TTL so it survives the
      // gaps between a teacher's chat turns. NOTE: Sonnet's cache floor is 2048
      // tokens — base + HOUSE_LESSON_STYLE is ~1.2k, so this only actually caches
      // once the lesson carries real content; sparse lessons silently skip it.
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages,
      stream: true,
    }, { apiKey: process.env.ANTHROPIC_API_KEY });
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
                // Count total input volume incl. cache reads/writes so the shared
                // daily pool stays meaningful once caching is on.
                const mu = evt.message?.usage || {};
                inputTok = (mu.input_tokens || 0) + (mu.cache_read_input_tokens || 0) + (mu.cache_creation_input_tokens || 0);
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

        // Increment token usage in the shared daily pool (service-role; best-effort).
        // inputTok already folds in cache reads/writes, so pass it as the raw input.
        await logTokenUsage(userId, { input_tokens: inputTok, output_tokens: outputTok });

        controller.enqueue(sse({
          type: "done",
          usage: {
            inputTokens: inputTok,
            outputTokens: outputTok,
            costGBP: costGBP(inputTok, outputTok, MODEL),
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
