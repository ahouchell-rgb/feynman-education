// Houchell Education — Teacher dashboard data (private, owner-scoped).
// GET /api/teacher/overview   Authorization: Bearer <teacher JWT>
//
// The teacher is the most frequent user but had no insight view of their own
// cohort — the SLT/trust dashboards are role-gated and, deliberately, cross-
// teacher. This route gives ANY authenticated teacher a view of THEIR OWN
// classes only: no school_role gating, and data is strictly owner-scoped.
//
// Owner-scoping: classes are read straight from the `classes` table under the
// teacher's own JWT, so RLS (teacher_id = auth.uid()) restricts the rows. We do
// NOT touch the security-definer school_classes()/trust_classes() RPCs, which
// would expose other teachers' classes.
//
// Assessment QLA: the only per-objective assessment RPC (school_objective_mastery)
// is SLT/HOD-gated and cross-teacher, so it's unsafe + unavailable for a plain
// teacher. There is no teacher-scoped equivalent yet, so this view is RETRIEVAL-
// ONLY — blendObjectiveMastery(rollup, []) — and the payload flags that with
// assessmentIncluded:false so the UI can say so. (Mirrors school/overview's
// retrieval aggregation: class_weak_topics via the x-sciencekit-key secret.)
//
// Env: SK_API_KEY (retrieval RPC). No service-role key required.

export const runtime = "nodejs";
export const maxDuration = 60;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
import { rollupRetrieval, blendObjectiveMastery, crosswalkMap } from "@/lib/mastery";

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function rest(path: string, bearer: string) {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${bearer}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
async function rpc(fn: string, body: any, bearer: string, secret?: string) {
  const r = await fetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SK_ANON, Authorization: `Bearer ${bearer}`, ...(secret ? { "x-sciencekit-key": secret } : {}) },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : [];
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);
  const secret = process.env.SK_API_KEY || undefined;

  // Resolve the caller. ANY authenticated teacher is allowed (no role gating).
  let uid: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid auth" }, 401);
    uid = (await u.json()).id;
  } catch { return j({ error: "Auth check failed" }, 401); }

  // The teacher's OWN classes — read under their JWT so RLS (teacher_id =
  // auth.uid()) owner-scopes the rows. No cross-teacher security-definer RPC.
  let classes: any[] = [];
  try {
    classes = await rest(`classes?teacher_id=eq.${uid}&archived=eq.false&select=id,name,year_group,discipline,tier,retrieval_class_ids&order=year_group.asc,name.asc`, token);
  } catch { return j({ error: "Couldn't load your classes" }, 500); }
  if (!Array.isArray(classes)) classes = [];

  // Topic → objective crosswalk lets the blend collapse topics onto objectives.
  let xwalk = new Map<string, string>();
  try { xwalk = crosswalkMap(await rest(`topic_objective_map?select=topic_id,objective_id`, token)); } catch { /* no crosswalk yet */ }

  // Per-class retrieval weak topics. Unlinked classes (no retrieval ids) are
  // still listed, flagged linked:false with no weak topics. The retrieval RPC
  // is the same one school/overview uses, called with the shared secret.
  const enriched = await Promise.all(classes.map(async (c: any) => {
    const retId = (c.retrieval_class_ids || [])[0];
    let weak: any[] = [];
    if (retId) {
      const rows = await rpc("class_weak_topics", { p_class_id: retId, p_limit: 8, p_min_marked: 5 }, token, secret);
      weak = (Array.isArray(rows) ? rows : []).map((w: any) => ({
        topic_id: w.topic_id, topic_name: w.topic_name, objective_id: xwalk.get(w.topic_id) || null,
        pct_correct: Math.round(Number(w.pct_correct)), marked: w.marked ?? null, students: w.students ?? null,
      }));
    }
    const avg = weak.length ? Math.round(weak.reduce((s, w) => s + w.pct_correct, 0) / weak.length) : null;
    return {
      class_id: c.id, name: c.name, year_group: c.year_group,
      discipline: c.discipline, tier: c.tier,
      linked: !!retId, avg, weak,
    };
  }));

  // Retrieval-only blend: assessment QLA isn't teacher-scopable yet (see header).
  const objectiveMastery = blendObjectiveMastery(rollupRetrieval(enriched.map((c) => c.weak)), []);

  const years = [...new Set(enriched.map((c) => c.year_group).filter(Boolean))].sort((a, b) => a - b);
  return j({
    enabled: true,
    years,
    classes: enriched,
    objectiveMastery,
    assessmentIncluded: false,
    meta: { source: "live", scope: "owner" },
    generatedAt: new Date().toISOString(),
  });
}
