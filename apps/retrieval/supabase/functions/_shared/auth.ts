// Shared auth / tenancy helpers for the edge functions (D12). These were
// copy-pasted across the markers and had begun to DRIFT — see resolveSchoolId
// below for the reconciliation note. Consolidated here as the single source of
// truth. Each function passes in its own service-role Supabase client (the client
// is constructed per-function from that function's own env), so these helpers stay
// pure of any module-level singleton.

// The service-role Supabase client is passed in by each function (it is built
// per-function from that function's own env). Typed `any` to match how the repo
// already types its Supabase clients in the edge functions.

// Identify the calling pupil from their Supabase JWT. Returns null when there is
// no user token (e.g. older clients that send only the anon apikey), in which case
// the caller stays a pure endpoint and records nothing. This was byte-for-byte the
// same logic in mark-answer and mark-paper-answer (only cosmetic formatting
// differed) — behaviour is identical to both.
// deno-lint-ignore no-explicit-any
export async function getAuthedUid(sb: any | null, req: Request): Promise<string | null> {
  if (!sb) return null;
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { data, error } = await sb.auth.getUser(m[1]);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Resolve the school that owns a class, so every usage row can be attributed to a
// school (exact per-school cost + fair-use metering). The caller supplies a
// module-scope cache Map (a class never changes school within a warm instance, so
// this is one DB lookup per class, not per request — keeping the deterministic fast
// paths fast).
//
// DRIFT RECONCILED (D12): mark-answer typed the parameter `string | undefined`
// while mark-paper-answer typed it `string | undefined | null`. The bodies were
// identical and the `!class_id` guard already handles all three at runtime, so
// there was no behavioural difference — only the accepted TypeScript type drifted.
// A class_id read from a DB row (paper attempts) genuinely can be null, so the
// paper version's wider `string | undefined | null` signature is the correct,
// most-complete one and is adopted here. (mark-answer's value, sourced from
// req.json(), is a strict subset, so nothing it passes is rejected.)
// deno-lint-ignore no-explicit-any
export async function resolveSchoolId(
  sb: any | null,
  cache: Map<string, string | null>,
  class_id: string | undefined | null,
): Promise<string | null> {
  if (!sb || !class_id) return null;
  if (cache.has(class_id)) return cache.get(class_id) ?? null;
  try {
    const { data } = await sb.from("classes").select("school_id").eq("id", class_id).single();
    const sid = (data?.school_id as string) ?? null;
    cache.set(class_id, sid);
    return sid;
  } catch {
    return null;
  }
}
