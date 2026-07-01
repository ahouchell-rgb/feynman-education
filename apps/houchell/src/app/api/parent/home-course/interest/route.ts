// Houchell Education — parent registers interest in the paid Home-course tier.
// POST /api/parent/home-course/interest   body { t }
// Validates the guardian access token, then records one row per guardian
// (idempotent — a repeat registration is treated as success). Service-role
// write; no parent account required. Replaces the old UI-only "interest
// captured" state, which persisted nothing.

import { skAdmin, json } from "@/lib/serverHelpers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "not configured" }, 500);
  let body: any; try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
  const t = String(body?.t || "");
  if (!/^[0-9a-f-]{36}$/i.test(t)) return json({ error: "invalid link" }, 400);

  try {
    // The token must belong to a guardian.
    const g = await skAdmin("GET", `guardians?access_token=eq.${t}&select=id&limit=1`);
    const guardianId = g?.[0]?.id;
    if (!guardianId) return json({ error: "not found" }, 404);

    try {
      await skAdmin("POST", "home_course_interest", { guardian_id: guardianId });
    } catch (e: any) {
      // Primary-key conflict = already registered — success, not an error.
      if (!/\b409\b/.test(String(e?.message || ""))) throw e;
    }
    return json({ ok: true });
  } catch {
    return json({ error: "could not register interest" }, 500);
  }
}
