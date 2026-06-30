// Houchell Education — self-serve data export (NOW plan E3 / data-subject rights).
// GET /api/account/export   Authorization: Bearer <JWT>
// Returns a JSON bundle of the caller's own owner-scoped data (RLS guarantees
// it's only theirs). A simple GDPR access-request path.

import { audit } from "@/lib/audit";
import { SK_ANON, SK_URL } from "@/lib/serverHelpers";

export const runtime = "nodejs";


async function rest(path: string, bearer: string) {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${bearer}` } });
  return r.ok ? r.json() : [];
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("unauthorized", { status: 401 });
  const token = auth.slice(7);

  let uid = "";
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return new Response("unauthorized", { status: 401 });
    uid = (await u.json()).id;
  } catch { return new Response("unauthorized", { status: 401 }); }

  // Each query is RLS-scoped to the caller, so this only ever returns their data.
  const [profile, classes, guardians, links, reports, assessments, subscription] = await Promise.all([
    rest(`profiles?id=eq.${uid}&select=*`, token),
    rest(`classes?select=id,name,year_group,discipline,academic_year`, token),
    rest(`guardians?select=email,full_name,created_at`, token),
    rest(`guardian_student?select=student_name,consent_status,created_at`, token),
    rest(`parent_reports?select=student_name,class_label,week_start,emailed,created_at`, token),
    rest(`assessments?select=title,students,created_at`, token),
    rest(`subscriptions?select=plan_slug,status,current_period_end`, token),
  ]);

  const bundle = {
    exported_at: new Date().toISOString(),
    user_id: uid,
    note: "Your owner-scoped data held by Houchell Education. Pupil practice data is held under your school's controller relationship.",
    profile: profile?.[0] || null,
    classes, guardians, guardian_links: links, parent_reports: reports, assessments,
    subscription: subscription?.[0] || null,
  };

  await audit(uid, "data.export", uid, { tables: ["profile", "classes", "guardians", "parent_reports", "assessments"] });

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="houchell-data-export.json"`, "cache-control": "no-store" },
  });
}
