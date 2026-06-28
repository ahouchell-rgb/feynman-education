// Feynman Education — Weekly Parent Report generator (server-only).
//
// Shared by the weekly cron (/api/cron/weekly-parent-report) and the on-demand
// preview route (/api/parent-report/preview). Pure-ish: data-gathering helpers
// take their URLs/keys/bearer explicitly so the cron can call as the service
// role and the preview route can call under the teacher's JWT.
//
// The report has three inputs:
//   1. taught_this_week  — from this repo's domain (taught_log → lessons → units)
//   2. weak_objectives   — from retrieval (student_weak_topics, falling back to
//                          class_weak_topics) via the x-sciencekit-key-gated RPC
//   3. an AI parent-tone summary (Anthropic) — falls back to a plain template

import { supaRest } from "@/lib/supabaseRest";
import { withTimeout, RETRIEVAL_TIMEOUT_MS } from "@/lib/serverHelpers";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";

export interface TaughtItem { lessonTitle: string; unitTitle: string; taughtAt: string; }
export interface WeakTopic { topic_id?: string; topic_name: string; pct_correct: number; marked?: number; booklet_url?: string; }

/** Monday (local) of the week containing `d`, as YYYY-MM-DD. */
export function weekStartISO(d = new Date()): string {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow);
  return x.toISOString().slice(0, 10);
}

export function weekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Lessons taught to this class since `weekStartISO`, newest first.
 *  Uses PostgREST array-overlap on taught_log.retrieval_class_ids and embeds
 *  the lesson + unit titles. `bearer` may be a teacher JWT (RLS) or the service
 *  role key (cron). */
export async function fetchTaughtThisWeek(opts: {
  skUrl: string; apikey: string; bearer: string;
  retrievalClassId: string; weekStart: string;
}): Promise<TaughtItem[]> {
  const { skUrl, apikey, bearer, retrievalClassId, weekStart } = opts;
  let rows: any[] = [];
  try {
    rows = await supaRest(skUrl, "taught_log", {
      apikey, bearer,
      params: {
        select: "taught_at,lesson:lessons(title,unit:units(title))",
        retrieval_class_ids: `ov.{${retrievalClassId}}`,
        taught_at: `gte.${weekStart}`,
        order: "taught_at.desc",
      },
    }) || [];
  } catch { return []; }
  return (rows || []).map((r: any) => ({
    lessonTitle: r.lesson?.title || "",
    unitTitle: r.lesson?.unit?.title || "",
    taughtAt: r.taught_at,
  })).filter((t: TaughtItem) => t.lessonTitle || t.unitTitle);
}

/** The pupil's weakest objectives. Prefers the per-pupil RPC; falls back to the
 *  class-level RPC so the report still has substance before student_weak_topics
 *  ships on the retrieval side. Both are gated by the x-sciencekit-key secret. */
export async function fetchWeakTopics(opts: {
  retUrl: string; retKey: string; skApiKey: string;
  studentId?: string | null; retrievalClassId: string; limit?: number;
}): Promise<WeakTopic[]> {
  const { retUrl, retKey, skApiKey, studentId, retrievalClassId, limit = 4 } = opts;
  // Timeout + fallback: a slow/down retrieval app yields [] so the parent report
  // is generated with no weak topics (the cron continues to the next pupil)
  // rather than the request hanging to maxDuration.
  const call = async (fn: string, body: any): Promise<WeakTopic[]> => {
    try {
      const r = await withTimeout((signal) => fetch(`${retUrl}/rest/v1/rpc/${fn}`, {
        method: "POST", signal,
        headers: { "content-type": "application/json", apikey: retKey, Authorization: `Bearer ${retKey}`, "x-sciencekit-key": skApiKey },
        body: JSON.stringify(body),
      }), RETRIEVAL_TIMEOUT_MS);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    } catch { return []; }
  };
  let topics: WeakTopic[] = [];
  if (studentId) {
    const perPupil = await call("student_weak_topics", { p_student_id: studentId, p_limit: limit });
    if (perPupil.length) topics = perPupil;
  }
  if (!topics.length) topics = await call("class_weak_topics", { p_class_id: retrievalClassId, p_limit: limit });

  // Enrich with the public revision booklet for each weak topic (anon-readable
  // topic_booklets), so the report can offer a "Revise at home →" link — the
  // parent surface of the practice→revise loop.
  const ids = topics.map(t => t.topic_id).filter(Boolean) as string[];
  if (ids.length) {
    try {
      const r = await fetch(`${retUrl}/rest/v1/topic_booklets?select=topic_id,url&topic_id=in.(${ids.join(",")})`, {
        headers: { apikey: retKey, Authorization: `Bearer ${retKey}` },
      });
      if (r.ok) {
        const rows = await r.json();
        const map: Record<string, string> = {};
        (Array.isArray(rows) ? rows : []).forEach((row: any) => { if (row?.topic_id) map[row.topic_id] = row.url; });
        topics = topics.map(t => ({ ...t, booklet_url: t.topic_id ? map[t.topic_id] : undefined }));
      }
    } catch { /* best-effort — booklet links are optional */ }
  }
  return topics;
}

