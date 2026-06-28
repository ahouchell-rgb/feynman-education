// Feynman Education — AI timetable photo importer
// POST /api/timetable-ocr
//
// Body:    { image: { mediaType: string, data: string /* base64, no data: prefix */ },
//            classes: [{ id, name, discipline? }] }
// Headers: Authorization: Bearer <user JWT>
// Returns: { entries: [{ week, day, period, class }], singleWeek, notes, usage }
//
// Claude reads a photo of the teacher's printed/MIS timetable and fills in the
// in-app grid for REVIEW. It maps each teaching cell to one of the teacher's own
// classes (by name) and ignores everything else. Nothing is persisted here — and
// the photo is NOT stored anywhere: it lives only in this request as base64.
//
// Required env: ANTHROPIC_API_KEY (set in .env.local for local dev, Vercel for prod).

import {
  AI_MODELS, ANTHROPIC_URL, ANTHROPIC_VERSION,
  bearerToken, requireUserId, json, logTokenUsage,
} from "@/lib/serverHelpers";
import { enforceAiBudget } from "@/lib/aiBudget";

// Node runtime (not edge): vision over a ~1600px JPEG can run past the edge ~25s
// cap; Node + maxDuration gives Sonnet room to finish (mirrors /api/feedforward).
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = AI_MODELS.SONNET;
const MAX_OUTPUT_TOKENS = 4096;

const TOOL = {
  name: "fill_timetable",
  description: "Return the timetable slots you read from the photo that match one of the teacher's classes.",
  input_schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        description: "One item per teaching cell that maps to a provided class. Skip everything else.",
        items: {
          type: "object",
          properties: {
            week: { type: "integer", enum: [1, 2], description: "Week in the 2-week cycle: A=1, B=2. Use 1 for a single-week timetable." },
            day: { type: "integer", enum: [1, 2, 3, 4, 5], description: "Day of week, Mon-Fri = 1-5." },
            period: { type: "integer", enum: [1, 2, 3, 4, 5], description: "Teaching period 1-5 (top teaching row = 1)." },
            class: { type: "string", description: "EXACTLY one of the provided class names." },
          },
          required: ["week", "day", "period", "class"],
        },
      },
      singleWeek: { type: "boolean", description: "True if the photo shows a single-week timetable (no A/B cycle); then all entries use week 1." },
      notes: { type: "string", description: "One short sentence on anything ambiguous or worth the teacher checking." },
    },
    required: ["entries", "singleWeek", "notes"],
  },
};

function buildPrompt(classes: Array<{ id: string; name: string; discipline?: string | null }>): string {
  const list = classes
    .map((c) => `- "${c.name}"${c.discipline ? ` (${c.discipline})` : ""}`)
    .join("\n");
  return `The image above is a photo of a UK secondary teacher's timetable (printed, or a screenshot from their school MIS). Read the grid and tell me which cells are this teacher's own lessons.

THE TEACHER'S CLASSES — map each teaching cell to EXACTLY one of these names (copy the name verbatim):
${list}

RULES:
- Columns are days: Monday-Friday = 1-5. Rows are periods: number the teaching rows 1-5 from the top. Use your judgement about which rows are real teaching periods.
- IGNORE every cell that is not one of the classes listed above: other teachers' or other subjects' lessons, form time / registration, assembly, break, lunch, PPA / free / non-contact, duty, and any blank cell. Do NOT invent a class to fill a gap.
- If the timetable shows a two-week A/B (or Week 1/Week 2) cycle, map Week A -> week 1 and Week B -> week 2. If it is a single-week timetable, put everything in week 1 and set singleWeek = true.
- Only return cells you are confident about. It is better to leave a cell out than to guess — the teacher reviews everything before saving.

Call the fill_timetable tool with your result.`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." }, 500);
  }

  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to import a timetable photo." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const image = body?.image;
  const mediaType = image?.mediaType;
  const data = image?.data;
  if (!image || typeof mediaType !== "string" || typeof data !== "string" || !data) {
    return json({ error: "An image (mediaType + base64 data) is required." }, 400);
  }
  const classes = Array.isArray(body?.classes)
    ? body.classes.filter((c: any) => c && c.id && c.name).map((c: any) => ({ id: String(c.id), name: String(c.name), discipline: c.discipline ?? null }))
    : [];
  if (classes.length === 0) return json({ error: "A non-empty classes array is required." }, 400);

  const userId = await requireUserId(token);
  if (!userId) return json({ error: "Invalid or expired session — sign in again." }, 401);

  // Daily/org cost backstop (Sonnet-priced). Opt-in + fails OPEN — auth above is
  // the primary defence.
  const budget = await enforceAiBudget({ userId, token, model: MODEL });
  if (!budget.ok) return json({ error: budget.error }, budget.status);

  let res: Response;
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
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: buildPrompt(classes) },
          ],
        }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: "fill_timetable" },
      }),
    });
  } catch (e: any) {
    return json({ error: `Request to Claude failed: ${e.message}` }, 502);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return json({ error: `Claude ${res.status}: ${t.slice(0, 300)}` }, 502);
  }

  const out = await res.json();

  // Log token spend so the daily cap accrues. Best-effort.
  await logTokenUsage(userId, out.usage);

  const toolBlock = (out.content || []).find((b: any) => b?.type === "tool_use" && b.name === "fill_timetable");
  const input = toolBlock?.input;
  if (!input || !Array.isArray(input.entries)) {
    return json({ error: "Couldn't read the timetable. Try a clearer, straight-on photo." }, 502);
  }

  // Keep only well-formed entries in range; the client matches names → ids and
  // the teacher reviews in the grid before any write.
  const entries = input.entries
    .filter((e: any) =>
      [1, 2].includes(e?.week) &&
      [1, 2, 3, 4, 5].includes(e?.day) &&
      [1, 2, 3, 4, 5].includes(e?.period) &&
      typeof e?.class === "string" && e.class.trim())
    .map((e: any) => ({ week: e.week, day: e.day, period: e.period, class: String(e.class).trim() }));

  return json({
    entries,
    singleWeek: input.singleWeek === true,
    notes: typeof input.notes === "string" ? input.notes : "",
    usage: { inputTokens: out.usage?.input_tokens || 0, outputTokens: out.usage?.output_tokens || 0 },
  });
}
