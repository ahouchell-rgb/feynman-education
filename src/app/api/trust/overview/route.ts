// Feynman Education — MAT/Trust dashboard data (strategy Build 4).
// GET /api/trust/overview   Authorization: Bearer <teacher JWT>
//
// Returns every school in the caller's trust (via trust_classes(), which only
// answers trust_lead callers), each rolled up to an average mastery + weakest
// objectives, plus a trust-wide weakest-objectives leaderboard. Same mastery
// graph as Builds 2/3 — just one level higher. Aggregates client-side-friendly.
//
// Env: SK_API_KEY (retrieval RPC).

export const runtime = "nodejs";
export const maxDuration = 300;

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
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

// Run `fn` over items with bounded concurrency so a big trust doesn't fire
// hundreds of simultaneous retrieval calls.
async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);
  const secret = process.env.SK_API_KEY || undefined;

  let uid: string;
  try {
    const u = await fetch(`${SK_URL}/auth/v1/user`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return j({ error: "Invalid auth" }, 401);
    uid = (await u.json()).id;
  } catch { return j({ error: "Auth check failed" }, 401); }

  let profile: any;
  try { profile = (await rest(`profiles?id=eq.${uid}&select=trust_id,trust_role&limit=1`, token))?.[0]; }
  catch { return j({ error: "Couldn't load profile" }, 500); }

  if (!profile?.trust_id || profile.trust_role !== "trust_lead") return j({ enabled: false });

  let trustName = "Your trust";
  try { trustName = (await rest(`trusts?id=eq.${profile.trust_id}&select=name`, token))?.[0]?.name || trustName; } catch { /* default */ }

  let classes: any[] = [];
  try { classes = await rpc("trust_classes", {}, token); } catch { classes = []; }
  if (!Array.isArray(classes)) classes = [];

  // Aggregate each class's weak objectives (bounded concurrency).
  const enriched = await mapPool(classes, 8, async (c: any) => {
    const retId = (c.retrieval_class_ids || [])[0];
    let weak: any[] = [];
    if (retId) {
      const rows = await rpc("class_weak_topics", { p_class_id: retId, p_limit: 8, p_min_marked: 5 }, token, secret);
      weak = (Array.isArray(rows) ? rows : []).map((w: any) => ({ topic_id: w.topic_id, topic_name: w.topic_name, pct_correct: Math.round(Number(w.pct_correct)) }));
    }
    return { school_id: c.school_id, school_name: c.school_name, year_group: c.year_group, linked: !!retId, weak };
  });

  // Roll up per school.
  const bySchool = new Map<string, { name: string; classes: number; linked: number; sum: number; n: number; topics: Map<string, { name: string; sum: number; n: number }> }>();
  // Trust-wide objective tally.
  const trustTopics = new Map<string, { name: string; sum: number; n: number; schools: Set<string> }>();

  for (const c of enriched) {
    const s = bySchool.get(c.school_id) || { name: c.school_name, classes: 0, linked: 0, sum: 0, n: 0, topics: new Map() };
    s.classes += 1; if (c.linked) s.linked += 1;
    for (const w of c.weak) {
      s.sum += w.pct_correct; s.n += 1;
      const st = s.topics.get(w.topic_id) || { name: w.topic_name, sum: 0, n: 0 };
      st.sum += w.pct_correct; st.n += 1; s.topics.set(w.topic_id, st);
      const tt = trustTopics.get(w.topic_id) || { name: w.topic_name, sum: 0, n: 0, schools: new Set<string>() };
      tt.sum += w.pct_correct; tt.n += 1; tt.schools.add(c.school_id); trustTopics.set(w.topic_id, tt);
    }
    bySchool.set(c.school_id, s);
  }

  const schools = [...bySchool.entries()].map(([id, s]) => ({
    school_id: id, name: s.name, classes: s.classes, linked: s.linked,
    avgMastery: s.n ? Math.round(s.sum / s.n) : null,
    weakest: [...s.topics.values()].map((t) => ({ topic_name: t.name, avg: Math.round(t.sum / t.n) })).sort((a, b) => a.avg - b.avg).slice(0, 3),
  })).sort((a, b) => (a.avgMastery ?? 999) - (b.avgMastery ?? 999));

  const cohort = [...trustTopics.values()]
    .map((t) => ({ topic_name: t.name, avg: Math.round(t.sum / t.n), schools: t.schools.size }))
    .sort((a, b) => a.avg - b.avg);

  const trustAvg = (() => {
    const vals = schools.map((s) => s.avgMastery).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  })();

  return j({ enabled: true, trust: { name: trustName }, trustAvg, schools, cohort, generatedAt: new Date().toISOString() });
}
