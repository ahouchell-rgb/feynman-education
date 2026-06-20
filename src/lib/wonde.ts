// Feynman Education — Wonde MIS sync engine (server-only, env-gated).
//
// Wonde (https://wonde.com) is a single API over the UK MIS platforms
// (SIMS / Arbor / Bromcom / …). A school approves the app and issues a token;
// you then address that school by its Wonde id.
//
//   WONDE_TOKEN      — the access token (school-approved). Required to sync.
//   WONDE_SCHOOL_ID  — the Wonde school id to pull (pilot: one school).
//
// Without those env vars wondeConfigured() is false and the routes no-op
// cleanly (mirrors src/lib/email.ts). All DB writes here use the Supabase
// service role and target STAGING tables only — never live owner-scoped data.

const WONDE_BASE = "https://api.wonde.com/v1.0";
const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";

export function wondeConfigured(): boolean {
  return !!(process.env.WONDE_TOKEN && process.env.WONDE_SCHOOL_ID);
}
export function wondeSchoolId(): string {
  return process.env.WONDE_SCHOOL_ID || "";
}

// ── Wonde HTTP (paginated) ────────────────────────────────────────────────
async function wondeGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const u = new URL(`${WONDE_BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${process.env.WONDE_TOKEN}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`Wonde ${path}: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.json();
}

/** Follow Wonde's `meta.pagination.next` cursor and collect every `data` row. */
async function wondeAll(path: string, params: Record<string, string> = {}): Promise<any[]> {
  const out: any[] = [];
  let page = 1;
  for (let i = 0; i < 200; i++) { // hard cap so a bad cursor can't loop forever
    const d = await wondeGet(path, { ...params, per_page: "200", page: String(page) });
    if (Array.isArray(d?.data)) out.push(...d.data);
    const next = d?.meta?.pagination?.next;
    if (!next) break;
    page += 1;
  }
  return out;
}

// ── Normalisation (best-effort; Wonde's exact shape varies by MIS/version, so
//    the full payload is also kept in `raw` for later reconciliation) ────────
function parseYear(student: any): number | null {
  const src = student?.year?.data?.code ?? student?.year?.data?.name ?? student?.year_group ?? "";
  const m = String(src).match(/\d{1,2}/);
  return m ? Number(m[0]) : null;
}
function pickEmail(contact: any): string | null {
  const cd = contact?.contact_details?.data ?? contact?.contact_details ?? {};
  const e = cd.emails ?? cd.email;
  if (Array.isArray(e)) return e[0]?.email || e[0]?.value || null;
  if (e && typeof e === "object") return e.email || e.primary_email || e.home || e.work || null;
  return (typeof e === "string" ? e : null) || contact?.email || null;
}
const fullName = (p: any) => [p?.forename, p?.surname].filter(Boolean).join(" ").trim() || p?.name || null;

export interface NormalisedSync { students: any[]; contacts: any[]; }

/** Pull every pupil in the school with their parent/carer contacts, normalised. */
export async function fetchSchool(misSchoolId: string): Promise<NormalisedSync> {
  const rows = await wondeAll(`schools/${misSchoolId}/students`, { include: "contacts.contact_details,year" });
  const students: any[] = [];
  const contacts: any[] = [];
  for (const s of rows) {
    students.push({ mis_id: String(s.id), full_name: fullName(s), year_group: parseYear(s), form: s?.form?.data?.name ?? null, upn: s?.upn ?? null, raw: s });
    for (const c of s?.contacts?.data ?? []) {
      contacts.push({
        mis_id: String(c.id), student_mis_id: String(s.id), full_name: fullName(c),
        email: pickEmail(c), relationship: c?.relationship ?? null,
        priority: c?.primary_contact ? 1 : 2, raw: c,
      });
    }
  }
  return { students, contacts };
}

// ── Service-role upsert into staging ───────────────────────────────────────
async function upsert(table: string, onConflict: string, rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const r = await fetch(`${SK_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
    n += chunk.length;
  }
  return n;
}
async function admin(method: string, path: string, body?: any) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.status === 204 ? null : r.json();
}

export interface SyncResult { ok: boolean; counts: { students: number; contacts: number }; error?: string; }

/** Full sync for one school: pull from Wonde → upsert staging → log the run +
 *  update the connection. Safe to call from a cron or a manual trigger. */
export async function runMisSync(schoolId: string, misSchoolId: string, kind: "full" | "manual" = "full"): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  try {
    const { students, contacts } = await fetchSchool(misSchoolId);
    const tagged = (arr: any[]) => arr.map((x) => ({ ...x, school_id: schoolId, synced_at: new Date().toISOString() }));
    const ns = await upsert("mis_students", "school_id,mis_id", tagged(students));
    const nc = await upsert("mis_contacts", "school_id,mis_id,student_mis_id", tagged(contacts));

    await admin("POST", "mis_sync_runs", { school_id: schoolId, kind, status: "ok", counts: { students: ns, contacts: nc }, started_at: startedAt, finished_at: new Date().toISOString() });
    await admin("PATCH", `mis_connections?school_id=eq.${schoolId}`, { status: "active", last_full_sync_at: new Date().toISOString(), last_error: null });
    return { ok: true, counts: { students: ns, contacts: nc } };
  } catch (e: any) {
    const msg = e?.message || "sync failed";
    try {
      await admin("POST", "mis_sync_runs", { school_id: schoolId, kind, status: "error", error: msg, started_at: startedAt, finished_at: new Date().toISOString() });
      await admin("PATCH", `mis_connections?school_id=eq.${schoolId}`, { status: "error", last_error: msg });
    } catch { /* best-effort logging */ }
    return { ok: false, counts: { students: 0, contacts: 0 }, error: msg };
  }
}

/** Ensure a connection row exists for the school, seeded from env (pilot). */
export async function ensureConnection(schoolId: string): Promise<any> {
  const existing = await admin("GET", `mis_connections?school_id=eq.${schoolId}&limit=1`).catch(() => []);
  if (Array.isArray(existing) && existing.length) return existing[0];
  const made = await admin("POST", "mis_connections", { school_id: schoolId, provider: "wonde", mis_school_id: wondeSchoolId() });
  return Array.isArray(made) ? made[0] : made;
}
