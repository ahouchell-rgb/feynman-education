// Feynman Education — Required-practical assistant (strategy #13).
// POST /api/practical-assistant   Authorization: Bearer <teacher JWT>
//
// Body:    { unitId }
// Returns: { html } — a printable technician/teacher sheet for the unit's
//          required practical: apparatus list, method, a risk-assessment table,
//          expected results, and common errors. Recurring science-specific pain.
//          Mirrors the feedforward route's auth + cost backstop.
//
// Env: ANTHROPIC_API_KEY. Optional: SUPABASE_SERVICE_ROLE_KEY (usage log).

import { supaRest } from "@/lib/supabaseRest";
import { SUBJECT_SELECT, subjectName, isScience } from "@/lib/subject";
import { SK_URL, SK_ANON, bearerToken, requireUserId, extractHtml, anthropicText, logTokenUsage, json as j } from "@/lib/serverHelpers";
import { enforceAiBudget } from "@/lib/aiBudget";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const strip = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const SYSTEM = `You write a REQUIRED PRACTICAL sheet for a UK secondary science teacher and technician, as ONE self-contained HTML document that prints cleanly on A4 in black on white.

Include, in this order:
- A title (the practical) and a line for class + date, and a one-line aim.
- "Apparatus & chemicals": a bulleted list of everything needed (per group), with quantities/concentrations where relevant.
- "Method": clear numbered steps a teacher can follow or hand to pupils.
- "Risk assessment": a bordered TABLE with columns Hazard | Risk | Control measure, covering the real hazards of THIS practical. Add a line: "Always follow your school's / CLEAPSS risk assessment; this sheet is guidance, not a substitute."
- "Expected results / observations": what should happen and why, with any key equation.
- "Common errors & tips": what usually goes wrong and how to avoid it.
- "Technician prep": a short note on advance preparation.

Keep it accurate to KS3-GCSE and to the practical named. If no specific practical is given, use the standard required practical for the topic. UK spelling, SI units, safety-first. Inline all CSS; NO external resources. Return ONLY the HTML inside a single \`\`\`html ... \`\`\` code block.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return j({ error: "ANTHROPIC_API_KEY not configured." }, 500);
  const token = bearerToken(req);
  if (!token) return j({ error: "Sign in to use the AI assistant." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Invalid JSON body" }, 400); }
  if (!body?.unitId) return j({ error: "unitId is required" }, 400);

  // Unit context under the teacher's RLS.
  let unit: any;
  try {
    unit = await supaRest(SK_URL, "units", {
      apikey: SK_ANON, bearer: token, single: true,
      params: { id: `eq.${body.unitId}`, select: `title,discipline,year_group,required_practical,content,misconceptions,${SUBJECT_SELECT}` },
    });
  } catch { return j({ error: "Unit not found" }, 404); }

  const userId = await requireUserId(token);
  if (!userId) return j({ error: "Invalid or expired session — sign in again." }, 401);

  const budget = await enforceAiBudget({ userId, token, model: MODEL });
  if (!budget.ok) return j({ error: budget.error }, budget.status || 429);

  const ctx = [
    `Subject: ${subjectName(unit)}`,
    `Unit: ${unit.title}${unit.discipline ? ` (${unit.discipline})` : ""}${unit.year_group ? ` · ${unit.year_group}` : ""}`,
    unit.required_practical && `Required practical: ${strip(unit.required_practical)}`,
    unit.content && `Topic content: ${strip(unit.content).slice(0, 1200)}`,
    Array.isArray(unit.misconceptions) && unit.misconceptions.length && `Common misconceptions: ${unit.misconceptions.join("; ")}`,
  ].filter(Boolean).join("\n");

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({
        model: MODEL, max_tokens: 4096,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `${ctx}\n\n${isScience(unit)
          ? "Write the required practical sheet."
          : "This subject may not have a lab practical — write a 'required task / activity' sheet in the same structure (apparatus becomes materials/resources; the risk assessment becomes any safety or wellbeing notes, or omit if none), for the key hands-on activity in this unit."}` }],
      }),
    });
  } catch (e: any) { return j({ error: `Request to Claude failed: ${e.message}` }, 502); }
  if (!res.ok) return j({ error: `Claude ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` }, 502);

  const data = await res.json();
  const html = extractHtml(anthropicText(data));
  await logTokenUsage(userId, data.usage);

  if (!/[<][a-z]/i.test(html)) return j({ error: "The sheet came back empty — try again." }, 502);
  return j({ html });
}
