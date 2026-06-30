// Houchell Education — parent unsubscribe (revoke consent for one child link).
// POST /api/parent/unsubscribe   body { t: <guardian_student.unsubscribe_token> }
//
// Sets consent_status = 'revoked' so the weekly cron stops sending. Idempotent.
// POST-only (and behind a confirm screen) so email link-prefetchers can't
// auto-unsubscribe by following a GET. Service-role write, token-scoped.

import { SK_URL } from "@/lib/serverHelpers";

export const runtime = "nodejs";

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return j({ error: "not configured" }, 500);
  let token = "";
  try { token = (await req.json())?.t || ""; } catch { /* fallthrough */ }
  if (!/^[0-9a-f-]{36}$/i.test(token)) return j({ error: "invalid link" }, 400);

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${SK_URL}/rest/v1/guardian_student?unsubscribe_token=eq.${token}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ consent_status: "revoked", consent_at: null }),
  });
  if (!r.ok) return j({ error: "couldn't unsubscribe" }, 500);
  const rows = await r.json().catch(() => []);
  if (!rows?.length) return j({ error: "not found" }, 404);
  return j({ ok: true, studentName: rows[0].student_name });
}