function fallbackHtml(p: {
  studentName: string; classLabel: string; weekStart: string;
  taught: TaughtItem[]; weak: WeakTopic[]; practiseUrl: string | null; unsubscribeUrl?: string; portalUrl?: string;
}): string {
  const taughtList = p.taught.length
    ? p.taught.map(t => `<li>${esc(t.lessonTitle)}${t.unitTitle ? ` <span style="color:#888">· ${esc(t.unitTitle)}</span>` : ""}</li>`).join("")
    : "<li>No lessons were logged for this class this week.</li>";
  const weakList = p.weak.length
    ? p.weak.map(w => {
        const revise = w.booklet_url ? ` · <a href="${esc(w.booklet_url)}" style="color:#1a7f5a;text-decoration:none;font-weight:600">Revise at home →</a>` : "";
        return `<li><strong>${esc(w.topic_name)}</strong> — ${Math.round(Number(w.pct_correct))}% correct in practice${revise}</li>`;
      }).join("")
    : "<li>No weak areas flagged this week — nice work.</li>";
  const cta = p.practiseUrl
    ? `<p style="margin:20px 0"><a href="${esc(p.practiseUrl)}" style="background:#1a7f5a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Practise tonight →</a></p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f4f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#fff;border:1px solid #e5e5e0;border-radius:10px;padding:28px">
    <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#888;margin:0 0 6px">Weekly progress · ${esc(p.classLabel)}</p>
    <h1 style="font-size:24px;margin:0 0 4px">${esc(p.studentName)}'s week</h1>
    <p style="color:#666;margin:0 0 20px">Week of ${esc(weekLabel(p.weekStart))}</p>
    <h2 style="font-size:15px;margin:18px 0 6px">What ${esc(firstName(p.studentName))} studied</h2>
    <ul style="margin:0;padding-left:18px;line-height:1.6">${taughtList}</ul>
    <h2 style="font-size:15px;margin:22px 0 6px">Where a little practice would help</h2>
    <ul style="margin:0;padding-left:18px;line-height:1.6">${weakList}</ul>
    ${cta}
  </div>
  <p style="font-size:11px;color:#999;text-align:center;margin:16px 0 0">
    ${p.portalUrl ? `<a href="${esc(p.portalUrl)}" style="color:#1a7f5a">See all of ${esc(firstName(p.studentName))}'s reports</a> · ` : ""}
    You're receiving this because you asked for weekly updates about ${esc(p.studentName)}.
    ${p.unsubscribeUrl ? `<a href="${esc(p.unsubscribeUrl)}" style="color:#999">Unsubscribe</a>.` : ""}
  </p>
</div></body></html>`;
}

const esc = (s: string) => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const firstName = (s: string) => String(s || "").trim().split(/\s+/)[0] || s;

function buildPrompt(p: {
  studentName: string; classLabel: string; weekStart: string;
  taught: TaughtItem[]; weak: WeakTopic[]; practiseUrl: string | null; unsubscribeUrl?: string; portalUrl?: string;
}): string {
  const taught = p.taught.length ? p.taught.map(t => `- ${t.lessonTitle}${t.unitTitle ? ` (${t.unitTitle})` : ""}`).join("\n") : "(no lessons logged this week)";
  const weak = p.weak.length ? p.weak.map(w => `- ${w.topic_name} — ${Math.round(Number(w.pct_correct))}% correct${w.booklet_url ? ` [revise: ${w.booklet_url}]` : ""}`).join("\n") : "(no weak areas flagged)";
  return `You are writing a short, warm WEEKLY PROGRESS EMAIL to the parent/carer of a UK secondary science pupil named ${p.studentName} (class ${p.classLabel}), for the week of ${weekLabel(p.weekStart)}.

WHAT THE CLASS STUDIED THIS WEEK:
${taught}

WHERE ${p.studentName.toUpperCase()} IS WEAKEST (from their retrieval practice):
${weak}

Write ONE self-contained, inline-styled, mobile-friendly HTML email (A 560px centred card on a light background; no external CSS, fonts, images or scripts). It must contain, in plain non-jargon language a parent will understand:
1. A friendly one-line opener.
2. "What ${firstName(p.studentName)} studied" — a short readable summary of the lessons above (not a raw list dump).
3. "Where a little practice would help" — the weak topics, framed positively and concretely. For each weak topic that has a "[revise: URL]", add a small inline "Revise at home →" link to that exact URL right after the topic; omit the link for topics without one.
4. "Three questions to ask at dinner" — three short, specific questions a parent can ask about the topics above to prompt recall.
5. A single clear call-to-action button${p.practiseUrl ? ` linking to ${p.practiseUrl}` : " (omit if no link)"} labelled like "Practise tonight".
6. A small footer noting they get this because they asked for updates about ${p.studentName}${p.portalUrl ? `, with a link to ${p.portalUrl} to see all of ${firstName(p.studentName)}'s reports` : ""}${p.unsubscribeUrl ? `, and an unsubscribe link to ${p.unsubscribeUrl}` : ""}.

Be encouraging and brief. UK spelling. Do NOT invent topics, marks, or lessons beyond those given. Return ONLY the HTML inside a single \`\`\`html ... \`\`\` code block.`;
}

