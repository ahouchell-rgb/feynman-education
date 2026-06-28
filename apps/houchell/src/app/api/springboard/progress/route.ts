// Houchell Education — home-course progress sync (password-less, per-pupil token).
//   GET  /api/springboard/progress?t=<token>           → { studentName, state, updatedAt }
//   POST /api/springboard/progress?t=<token>  {state}  → { ok:true }
//
// The static course (public/learn/springboard.html) calls these to sync a pupil's
// progress across devices. The pupil is identified ONLY by their personal link
// token (resolved to a student_id server-side with the service role) — no login.
// Merging is done client-side (GET-then-merge before POST), so a stale device can't
// clobber newer progress. Body is size-capped so the blob can't grow unbounded.
//
// Env: SUPABASE_SERVICE_ROLE_KEY.

import { json } from "@/lib/serverHelpers";
import { sbGet, sbWrite, summarise, TOKEN_RE } from "@/lib/springboard";

export const runtime = "nodejs";

const MAX_STATE_BYTES = 256 * 1024; // a full KS3 course state is a few KB; 256KB is huge headroom

async function pupilByToken(token: string) {
  const rows = await sbGet(`springboard_pupil?token=eq.${encodeURIComponent(token)}&select=student_id,student_name&limit=1`);
  return rows?.[0] || null;
}

export async function GET(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "not configured" }, 500);
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!TOKEN_RE.test(t)) return json({ error: "invalid link" }, 400);

  let pupil;
  try { pupil = await pupilByToken(t); } catch { return json({ error: "lookup failed" }, 500); }
  if (!pupil) return json({ error: "not found" }, 404);

  let prog: any[] = [];
  try { prog = await sbGet(`springboard_progress?student_id=eq.${pupil.student_id}&select=state,updated_at&limit=1`); } catch { /* none yet */ }
  return json({ studentName: pupil.student_name, state: prog?.[0]?.state ?? null, updatedAt: prog?.[0]?.updated_at ?? null });
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "not configured" }, 500);
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!TOKEN_RE.test(t)) return json({ error: "invalid link" }, 400);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const state = body?.state;
  if (!state || typeof state !== "object") return json({ error: "missing state" }, 400);
  if (JSON.stringify(state).length > MAX_STATE_BYTES) return json({ error: "state too large" }, 413);

  let pupil;
  try { pupil = await pupilByToken(t); } catch { return json({ error: "lookup failed" }, 500); }
  if (!pupil) return json({ error: "not found" }, 404);

  const s = summarise(state);
  try {
    await sbWrite(
      "POST",
      "springboard_progress?on_conflict=student_id",
      { student_id: pupil.student_id, state, xp: s.xp, crowns: s.crowns, streak: s.streak, words: s.words, updated_at: new Date().toISOString() },
      "resolution=merge-duplicates,return=minimal",
    );
  } catch { return json({ error: "save failed" }, 502); }
  return json({ ok: true });
}
