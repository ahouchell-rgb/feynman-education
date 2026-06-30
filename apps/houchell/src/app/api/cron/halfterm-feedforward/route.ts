// Houchell Education — automatic half-term feedforward (Vercel Cron)
// GET /api/cron/halfterm-feedforward   (?force=1 to run off-schedule)
//
// Runs weekly. If a holiday period just ended (a new half-term started), it
// generates a gaps-driven, AI-scaffolded PPTX feedforward deck for every class
// linked to retrieval, and saves each to feedforward_decks for the teacher.
//
// Env (Vercel):
//   CRON_SECRET                 — shared secret; cron calls with Authorization: Bearer <it>
//   SUPABASE_SERVICE_ROLE_KEY   — ScienceKit service role (read classes, write decks)
//   ANTHROPIC_API_KEY           — scaffolds
//   SK_API_KEY                  — the x-sciencekit-key shared secret that gates the retrieval RPCs
import { buildFeedforwardPptx } from "@/lib/feedforwardPptx";
import { cronAuthorized, recordCronRun, withTimeout, RETRIEVAL_TIMEOUT_MS, SK_ANON, SK_URL } from "@/lib/serverHelpers";
import { reportError } from "@/lib/observe";

const JOB = "halfterm-feedforward";

export const runtime = "nodejs";
export const maxDuration = 300;

const RET_URL = SK_URL;
const RET_KEY = SK_ANON;
const SK_API_KEY = process.env.SK_API_KEY || "";  // x-sciencekit-key shared secret — set in Vercel env (gates the retrieval RPCs)
const MODEL = "claude-sonnet-4-6";

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

// ── data helpers ──────────────────────────────────────────────────────────
async function skAdmin(path: string, init: RequestInit = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, {
    ...init,
    headers: { "content-type": "application/json", apikey: key, Authorization: `Bearer ${key}`,
               Prefer: "return=representation", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`SK ${path}: ${r.status} ${await r.text().catch(() => "")}`);
  return r.status === 204 ? null : r.json();
}
// Timeout + fallback: a slow/down retrieval app yields [] so the per-class loop
// skips that class (logged in `results`) instead of hanging to maxDuration.
async function retRpc(fn: string, body: any) {
  try {
    return await withTimeout((signal) => fetch(`${RET_URL}/rest/v1/rpc/${fn}`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", apikey: RET_KEY, Authorization: `Bearer ${RET_KEY}`, "x-sciencekit-key": SK_API_KEY },
      body: JSON.stringify(body),
    }).then((r) => (r.ok ? r.json() : [])), RETRIEVAL_TIMEOUT_MS);
  } catch (e: any) { console.warn(`halfterm-feedforward retRpc ${fn} failed: ${e?.message || e}`); return []; }
}

function halfTermLabel(d: Date) {
  const m = d.getMonth() + 1, y = d.getFullYear();
  const ay = m >= 9 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
  const name = m === 9 || m === 10 ? "Autumn 1" : m === 11 || m === 12 ? "Autumn 2"
    : m === 1 || m === 2 ? "Spring 1" : m === 3 ? "Spring 2" : m === 4 || m === 5 ? "Summer 1" : "Summer 2";
  return `${name} · ${ay}`;
}

// Did a holiday period end within the last `days` days (i.e. a new half-term just started)?
async function holidayJustEnded(days = 8): Promise<boolean> {
  const cals = await skAdmin("timetable_calendar?select=holiday_periods").catch(() => []);
  const now = Date.now(), cutoff = now - days * 864e5;
  for (const c of cals || [])
    for (const h of c.holiday_periods || []) {
      const end = Date.parse(h.end);
      if (!isNaN(end) && end <= now && end >= cutoff) return true;
    }
  return false;
}

// ── AI scaffolding (one call per topic; falls back to raw questions) ────────
async function scaffold(topic: string, questions: string[]): Promise<any[]> {
  const raw = [{ title: "Retrieve — answer from memory", lines: questions.slice(0, 6) }];
  if (!process.env.ANTHROPIC_API_KEY || !questions.length) return raw;
  const prompt = `You are making a UK KS3 science FEEDFORWARD for "${topic}". Pupils were weak on it in retrieval practice. Their questions:\n- ${questions.slice(0, 10).join("\n- ")}\n\nProduce 3 scaffolded activities building to exam standard: (1) fill-in-the-blanks with a word bank, (2) a matching/sort task, (3) a short exam question. Return ONLY JSON: a list of {"title":"...","wordbank":"optional · dot · separated","lines":["...","..."]}. UK spelling.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return raw;
    const d = await r.json();
    let text = (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    text = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const acts = JSON.parse(text);
    return Array.isArray(acts) && acts.length ? acts : raw;
  } catch { return raw; }
}

// ── handler ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  if (!cronAuthorized(req)) return j({ error: "unauthorized" }, 401);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  if (!SK_API_KEY) return j({ error: "SK_API_KEY missing (needed to read retrieval data)" }, 500);

  const startedAt = new Date().toISOString();

  if (!force && !(await holidayJustEnded())) {
    await recordCronRun(JOB, { startedAt, ok: true, processed: 0, failed: 0, notes: "no half-term boundary in the last week" });
    return j({ skipped: "no half-term boundary in the last week" });
  }

  const halfTerm = halfTermLabel(new Date());
  let classes: any[];
  try {
    classes = await skAdmin("classes?select=id,name,teacher_id,retrieval_class_ids&archived=eq.false");
  } catch (e: any) {
    await reportError(e, { route: JOB, phase: "load classes" });
    await recordCronRun(JOB, { startedAt, ok: false, processed: 0, failed: 0, notes: `load classes: ${e.message}` });
    return j({ error: `load classes: ${e.message}` }, 500);
  }

  const results: any[] = [];
  for (const c of classes || []) {
    const retId = (c.retrieval_class_ids || [])[0];
    if (!retId) continue;
    try {
      const weak = await retRpc("class_weak_topics", { p_class_id: retId, p_limit: 5 });
      if (!Array.isArray(weak) || !weak.length) { results.push({ class: c.name, skipped: "no weak topics" }); continue; }
      const topics = [];
      for (const w of weak) {
        const qs = await retRpc("topic_preview_questions", { p_topic_id: w.topic_id });
        const questions = (Array.isArray(qs) ? qs : []).map((q: any) => q.question_text);
        const pct = Math.round(Number(w.pct_correct));
        topics.push({
          topic: w.topic_name,
          stat: `only ${pct}% correct · ${w.marked} answers${w.students ? ` · ${w.students} pupils` : ""}`,
          activities: await scaffold(w.topic_name, questions),
        });
      }
      const buf: Buffer = await buildFeedforwardPptx({ classLabel: c.name, halfTerm, topics });
      await skAdmin("feedforward_decks", {
        method: "POST",
        body: JSON.stringify({
          teacher_id: c.teacher_id, class_id: retId, class_label: c.name, half_term: halfTerm,
          topics: weak.map((w: any) => ({ topic: w.topic_name, pct: Math.round(Number(w.pct_correct)) })),
          pptx_base64: buf.toString("base64"),
        }),
      });
      results.push({ class: c.name, topics: topics.length, ok: true });
    } catch (e: any) {
      await reportError(e, { route: JOB, class: c.name });
      results.push({ class: c.name, error: e.message });
    }
  }
  const processed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => r.error).length;
  await recordCronRun(JOB, { startedAt, ok: failed === 0, processed, failed, notes: `${halfTerm}: ${processed} decks, ${failed} failed` });
  return j({ halfTerm, generated: processed, results });
}