function extractHtml(text: string): string {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const doc = text.match(/<!doctype[\s\S]*<\/html>|<html[\s\S]*<\/html>/i);
  if (doc) return doc[0].trim();
  return text.trim();
}

export interface ReportInput {
  studentName: string; classLabel: string; weekStart: string;
  taught: TaughtItem[]; weak: WeakTopic[];
  retrievalOrigin?: string; retrievalClassId?: string; unsubscribeUrl?: string; portalUrl?: string;
}
export interface ReportResult { html: string; usage?: { inputTokens: number; outputTokens: number }; ai: boolean; }

/** Build the report HTML. Uses Anthropic when ANTHROPIC_API_KEY is set, else a
 *  clean templated fallback so the feature still works without AI. */
export async function generateParentReportHtml(input: ReportInput): Promise<ReportResult> {
  const practiseUrl = input.retrievalOrigin
    ? `${input.retrievalOrigin}${input.retrievalClassId ? `/class/${encodeURIComponent(input.retrievalClassId)}` : ""}`
    : null;
  const p = { ...input, practiseUrl };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { html: fallbackHtml(p), ai: false };
  }
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: buildPrompt(p) }] }),
    });
    if (!r.ok) return { html: fallbackHtml(p), ai: false };
    const d = await r.json();
    const text = (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const html = extractHtml(text);
    if (!/[<][a-z]/i.test(html)) return { html: fallbackHtml(p), ai: false };
    return { html, ai: true, usage: { inputTokens: d.usage?.input_tokens || 0, outputTokens: d.usage?.output_tokens || 0 } };
  } catch {
    return { html: fallbackHtml(p), ai: false };
  }
}
