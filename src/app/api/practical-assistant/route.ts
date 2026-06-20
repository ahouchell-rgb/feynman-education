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

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const todayISO = () => new Date().toISOString().slice(0, 10);
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

function extractHtml(text: string): string {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const doc = text.match(/<!doctype[\s\S]*<\/html>|<html[\s\S]*<\/html>/i);
  if (doc) return doc[0].trim();
  return text.trim();
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return j({ error: "ANTHROPIC_API_KEY not configured." }, 500);
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Sign in to use the AI assistant." }, 401);
  const token = auth.slice(7);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Invalid JSON body" }, 400); }
  if (!body?.unitId) return j({ error: "unitId is required" }, 400);

  // Unit context under the teacher's RLS.
  let unit: any;
  try {
    unit = await supaRest(SK_URL, "units", {
      apikey: SK_ANON, bearer: token, single: true,
      params: { id: `eq.${body.unitId}`, select: "title,discipline,year_group,required_practical,content,misconceptions" },
    });
  } catch { return j({ error: "Unit not found" }, 404); }

  let userId: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid or expired session — sign in again." }, 401);
    userId = (await u.json()).id;
  } catch { return j({ error: "Auth check failed." }, 401); }

  const ctx = [
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
        messages: [{ role: "user", content: `${ctx}\n\nWrite the required practical sheet.` }],
      }),
    });
  } catch (e: any) { return j({ error: `Request to Claude failed: ${e.message}` }, 502); }
  if (!res.ok) return j({ error: `Claude ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` }, 502);

  const data = await res.json();
  const html = extractHtml((data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const u = data.usage || {};
      const inputTotal = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      await fetch(`${SK_URL}/rest/v1/rpc/increment_token_usage`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ p_teacher_id: userId, p_day: todayISO(), p_input: inputTotal, p_output: u.output_tokens || 0 }),
      });
    }
  } catch { /* best-effort */ }

  if (!/[<][a-z]/i.test(html)) return j({ error: "The sheet came back empty — try again." }, 502);
  return j({ html });
}
