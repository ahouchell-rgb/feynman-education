// Houchell Education — public parent portal data (password-less, token magic-link).
// GET /api/parent/portal?t=<guardians.access_token>
//
// Resolves the guardian token server-side with the service role and returns ONLY
// that guardian's consented children + their saved reports + a practise link.
// No teacher/auth data is exposed; revoked/pending links are omitted.
//
// Token lifecycle: the magic-link token has an expiry (guardians.access_token_
// expires_at, default 60 days). Expired tokens are rejected (410); a successful
// access slides the expiry window forward so an in-use link keeps working while a
// leaked/unused one lapses. The weekly email always carries the current token.
//
// Env: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN (practise link).

import { SK_URL } from "@/lib/serverHelpers";
import { RETRIEVAL_ORIGIN as RET_ORIGIN } from "@/lib/interactive";

export const runtime = "nodejs";

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function admin(path: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
// Sliding-window renewal: extend an actively-used token's expiry so the link
// keeps working while it's in use, but a leaked/unused link still lapses. Best-
// effort — a failed extend must not block returning the parent's reports.
const ACCESS_TOKEN_TTL_DAYS = 60;
async function extendToken(token: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const expires = new Date(Date.now() + ACCESS_TOKEN_TTL_DAYS * 86400_000).toISOString();
  try {
    await fetch(`${SK_URL}/rest/v1/guardians?access_token=eq.${token}`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ access_token_expires_at: expires }),
    });
  } catch { /* best-effort */ }
}
async function retRpc(fn: string, body: any) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const secret = process.env.SK_API_KEY || "";
  const r = await fetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key, Authorization: `Bearer ${key}`, ...(secret ? { "x-sciencekit-key": secret } : {}) },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : [];
}

export async function GET(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "not configured" }, 500);
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return j({ error: "invalid link" }, 400);

  // Resolve the guardian by access token.
  let guardian: any;
  try {
    const gs = await admin(`guardians?access_token=eq.${token}&select=id,full_name,access_token_expires_at&limit=1`);
    guardian = gs?.[0];
  } catch { return j({ error: "lookup failed" }, 500); }
  if (!guardian) return j({ error: "not found" }, 404);

  // Reject expired magic links with a clear, actionable message. A new link is
  // sent with each weekly report email, so the parent just needs the latest one.
  const exp = guardian.access_token_expires_at ? Date.parse(guardian.access_token_expires_at) : NaN;
  if (Number.isFinite(exp) && exp < Date.now()) {
    return j({ error: "This link has expired. Please open the link in your most recent weekly report email." }, 410);
  }
  // Slide the expiry window forward for an actively-used link (best-effort).
  await extendToken(token);

  // Consented children only, with their class (for the practise link) + Home fields.
  let links: any[] = [];
  try {
    links = await admin(
      `guardian_student?guardian_id=eq.${guardian.id}&consent_status=eq.granted` +
      `&select=id,student_name,student_id,unsubscribe_token,target_grade,home_subscribed,class:classes(name,retrieval_class_ids,teacher_id)`,
    );
  } catch { /* leave empty */ }

  // School sponsorship: a child's Home is free when their school sponsors it.
  const teacherIds = [...new Set(links.map((l) => l.class?.teacher_id).filter(Boolean))];
  const sponsoredByTeacher = new Map<string, boolean>();
  if (teacherIds.length) {
    try {
      const profs = await admin(`profiles?id=in.(${teacherIds.join(",")})&select=id,school_id`);
      const schoolIds = [...new Set(profs.map((p: any) => p.school_id).filter(Boolean))];
      const schools = schoolIds.length ? await admin(`schools?id=in.(${schoolIds.join(",")})&select=id,home_sponsored`) : [];
      const sponsored = new Map(schools.map((s: any) => [s.id, !!s.home_sponsored]));
      profs.forEach((p: any) => sponsoredByTeacher.set(p.id, !!sponsored.get(p.school_id)));
    } catch { /* no sponsorship info */ }
  }

  // Saved reports for those links, newest first.
  const linkIds = links.map((l) => l.id);
  let reports: any[] = [];
  if (linkIds.length) {
    try {
      reports = await admin(
        `parent_reports?link_id=in.(${linkIds.join(",")})&select=id,link_id,week_start,html,emailed,created_at&order=created_at.desc&limit=60`,
      );
    } catch { /* leave empty */ }
  }

  // Home-learning course (Springboard) progress, joined by the child's student_id
  // (the teacher mints course links against the same id, so this lines up).
  const studentIds = [...new Set(links.map((l) => l.student_id).filter(Boolean))];
  let courseRows: any[] = [];
  if (studentIds.length) {
    try { courseRows = await admin(`springboard_progress?student_id=in.(${studentIds.join(",")})&select=student_id,xp,crowns,streak,updated_at`); } catch { /* none */ }
  }
  const courseById = new Map(courseRows.map((c: any) => [c.student_id, c]));

  const children = await Promise.all(links.map(async (l) => {
    const retId = (l.class?.retrieval_class_ids || [])[0];
    const mine = reports.filter((r) => r.link_id === l.id);
    const c = l.student_id ? courseById.get(l.student_id) : null;
    const course = c ? { xp: c.xp || 0, crowns: c.crowns || 0, streak: c.streak || 0, updatedAt: c.updated_at || null } : null;
    const homeEnabled = !!l.home_subscribed || !!sponsoredByTeacher.get(l.class?.teacher_id);

    // Home: the child's weakest objectives (per-pupil RPC, falling back to class).
    let weak: any[] = [];
    if (homeEnabled && retId) {
      const rows = l.student_id
        ? await retRpc("student_weak_topics", { p_student_id: l.student_id, p_limit: 6 })
        : [];
      const src = (Array.isArray(rows) && rows.length) ? rows : await retRpc("class_weak_topics", { p_class_id: retId, p_limit: 6 });
      weak = (Array.isArray(src) ? src : []).map((w: any) => ({
        topic_id: w.topic_id, topic_name: w.topic_name, pct: Math.round(Number(w.pct_correct)),
        practiseUrl: w.topic_id ? `${RET_ORIGIN}/topic/${encodeURIComponent(w.topic_id)}` : null,
      }));
    }
    const recentScore = weak.length ? Math.round(weak.reduce((a, w) => a + w.pct, 0) / weak.length) : null;

    return {
      linkId: l.id,
      studentName: l.student_name,
      classLabel: l.class?.name || "Science",
      practiseUrl: retId ? `${RET_ORIGIN}/class/${encodeURIComponent(retId)}` : null,
      unsubscribeToken: l.unsubscribe_token,
      reports: mine.map((r) => ({ id: r.id, weekStart: r.week_start, html: r.html, emailed: r.emailed })),
      home: { enabled: homeEnabled, weak, targetGrade: l.target_grade || null, recentScore },
      course,
    };
  }));

  return j({ guardianName: guardian.full_name || null, children });
}
