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
// Per-page timeout so a hung MIS request can't stall the sync cron indefinitely
// (wondeAll loops up to 200 pages). Wonde can be slow under load, so this is
// generous; the AbortController cancels the in-flight fetch on expiry.
const WONDE_PAGE_TIMEOUT_MS = 20000;

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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WONDE_PAGE_TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch(u, { headers: { Authorization: `Bearer ${process.env.WONDE_TOKEN}`, Accept: "application/json" }, signal: ctrl.signal });
  } catch (e: any) {
    throw new Error(`Wonde ${path}: ${ctrl.signal.aborted ? `timeout after ${WONDE_PAGE_TIMEOUT_MS}ms` : (e?.message || "fetch failed")}`);
  } finally {
    clearTimeout(timer);
  }
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

/** Pull the school's classes with their pupil membership, normalised. */
export async function fetchClasses(misSchoolId: string): Promise<{ classes: any[]; memberships: any[] }> {
  const rows = await wondeAll(`schools/${misSchoolId}/classes`, { include: "students,subject" });
  const classes: any[] = [];
  const memberships: any[] = [];
  for (const c of rows) {
    classes.push({ mis_id: String(c.id), name: c?.name ?? null, subject: c?.subject?.data?.name ?? null, year_group: null, raw: c });
    for (const s of c?.students?.data ?? []) memberships.push({ class_mis_id: String(c.id), student_mis_id: String(s.id) });
  }
  return { classes, memberships };
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

export interface SyncResult { ok: boolean; counts: { students: number; contacts: number; classes?: number }; error?: string; }

/** Full sync for one school: pull from Wonde → upsert staging → log the run +
 *  update the connection. Safe to call from a cron or a manual trigger. */
export async function runMisSync(schoolId: string, misSchoolId: string, kind: "full" | "manual" = "full"): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  try {
    const { students, contacts } = await fetchSchool(misSchoolId);
    const { classes, memberships } = await fetchClasses(misSchoolId).catch(() => ({ classes: [], memberships: [] }));
    const tagged = (arr: any[]) => arr.map((x) => ({ ...x, school_id: schoolId, synced_at: new Date().toISOString() }));
    const ns = await upsert("mis_students", "school_id,mis_id", tagged(students));
    const nc = await upsert("mis_contacts", "school_id,mis_id,student_mis_id", tagged(contacts));
    const ncl = await upsert("mis_classes", "school_id,mis_id", tagged(classes));
    await upsert("mis_class_students", "school_id,class_mis_id,student_mis_id", tagged(memberships));

    await admin("POST", "mis_sync_runs", { school_id: schoolId, kind, status: "ok", counts: { students: ns, contacts: nc, classes: ncl }, started_at: startedAt, finished_at: new Date().toISOString() });
    await admin("PATCH", `mis_connections?school_id=eq.${schoolId}`, { status: "active", last_full_sync_at: new Date().toISOString(), last_error: null });
    return { ok: true, counts: { students: ns, contacts: nc, classes: ncl } };
  } catch (e: any) {
    const msg = e?.message || "sync failed";
    try {
      await admin("POST", "mis_sync_runs", { school_id: schoolId, kind, status: "error", error: msg, started_at: startedAt, finished_at: new Date().toISOString() });
      await admin("PATCH", `mis_connections?school_id=eq.${schoolId}`, { status: "error", last_error: msg });
    } catch { /* best-effort logging */ }
    return { ok: false, counts: { students: 0, contacts: 0 }, error: msg };
  }
}

// ── Attainment write-back (Build 3, phase 2) ───────────────────────────────

export interface WritebackItem { student_mis_id: string; value: string; }

/** Insert pending write-back rows (service role). Returns the count enqueued. */
export async function enqueueWriteback(opts: {
  schoolId: string; createdBy: string | null; aspect: string; source: string; items: WritebackItem[];
}): Promise<number> {
  const rows = opts.items
    .filter((i) => i && i.student_mis_id && String(i.value).trim() !== "")
    .map((i) => ({
      school_id: opts.schoolId, student_mis_id: String(i.student_mis_id), aspect: opts.aspect,
      value: String(i.value), source: opts.source, created_by: opts.createdBy,
    }));
  if (!rows.length) return 0;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${SK_URL}/rest/v1/mis_writeback_queue`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(`enqueue: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  }
  return rows.length;
}

/** Push one attainment value to Wonde's write-back endpoint. Provider-gated and
 *  best-effort: the exact endpoint/payload is MIS-specific and must be confirmed
 *  with Wonde for the school, so a non-2xx is returned as an error, not thrown. */
async function pushOne(misSchoolId: string, row: any): Promise<{ ok: boolean; ref?: string; error?: string }> {
  try {
    const r = await fetch(`${WONDE_BASE}/schools/${misSchoolId}/writeback/assessment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WONDE_TOKEN}`, "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ student: row.student_mis_id, aspect: row.aspect, result: row.value }),
    });
    if (!r.ok) return { ok: false, error: `Wonde ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}` };
    const d = await r.json().catch(() => ({}));
    return { ok: true, ref: d?.data?.id ? String(d.data.id) : undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message || "write failed" };
  }
}

/** Drain up to `limit` pending write-back rows for a school. */
export async function runWriteback(schoolId: string, misSchoolId: string, limit = 200): Promise<{ sent: number; failed: number }> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const pending: any[] = await admin("GET", `mis_writeback_queue?school_id=eq.${schoolId}&status=eq.pending&order=created_at.asc&limit=${limit}`).catch(() => []);
  let sent = 0, failed = 0;
  for (const row of pending || []) {
    const res = await pushOne(misSchoolId, row);
    const patch = res.ok
      ? { status: "sent", sent_at: new Date().toISOString(), external_ref: res.ref || null, attempts: (row.attempts || 0) + 1, last_error: null }
      : { status: (row.attempts || 0) + 1 >= 3 ? "error" : "pending", attempts: (row.attempts || 0) + 1, last_error: res.error };
    await fetch(`${SK_URL}/rest/v1/mis_writeback_queue?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    }).catch(() => {});
    if (res.ok) sent++; else failed++;
  }
  return { sent, failed };
}

/** Ensure a connection row exists for the school, seeded from env (pilot). */
export async function ensureConnection(schoolId: string): Promise<any> {
  const existing = await admin("GET", `mis_connections?school_id=eq.${schoolId}&limit=1`).catch(() => []);
  if (Array.isArray(existing) && existing.length) return existing[0];
  const made = await admin("POST", "mis_connections", { school_id: schoolId, provider: "wonde", mis_school_id: wondeSchoolId() });
  return Array.isArray(made) ? made[0] : made;
}
