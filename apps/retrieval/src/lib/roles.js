/* ─── Roles & capabilities ───
 * Single source of truth for "who is this account and what can it do", so the
 * role string isn't re-interpreted in page.js, Teacher.js and AdminPanel.js
 * (which drifted: page.js treated a moderator as a HoD, landing them on an
 * empty department view). DB roles: student | teacher | hod | moderator.
 *
 * Every helper accepts either an authenticated user ({ profile, user_metadata })
 * or a raw profile row ({ role }), so the same checks work in the app shell and
 * in the admin list that renders other people's rows. */
import { sb } from "./supabase";
import { C } from "./theme";

export function roleOf(u) {
  return u?.profile?.role || u?.user_metadata?.role || u?.role || "student";
}

export const isStudent   = (u) => roleOf(u) === "student";
export const isHoD       = (u) => roleOf(u) === "hod";
export const isModerator = (u) => roleOf(u) === "moderator";
// Anyone who gets the teacher-side UI rather than the student view.
export const isTeacher   = (u) => ["teacher", "hod", "moderator"].includes(roleOf(u));

/* Capabilities — prefer these over raw role checks in components. */
export const canAdmin          = (u) => isModerator(u);            // Admin panel
export const canViewDepartment = (u) => isHoD(u);                 // HoD department view

const ROLE_LABEL = { moderator: "Moderator", hod: "Head of Department", teacher: "Teacher", student: "Student" };
export const roleLabel = (u) => ROLE_LABEL[roleOf(u)] || "Student";
export const roleColor = (u) => isModerator(u) ? C.pri : isHoD(u) ? C.amb : isTeacher(u) ? C.acc : C.pri;

/* Attach the profile row to a freshly-authenticated user. Falls back to JWT
 * metadata if the profile read fails (offline / RLS). Shared by the login flow
 * (Auth.js) and the session-restore path (page.js) so `user` has one shape. */
export async function attachProfile(u) {
  let profile;
  try {
    // Embed the school's plan row (schools.plan) so entitlements (see lib/plans.js)
    // are available client-side without a second round-trip. schools is world-readable.
    profile = await sb.q("profiles", { params: { id: `eq.${u.id}`, select: "*,school:schools(id,name,plan,plan_status,term_end)" }, single: true });
  } catch {
    profile = { role: u.user_metadata?.role || "student", display_name: u.user_metadata?.display_name || u.email };
  }
  return { ...u, profile };
}
