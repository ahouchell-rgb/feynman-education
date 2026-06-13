import { detectFakeAnswer, localMark } from "./marking";

// Supabase project URL + anon key. The anon key is public by design (it is
// shipped to the browser and RLS is what protects data), but reading it from
// env lets you rotate it / point at a different project without code changes.
// Falls back to the original literals so existing deployments keep working
// even if NEXT_PUBLIC_SUPA_* aren't set. See .env.example.
export const SUPA_URL = process.env.NEXT_PUBLIC_SUPA_URL || "https://uvzukwoxqhcxaxtzrziy.supabase.co";
export const SUPA_KEY = process.env.NEXT_PUBLIC_SUPA_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";

/* ─── Paginated fetch ───
 * A single PostgREST request is capped at the server's max-rows, and these
 * dashboards used a hard `limit: "10000"` / "5000" that silently undercounts
 * once a class / the platform passes that ceiling. paginate() walks the table
 * in batches (advancing offset by what's collected) until a page comes back
 * empty, so aggregates stay correct at any data volume. Pure & testable: it
 * just calls fetchPage(offset, batch) repeatedly. */
export async function paginate(fetchPage, { batch = 1000, max = 500000 } = {}) {
  const out = [];
  while (out.length < max) {
    const page = await fetchPage(out.length, batch);
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
  }
  return out;
}

/* ─── Supabase client ─── */
export const sb = (() => {
  let token = null, user = null;
  const h = (x = {}) => ({ "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${token || SUPA_KEY}`, ...x });

  const q = async (tbl, { method = "GET", body, params = {}, single } = {}) => {
    const u = new URL(`${SUPA_URL}/rest/v1/${tbl}`);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const hd = h();
    if (single) hd["Accept"] = "application/vnd.pgrst.object+json";
    if (method === "POST" || method === "PATCH") hd["Prefer"] = "return=representation";
    const r = await fetch(u, { method, headers: hd, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `${method} ${tbl} failed`); }
    if (method === "DELETE") return null;
    return r.json();
  };

  const del = async (tbl, p = {}) => {
    const u = new URL(`${SUPA_URL}/rest/v1/${tbl}`);
    Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, v));
    await fetch(u, { method: "DELETE", headers: h() });
  };

  // Fetch every matching row across pages. Drops any caller-supplied limit/offset
  // and manages them itself. Use for aggregation reads that must not be capped.
  const qAll = (tbl, { params = {}, batch, max } = {}) => {
    const { limit, offset, ...rest } = params;
    return paginate(
      (off, lim) => q(tbl, { params: { ...rest, limit: String(lim), offset: String(off) } }),
      { batch, max }
    );
  };

  const auth = {
    signUp: async (email, pw, meta = {}) => {
      const r = await fetch(`${SUPA_URL}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPA_KEY }, body: JSON.stringify({ email, password: pw, data: meta }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error?.message || d.msg || "Signup failed");
      if (d.access_token) { token = d.access_token; user = d.user; } else if (d.id) return { needsConfirm: true };
      return d;
    },
    signIn: async (email, pw) => {
      const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPA_KEY }, body: JSON.stringify({ email, password: pw }) });
      const d = await r.json();
      if (!r.ok || !d.access_token) throw new Error(d.error_description || d.error?.message || "Login failed");
      token = d.access_token; user = d.user; return d;
    },
    out: () => { token = null; user = null; },
    user: () => user,
    getToken: () => token,
  };
  return { q, del, qAll, auth };
})();

export async function aiMark(qText, model, student, marks, question_id) {
  // Check for fake/spam answers first
  const fake = detectFakeAnswer(student);
  if (fake) return { correct: false, marks_awarded: 0, feedback: fake, flagged: true };

  // Try AI marking via Supabase Edge Function (proxies to Claude API)
  // Sources we accept from the function (in v10): "ai", "ai_double_check_overturned",
  // "ai_double_check_confirmed", "numerical_match", "cache", "fallback".
  // If we don't recognise a source, fall through to local marking — defensive.
  const VALID_SOURCES = new Set([
    "ai", "ai_double_check_overturned", "ai_double_check_confirmed",
    "numerical_match", "cache", "fallback"
  ]);
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/mark-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPA_KEY },
      body: JSON.stringify({ question: qText, model_answer: model, student_answer: student, marks, question_id }),
    });
    if (r.ok) {
      const d = await r.json();
      if (VALID_SOURCES.has(d.source)) return d;
    }
  } catch (e) {
    console.log("Edge function unavailable, using local marking:", e);
  }
  // Fallback to local fuzzy matching
  return localMark(qText, model, student, marks);
}
