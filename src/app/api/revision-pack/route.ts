// Feynman Education — Revision pack generator (strategy #3).
// POST /api/revision-pack   Authorization: Bearer <teacher JWT>
//
// Body:    { unitId }
// Returns: { html } — a printable revision booklet for the unit: overview, key
//          terms, must-know facts, worked examples, practice questions with
//          answers, AND links to the mapped interactive-science.com resources
//          (the resource_map crosswalk). Pupil/parent-facing revision.
//
// Env: ANTHROPIC_API_KEY. Optional: SUPABASE_SERVICE_ROLE_KEY (usage log).

import { supaRest } from "@/lib/supabaseRest";
import { SUBJECT_SELECT, subjectName } from "@/lib/subject";
import { SK_URL, SK_ANON, bearerToken, requireUserId, extractHtml, anthropicText, logTokenUsage, callAnthropic, json as j } from "@/lib/serverHelpers";
import { enforceAiBudget } from "@/lib/aiBudget";
import { maybeFactcheck } from "@/lib/factcheck";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const strip = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const SYSTEM = `You write a REVISION BOOKLET for a UK secondary pupil in the subject given below, as ONE self-contained HTML document that prints cleanly on A4 in black on white.

Include, in this order:
- A title (the unit) + a short, encouraging intro and the big idea in one line.
- "Key terms": a compact glossary of the unit's important words with concise definitions.
- "Must-know facts": tight, revisable bullet points covering the core content (and any key equations).
- "Worked example(s)": 1-2 short worked examples showing method, where the topic has calculations or process.
- "Practice questions": 8-10 exam-style questions ramping easy → hard, with mark allocations and command words. Put ALL the answers/mark points together in an "Answers" section at the END (so pupils self-test first).
- "Watch out for": the common misconceptions, stated as the correct idea.
- "Practise more online": IF resources are provided below, list them as a bulleted list of their names each linked to their URL.

Accurate to KS3-GCSE and to the unit content; do NOT invent beyond it. Encouraging, clear, UK spelling, SI units. Inline all CSS; NO external resources except the provided resource links. Return ONLY the HTML inside a single \`\`\`html ... \`\`\` code block.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return j({ error: "ANTHROPIC_API_KEY not configured." }, 500);
  const token = bearerToken(req);
  if (!token) return j({ error: "Sign in to use the AI assistant." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Invalid JSON body" }, 400); }
  if (!body?.unitId) return j({ error: "unitId is required" }, 400);

  // Unit + mapped resources under the teacher's RLS.
  let unit: any, resources: any[] = [];
  try {
    unit = await supaRest(SK_URL, "units", {
      apikey: SK_ANON, bearer: token, single: true,
      params: { id: `eq.${body.unitId}`, select: `title,discipline,year_group,content,big_idea,misconceptions,${SUBJECT_SELECT}` },
    });
    resources = await supaRest(SK_URL, "resource_map", {
      apikey: SK_ANON, bearer: token,
      params: { unit_id: `eq.${body.unitId}`, select: "href,name,rtype,origin,tag" },
    }).catch(() => []);
  } catch { return j({ error: "Unit not found" }, 404); }

  const userId = await requireUserId(token);
  if (!userId) return j({ error: "Invalid or expired session — sign in again." }, 401);

  const budget = await enforceAiBudget({ userId, token, model: MODEL });
  if (!budget.ok) return j({ error: budget.error }, budget.status || 429);

  // Build full resource URLs from the crosswalk (origin + href), de-duped by name.
  const seen = new Set<string>();
  const resLines = (Array.isArray(resources) ? resources : []).filter((r: any) => {
    const k = (r.name || r.href || "").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true;
  }).map((r: any) => {
    const base = (r.origin || "https://interactive-science.com").replace(/\/$/, "");
    const url = /^https?:/i.test(r.href) ? r.href : `${base}/${String(r.href).replace(/^\//, "")}`;
    return `- ${r.name || r.href}${r.rtype ? ` (${r.rtype})` : ""} → ${url}`;
  }).join("\n");

  const ctx = [
    `Subject: ${subjectName(unit)}`,
    `Unit: ${unit.title}${unit.discipline ? ` (${unit.discipline})` : ""}${unit.year_group ? ` · ${unit.year_group}` : ""}`,
    unit.big_idea && `Big idea: ${strip(unit.big_idea)}`,
    unit.content && `Content: ${strip(unit.content).slice(0, 2200)}`,
    Array.isArray(unit.misconceptions) && unit.misconceptions.length && `Misconceptions: ${unit.misconceptions.join("; ")}`,
    resLines && `RESOURCES (use these exact names + URLs in "Practise more online"):\n${resLines}`,
  ].filter(Boolean).join("\n");

  let res: Response;
  try {
    res = await callAnthropic({
      model: MODEL, max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${ctx}\n\nWrite the revision booklet.` }],
    }, { apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (e: any) { return j({ error: `Request to Claude failed: ${e.message}` }, 502); }
  if (!res.ok) return j({ error: `Claude ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` }, 502);

  const data = await res.json();
  const html = extractHtml(anthropicText(data));
  await logTokenUsage(userId, data.usage);

  if (!/[<][a-z]/i.test(html)) return j({ error: "The booklet came back empty — try again." }, 502);

  const factcheck = await maybeFactcheck({ html, ctx, apiKey: process.env.ANTHROPIC_API_KEY });
  return j(factcheck ? { html, factcheck } : { html });
}
