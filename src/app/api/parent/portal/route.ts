// Feynman Education — public parent portal data (password-less, token magic-link).
// GET /api/parent/portal?t=<guardians.access_token>
//
// Resolves the guardian token server-side with the service role and returns ONLY
// that guardian's consented children + their saved reports + a practise link.
// No teacher/auth data is exposed; revoked/pending links are omitted.
//
// Env: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN (practise link).

export const runtime = "nodejs";

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const RET_ORIGIN = process.env.NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN || "https://retrieval-app.com";

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function admin(path: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function GET(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "not configured" }, 500);
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return j({ error: "invalid link" }, 400);

  // Resolve the guardian by access token.
  let guardian: any;
  try {
    const gs = await admin(`guardians?access_token=eq.${token}&select=id,full_name&limit=1`);
    guardian = gs?.[0];
  } catch { return j({ error: "lookup failed" }, 500); }
  if (!guardian) return j({ error: "not found" }, 404);

  // Consented children only, with their class (for the practise link).
  let links: any[] = [];
  try {
    links = await admin(
      `guardian_student?guardian_id=eq.${guardian.id}&consent_status=eq.granted` +
      `&select=id,student_name,unsubscribe_token,class:classes(name,retrieval_class_ids)`,
    );
  } catch { /* leave empty */ }

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

  const children = links.map((l) => {
    const retId = (l.class?.retrieval_class_ids || [])[0];
    const mine = reports.filter((r) => r.link_id === l.id);
    return {
      linkId: l.id,
      studentName: l.student_name,
      classLabel: l.class?.name || "Science",
      practiseUrl: retId ? `${RET_ORIGIN}/class/${encodeURIComponent(retId)}` : null,
      unsubscribeToken: l.unsubscribe_token,
      reports: mine.map((r) => ({ id: r.id, weekStart: r.week_start, html: r.html, emailed: r.emailed })),
    };
  });

  return j({ guardianName: guardian.full_name || null, children });
}
