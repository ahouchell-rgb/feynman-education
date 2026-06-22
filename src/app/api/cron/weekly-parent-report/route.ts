// Feynman Education — weekly parent progress reports (Vercel Cron)
// GET /api/cron/weekly-parent-report   (?force=1 to run off-schedule)
//
// Runs weekly. For every CONSENTED guardian↔pupil link it builds a plain-language
// report (what the class studied + the pupil's weak objectives + a practise link),
// persists it to parent_reports, and emails it to the guardian (if email is
// configured). Consent is mandatory — only consent_status = 'granted' links are sent.
//
// Env (Vercel):
//   CRON_SECRET                 — shared secret; cron calls with Authorization: Bearer <it>
//   SUPABASE_SERVICE_ROLE_KEY   — anchor service role (read links/classes/taught_log, write reports)
//   SK_API_KEY                  — x-sciencekit-key secret that gates the retrieval RPCs
//   ANTHROPIC_API_KEY           — optional; AI summary (falls back to a template)
//   RESEND_API_KEY + PARENT_REPORT_FROM — optional; emailing (else persist only)
//   NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN    — optional; "practise now" link base

import {
  fetchTaughtThisWeek, fetchWeakTopics, generateParentReportHtml, weekStartISO, weekLabel,
} from "@/lib/parentReport";
import { sendEmail, emailConfigured } from "@/lib/email";
import { cronAuthorized, recordCronRun } from "@/lib/serverHelpers";
import { reportError } from "@/lib/observe";

const JOB = "weekly-parent-report";

export const runtime = "nodejs";
export const maxDuration = 300;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const RET_ORIGIN = process.env.NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN || "https://retrieval-app.com";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || "";  // this app's own URL, for portal + unsubscribe links

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

async function skAdmin(path: string, init: RequestInit = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, {
    ...init,
    headers: { "content-type": "application/json", apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=representation", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`SK ${path}: ${r.status} ${await r.text().catch(() => "")}`);
  return r.status === 204 ? null : r.json();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 2000);

  if (!cronAuthorized(req)) return j({ error: "unauthorized" }, 401);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  if (!process.env.SK_API_KEY) return j({ error: "SK_API_KEY missing (needed to read retrieval data)" }, 500);

  const weekStart = weekStartISO();
  const startedAt = new Date().toISOString();

  // Consented links + the embedded guardian + class (retrieval_class_ids, name).
  let links: any[];
  try {
    links = await skAdmin(
      `guardian_student?select=id,student_id,student_name,unsubscribe_token,teacher_id,guardian:guardians(email,full_name,access_token),class:classes(name,retrieval_class_ids)` +
      `&consent_status=eq.granted&limit=${limit}`,
    );
  } catch (e: any) {
    await reportError(e, { route: JOB, phase: "load links" });
    await recordCronRun(JOB, { startedAt, ok: false, processed: 0, failed: 0, notes: `load links: ${e.message}` });
    return j({ error: `load links: ${e.message}` }, 500);
  }

  if (!links?.length) {
    await recordCronRun(JOB, { startedAt, ok: true, processed: 0, failed: 0, notes: "no consented guardian links" });
    return j({ weekStart, skipped: "no consented guardian links" });
  }

  const results: any[] = [];
  for (const link of links) {
    const classLabel = link.class?.name || "Science";
    const retId = (link.class?.retrieval_class_ids || [])[0];
    const guardianEmail = link.guardian?.email;
    try {
      if (!retId) { results.push({ student: link.student_name, skipped: "class not linked to retrieval" }); continue; }

      // Skip if a report for this link + week already exists (idempotent re-runs).
      const existing = await skAdmin(`parent_reports?select=id&link_id=eq.${link.id}&week_start=eq.${weekStart}&limit=1`).catch(() => []);
      if (existing?.length && !force) { results.push({ student: link.student_name, skipped: "already generated this week" }); continue; }

      const [taught, weak] = await Promise.all([
        fetchTaughtThisWeek({ skUrl: SK_URL, apikey: SK_ANON, bearer: process.env.SUPABASE_SERVICE_ROLE_KEY!, retrievalClassId: retId, weekStart }),
        fetchWeakTopics({ retUrl: SK_URL, retKey: SK_ANON, skApiKey: process.env.SK_API_KEY!, studentId: link.student_id, retrievalClassId: retId }),
      ]);

      const unsubscribeUrl = APP_ORIGIN ? `${APP_ORIGIN}/parent/unsubscribe?t=${encodeURIComponent(link.unsubscribe_token)}` : undefined;
      const portalUrl = APP_ORIGIN && link.guardian?.access_token ? `${APP_ORIGIN}/parent?t=${encodeURIComponent(link.guardian.access_token)}` : undefined;
      const { html } = await generateParentReportHtml({
        studentName: link.student_name, classLabel, weekStart, taught, weak,
        retrievalOrigin: RET_ORIGIN, retrievalClassId: retId, unsubscribeUrl, portalUrl,
      });

      const emailRes = guardianEmail && emailConfigured()
        ? await sendEmail({ to: guardianEmail, subject: `${link.student_name}'s science week — ${weekLabel(weekStart)}`, html })
        : { sent: false };

      await skAdmin("parent_reports", {
        method: "POST",
        body: JSON.stringify({
          teacher_id: link.teacher_id, link_id: link.id, guardian_id: null,
          student_name: link.student_name, class_label: classLabel, week_start: weekStart,
          topics: weak.map((w) => ({ topic: w.topic_name, pct: Math.round(Number(w.pct_correct)) })),
          html, emailed: emailRes.sent, emailed_at: emailRes.sent ? new Date().toISOString() : null,
        }),
      });

      results.push({ student: link.student_name, emailed: emailRes.sent, topics: weak.length, ok: true });
    } catch (e: any) {
      await reportError(e, { route: JOB, student: link.student_name });
      results.push({ student: link.student_name, error: e.message });
    }
  }

  const processed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => r.error).length;
  await recordCronRun(JOB, { startedAt, ok: failed === 0, processed, failed, notes: `${processed} generated, ${failed} failed of ${links.length} links` });
  return j({ weekStart, generated: processed, emailable: emailConfigured(), results });
}
