// Houchell Education — one-click AI lesson generator (strategy #11, the teacher wedge).
// POST /api/lesson-generator   Authorization: Bearer <teacher JWT>
//
// Body: { unitId, lessonId?, focus? }
// Returns: { deckId, title, slideCount, summary }
//
// Builds a full, ready-to-teach deck from a curriculum unit by REUSING the proven
// slides-assistant generator (same Opus tool-call path, house lesson template, font
// restore) with an empty deck + a context-built instruction — then persists it as a
// `decks` row owned by the teacher and returns its id so the client opens it in the
// editor. No new model/prompt to maintain; this is orchestration over what exists.
//
// Env: ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY (consumed by slides-assistant).

import { supaRest } from "@/lib/supabaseRest";
import { getEntitlement, can } from "@/lib/entitlements";
import { SUBJECT_SELECT, subjectName } from "@/lib/subject";

export const runtime = "nodejs";
export const maxDuration = 120;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const sb = (table: string, opts: any, token: string) => supaRest(SK_URL, table, { apikey: SK_ANON, bearer: token, ...opts });

function buildInstruction(unit: any, lesson: any, focus: string | null): string {
  const disc = subjectName(unit);
  const year = unit?.year_group ? `Year ${unit.year_group}` : "KS3–GCSE";
  const keywords = (lesson?.keywords || unit?.keywords || []);
  const kw = Array.isArray(keywords) && keywords.length ? keywords.join(", ") : "";
  const target = lesson?.title ? `the lesson "${lesson.title}" within the unit "${unit?.title}"` : `the unit "${unit?.title}"`;
  return [
    `Build a complete, ready-to-teach ${disc} lesson deck for a UK secondary ${year} class on ${target}.`,
    focus ? `Focus the lesson on: ${focus}.` : "",
    `Follow the HOUSE LESSON TEMPLATE exactly. Produce a full slide sequence: a retrieval/Do-Now starter (with a timer), the learning objectives, the teaching beats with clear KS3–GCSE-accurate explanations and a diagram, table or equation where it helps, at least one MCQ check-for-understanding with the answer and a "Why:" misconception note on reveal, a main task, and an exit ticket.`,
    kw ? `Weave in these keywords where relevant: ${kw}.` : "",
    `Make it visually clean and ready to project. Aim for roughly 8–14 slides.`,
  ].filter(Boolean).join(" ");
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Sign in to generate a lesson." }, 401);
  const token = auth.slice(7);
  if (!process.env.ANTHROPIC_API_KEY) return j({ error: "ANTHROPIC_API_KEY not configured." }, 500);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Invalid JSON body" }, 400); }
  const { unitId, lessonId, focus } = body || {};
  if (!unitId) return j({ error: "unitId is required" }, 400);

  // Entitlement gate (soft): only enforced when BILLING_ENFORCED=1, so current
  // pilots stay open until billing is switched on.
  if (process.env.BILLING_ENFORCED === "1") {
    const ent = await getEntitlement({ skUrl: SK_URL, apikey: SK_ANON, bearer: token });
    if (!can(ent, "ai_generators")) return j({ error: "Lesson generation is a Pro feature. Upgrade on the Billing page.", upgrade: true }, 402);
  }

  // Load unit (+ optional lesson) context under the teacher's RLS.
  let unit: any, lesson: any = null;
  try {
    unit = await sb("units", { params: { id: `eq.${unitId}`, select: `id,title,discipline,year_group,keywords,${SUBJECT_SELECT}` }, single: true }, token);
  } catch { return j({ error: "Unit not found" }, 404); }
  if (lessonId) {
    try { lesson = await sb("lessons", { params: { id: `eq.${lessonId}`, select: "id,title,keywords,unit_id" }, single: true }, token); }
    catch { lesson = null; }
  }

  const instruction = buildInstruction(unit, lesson, typeof focus === "string" ? focus.trim() : null);

  // Reuse the proven slides-assistant generator (empty deck → full deck), forwarding
  // the teacher's auth so its own auth + spend metering apply.
  const origin = new URL(req.url).origin;
  let gen: any;
  try {
    const r = await fetch(`${origin}/api/slides-assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ slides: [], currentSlide: 0, instruction }),
    });
    gen = await r.json();
    if (!r.ok) return j({ error: gen?.error || "Generation failed" }, r.status);
  } catch (e: any) {
    return j({ error: `Generation request failed: ${e.message}` }, 502);
  }

  const slides = Array.isArray(gen?.slides) ? gen.slides : [];
  if (!slides.length) return j({ error: "The generator returned no slides. Try again." }, 502);

  const title = lesson?.title || unit?.title || "Generated lesson";

  // Persist as a deck owned by the teacher (owner defaults to auth.uid()).
  let deck: any;
  try {
    const rows = await sb("decks", { method: "POST", body: { title, slides, unit_id: unitId, lesson_id: lessonId || null } }, token);
    deck = Array.isArray(rows) ? rows[0] : rows;
  } catch (e: any) {
    return j({ error: `Couldn't save the deck: ${e.message}` }, 500);
  }

  return j({ deckId: deck.id, title, slideCount: slides.length, summary: gen.summary || "Lesson generated." });
}
