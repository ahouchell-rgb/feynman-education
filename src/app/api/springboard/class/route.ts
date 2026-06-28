// Feynman Education — a teacher's home-course progress for their classes.
//   GET /api/springboard/class  → { classes:[{id,name}], pupils:[{studentId,name,classId,xp,crowns,streak,words,updatedAt}] }
//
// Lists every pupil the teacher has minted a course link for (scoped to classes
// they own) plus that pupil's summary progress. Service-role reads, but every row
// is constrained to the verified teacher's own class ids.
//
// Auth: teacher JWT. Env: SUPABASE_SERVICE_ROLE_KEY.

import { bearerToken, requireUserId, json } from "@/lib/serverHelpers";
import { sbGet } from "@/lib/springboard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "not configured" }, 500);
  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in." }, 401);
  const uid = await requireUserId(token);
  if (!uid) return json({ error: "Invalid or expired session." }, 401);

  let classes: any[] = [];
  try { classes = await sbGet(`classes?teacher_id=eq.${uid}&select=id,name&order=name`); } catch { return json({ error: "lookup failed" }, 500); }
  if (!classes.length) return json({ classes: [], pupils: [] });

  const classIds = classes.map((c) => c.id);
  let pupils: any[] = [];
  try {
    pupils = await sbGet(`springboard_pupil?class_id=in.(${classIds.join(",")})&select=student_id,student_name,class_id,token,created_at&order=created_at.desc`);
  } catch { /* none */ }

  let prog: any[] = [];
  if (pupils.length) {
    const sids = pupils.map((p) => p.student_id);
    try { prog = await sbGet(`springboard_progress?student_id=in.(${sids.join(",")})&select=student_id,xp,crowns,streak,words,updated_at`); } catch { /* none */ }
  }
  const pmap = new Map(prog.map((p) => [p.student_id, p]));
  const out = pupils.map((p) => {
    const pr: any = pmap.get(p.student_id) || {};
    return {
      studentId: p.student_id, name: p.student_name, classId: p.class_id, token: p.token,
      xp: pr.xp ?? 0, crowns: pr.crowns ?? 0, streak: pr.streak ?? 0, words: pr.words ?? 0, updatedAt: pr.updated_at ?? null,
    };
  });
  return json({ classes, pupils: out });
}
