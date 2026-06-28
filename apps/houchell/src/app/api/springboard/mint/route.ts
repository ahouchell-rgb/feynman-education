// Houchell Education — mint a pupil's home-course link (teacher only).
//   POST /api/springboard/mint  { studentName, classId? }  → { studentId, token }
//
// A teacher creates a personal course link for a pupil. The teacher must own the
// class (if one is given). The returned token goes in the link the pupil opens:
//   <site>/learn?t=<token>
//
// Auth: teacher JWT (Authorization: Bearer …). Env: SUPABASE_SERVICE_ROLE_KEY.

import { bearerToken, requireUserId, json } from "@/lib/serverHelpers";
import { sbGet, sbWrite, UUID_RE } from "@/lib/springboard";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "not configured" }, 500);
  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to create a pupil link." }, 401);
  const uid = await requireUserId(token);
  if (!uid) return json({ error: "Invalid or expired session — sign in again." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const name = String(body?.studentName || "").trim().slice(0, 80);
  const classId = String(body?.classId || "").trim();
  // Optional: tie the link to the pupil's existing id (guardian_student.student_id)
  // so course progress joins to the same pupil the parent portal / retrieval know.
  const studentId = String(body?.studentId || "").trim();
  if (!name) return json({ error: "studentName required" }, 400);
  if (classId && !UUID_RE.test(classId)) return json({ error: "bad classId" }, 400);
  if (studentId && !UUID_RE.test(studentId)) return json({ error: "bad studentId" }, 400);

  // A class, if supplied, must belong to this teacher.
  if (classId) {
    let cls: any[] = [];
    try { cls = await sbGet(`classes?id=eq.${classId}&teacher_id=eq.${uid}&select=id&limit=1`); } catch { return json({ error: "lookup failed" }, 500); }
    if (!cls.length) return json({ error: "Not your class." }, 403);
  }

  // Idempotent: re-minting for the same pupil returns the existing link.
  if (studentId) {
    try {
      const ex = await sbGet(`springboard_pupil?student_id=eq.${studentId}&select=student_id,token&limit=1`);
      if (ex.length) return json({ studentId: ex[0].student_id, token: ex[0].token, existing: true });
    } catch { /* fall through to create */ }
  }

  const accessTok = randomBytes(18).toString("base64url"); // 24 URL-safe chars
  const payload: any = { token: accessTok, student_name: name, class_id: classId || null };
  if (studentId) payload.student_id = studentId;   // else the DB default uuid is used
  let row: any;
  try { row = await sbWrite("POST", "springboard_pupil", payload); } catch { return json({ error: "create failed" }, 502); }
  const created = Array.isArray(row) ? row[0] : row;
  return json({ studentId: created?.student_id ?? null, token: accessTok });
}
