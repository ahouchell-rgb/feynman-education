// Feynman Education — on-demand parent report preview / send.
// POST /api/parent-report/preview   Authorization: Bearer <teacher JWT>
//
// Body: { linkId }                       — generate for a saved guardian_student link
//   or  { studentName, classId, studentId? }  — ad-hoc preview (no link needed)
//   plus optional { send: true }         — also email the guardian (link mode only)
//
// Returns: { html, topics, weekStart, emailed }. Lets a teacher see/QA a report
// before the weekly cron sends it. RLS scopes every read to the teacher.
//
// Env: SK_API_KEY (retrieval RPCs), ANTHROPIC_API_KEY (optional AI),
//      RESEND_API_KEY + PARENT_REPORT_FROM (optional send).

import { supaRest } from "@/lib/supabaseRest";
import {
  fetchTaughtThisWeek, fetchWeakTopics, generateParentReportHtml, weekStartISO, weekLabel,
} from "@/lib/parentReport";
import { sendEmail, emailConfigured } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const RET_ORIGIN = process.env.NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN || "https://retrieval-app.com";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || "";

const err = (m: string, s = 500) => new Response(JSON.stringify({ error: m }), { status: s, headers: { "content-type": "application/json" } });

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return err("Missing bearer token", 401);
  const token = auth.slice(7);
  if (!process.env.SK_API_KEY) return err("SK_API_KEY not configured (needed for retrieval data)", 500);

  let body: any;
  try { body = await req.json(); } catch { return err("Invalid JSON body", 400); }
  const { linkId, send } = body || {};

  // Resolve student/class context — either from a saved link (under RLS) or ad-hoc.
  let studentName: string, classId: string | undefined, studentId: string | null, link: any = null;
  try {
    if (linkId) {
      link = await supaRest(SK_URL, "guardian_student", {
        apikey: SK_ANON, bearer: token, single: true,
        params: { id: `eq.${linkId}`, select: "id,student_name,student_id,unsubscribe_token,class:classes(id,name,retrieval_class_ids),guardian:guardians(email,access_token)" },
      });
      studentName = link.student_name;
      classId = link.class?.id;
      studentId = link.student_id || null;
    } else {
      studentName = String(body.studentName || "").trim();
      classId = body.classId;
      studentId = body.studentId || null;
      if (!studentName || !classId) return err("Provide linkId, or studentName + classId", 400);
    }
  } catch { return err("Couldn't load that link", 404); }

  // Class (for label + retrieval id) under the teacher's RLS.
  let cls: any = link?.class;
  if (!cls) {
    try {
      cls = await supaRest(SK_URL, "classes", {
        apikey: SK_ANON, bearer: token, single: true,
        params: { id: `eq.${classId}`, select: "id,name,retrieval_class_ids" },
      });
    } catch { return err("Class not found", 404); }
  }
  const retId = (cls?.retrieval_class_ids || [])[0];
  if (!retId) return err("This class isn't linked to retrieval yet", 400);

  const weekStart = weekStartISO();
  const [taught, weak] = await Promise.all([
    fetchTaughtThisWeek({ skUrl: SK_URL, apikey: SK_ANON, bearer: token, retrievalClassId: retId, weekStart }),
    fetchWeakTopics({ retUrl: SK_URL, retKey: SK_ANON, skApiKey: process.env.SK_API_KEY!, studentId, retrievalClassId: retId }),
  ]);

  const unsubscribeUrl = link?.unsubscribe_token && APP_ORIGIN
    ? `${APP_ORIGIN}/parent/unsubscribe?t=${encodeURIComponent(link.unsubscribe_token)}`
    : undefined;
  const portalUrl = link?.guardian?.access_token && APP_ORIGIN
    ? `${APP_ORIGIN}/parent?t=${encodeURIComponent(link.guardian.access_token)}`
    : undefined;
  const { html, ai } = await generateParentReportHtml({
    studentName, classLabel: cls?.name || "Science", weekStart, taught, weak,
    retrievalOrigin: RET_ORIGIN, retrievalClassId: retId, unsubscribeUrl, portalUrl,
  });

  // Optional send (link mode only — we need a guardian email).
  let emailed = false;
  if (send && link?.guardian?.email && emailConfigured()) {
    const r = await sendEmail({ to: link.guardian.email, subject: `${studentName}'s science week — ${weekLabel(weekStart)}`, html });
    emailed = r.sent;
  }

  // Persist the preview so it appears in the teacher's report history (best-effort).
  try {
    await supaRest(SK_URL, "parent_reports", {
      method: "POST", apikey: SK_ANON, bearer: token, prefer: "return=minimal",
      body: {
        link_id: link?.id || null, student_name: studentName, class_label: cls?.name || "Science",
        week_start: weekStart, topics: weak.map((w) => ({ topic: w.topic_name, pct: Math.round(Number(w.pct_correct)) })),
        html, emailed, emailed_at: emailed ? new Date().toISOString() : null,
      },
    });
  } catch { /* non-fatal — teacher still sees the preview */ }

  return new Response(
    JSON.stringify({ html, ai, weekStart, emailed, topics: weak, taught }),
    { headers: { "content-type": "application/json" } },
  );
}
