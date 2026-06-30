// Houchell Education — import MIS parent contacts as guardian links (Build 3 → 1).
// POST /api/mis/import-guardians   Authorization: Bearer <teacher JWT>
// Body: { classId, limit? }
//
// Takes the staged MIS contacts for pupils in the chosen class's YEAR GROUP and
// creates guardians + guardian_student links (consent = pending) owned by the
// caller, ready to consent + send on the Parents screen. The caller's JWT means
// every write lands under their own RLS ownership.
//
// NB: year-group is a pilot heuristic — precise rostering (via MIS class
// membership) is the follow-up. Links are created with student_id = null, so the
// report falls back to class-level data until a pupil is matched to retrieval.

import { supaRest } from "@/lib/supabaseRest";
import { SK_ANON, SK_URL } from "@/lib/serverHelpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const sb = (table: string, opts: any, token: string) => supaRest(SK_URL, table, { apikey: SK_ANON, bearer: token, ...opts });

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Invalid JSON body" }, 400); }
  const classId = body?.classId;
  const misClassId = body?.misClassId ? String(body.misClassId) : null;
  const limit = Math.min(Number(body?.limit) || 200, 500);
  if (!classId) return j({ error: "classId is required" }, 400);

  // Class (under caller RLS — confirms ownership + gives year group).
  let cls: any;
  try { cls = await sb("classes", { params: { id: `eq.${classId}`, select: "id,name,year_group" }, single: true }, token); }
  catch { return j({ error: "Class not found" }, 404); }
  if (!misClassId && cls.year_group == null) return j({ error: "This class has no year group; pick a MIS class instead, or set the year group." }, 400);

  // Pupils to pull contacts for: the exact MIS class roster if given, else the
  // year-group heuristic.
  let students: any[] = [], contacts: any[] = [];
  try {
    if (misClassId) {
      const mem = await sb("mis_class_students", { params: { class_mis_id: `eq.${misClassId}`, select: "student_mis_id" } }, token);
      const ids = mem.map((m: any) => m.student_mis_id);
      if (!ids.length) return j({ imported: 0, skipped: 0, candidates: 0, note: "That MIS class has no pupils staged — run a sync first." });
      students = await sb("mis_students", { params: { mis_id: `in.(${ids.join(",")})`, select: "mis_id,full_name" } }, token);
    } else {
      students = await sb("mis_students", { params: { year_group: `eq.${cls.year_group}`, select: "mis_id,full_name" } }, token);
      if (!students.length) return j({ imported: 0, skipped: 0, candidates: 0, note: "No staged MIS pupils for this year group — run a sync first." });
    }
    const ids = students.map((s) => s.mis_id);
    contacts = await sb("mis_contacts", { params: { student_mis_id: `in.(${ids.join(",")})`, email: "not.is.null", select: "student_mis_id,full_name,email,priority", order: "priority.asc" } }, token);
  } catch (e: any) { return j({ error: `Couldn't read staged MIS data: ${e.message}` }, 500); }

  const nameByStudent = new Map(students.map((s) => [s.mis_id, s.full_name]));
  const candidates = contacts.slice(0, limit);
  if (!candidates.length) return j({ imported: 0, skipped: 0, candidates: 0, note: "No contacts with an email address for this year group." });

  // Pre-load the caller's guardians + existing links to dedupe.
  const existingGuardians: any[] = await sb("guardians", { params: { select: "id,email" } }, token).catch(() => []);
  const guardianByEmail = new Map<string, string>(existingGuardians.map((g) => [String(g.email).toLowerCase(), g.id]));
  const existingLinks: any[] = await sb("guardian_student", { params: { class_id: `eq.${classId}`, select: "guardian_id,student_name" } }, token).catch(() => []);
  const linkKey = new Set(existingLinks.map((l) => `${l.guardian_id}::${(l.student_name || "").toLowerCase()}`));

  let imported = 0, skipped = 0;
  for (const c of candidates) {
    const email = String(c.email).trim().toLowerCase();
    const studentName = nameByStudent.get(c.student_mis_id) || "Pupil";
    if (!email) { skipped++; continue; }
    try {
      // guardian (reuse by email, else create)
      let gid = guardianByEmail.get(email);
      if (!gid) {
        const made = await sb("guardians", { method: "POST", body: { email, full_name: c.full_name || null } }, token);
        gid = made[0].id; guardianByEmail.set(email, gid);
      }
      const key = `${gid}::${studentName.toLowerCase()}`;
      if (linkKey.has(key)) { skipped++; continue; }
      await sb("guardian_student", { method: "POST", prefer: "return=minimal", body: { guardian_id: gid, class_id: classId, student_name: studentName } }, token);
      linkKey.add(key); imported++;
    } catch { skipped++; }
  }

  return j({ imported, skipped, candidates: candidates.length, className: cls.name });
}
