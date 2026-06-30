// Houchell Education — audit logging (server-only, best-effort).
// Writes a privileged-action record with the service role. Never throws — an
// audit hiccup must not fail the user's action.

import { SK_URL } from "@/lib/serverHelpers";

export async function audit(actorId: string | null, action: string, target?: string | null, detail?: Record<string, any>): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  try {
    await fetch(`${SK_URL}/rest/v1/audit_log`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ actor_id: actorId, action, target: target ?? null, detail: detail ?? {} }),
    });
  } catch { /* best-effort */ }
}
