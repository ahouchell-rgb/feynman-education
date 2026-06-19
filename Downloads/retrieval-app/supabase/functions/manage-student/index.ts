import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function generatePassword(): string {
  const words = ["Atom","Wave","Cell","Gene","Star","Bolt","Flux","Nova","Prism","Quark","Solar","Ionic","Lunar","Pixel","Comet","Hydro","Orbit","Pulse","Radar","Sonic"];
  const symbols = ["!","#","$","@"];
  return `${words[Math.floor(Math.random()*words.length)]}${Math.floor(Math.random()*90)+10}${symbols[Math.floor(Math.random()*symbols.length)]}`;
}

// True if the caller teaches at least one class the target student belongs to.
// This is the tenant-isolation guard for the destructive per-pupil actions
// (reset_password / delete_student): without it ANY teacher/HoD could reset or
// delete ANY pupil platform-wide — across schools, that is cross-tenant account
// takeover/deletion. Moderators (platform admins) bypass it. Uses the service
// role client, so the check is explicit here rather than relying on RLS.
async function callerTeachesStudent(supabase: any, callerId: string, studentId: string): Promise<boolean> {
  const { data: myClasses } = await supabase.from("classes").select("id").eq("teacher_id", callerId);
  const ids = (myClasses || []).map((c: { id: string }) => c.id);
  if (ids.length === 0) return false;
  const { data: mem } = await supabase.from("class_members").select("class_id").eq("student_id", studentId).in("class_id", ids).limit(1);
  return !!(mem && mem.length > 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No auth token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !caller) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", caller.id).single();
    const role = profile?.role;
    const isModerator = role === "moderator";
    const isStudent = role === "student";
    const body = await req.json();
    const { action, student_id, new_password, new_name, class_id } = body;

    // Student-only: report a mark as incorrect
    if (action === "report_flag") {
      if (!isStudent) return new Response(JSON.stringify({ error: "Only students can report marks" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { response_id, reason } = body;
      if (!response_id) return new Response(JSON.stringify({ error: "Missing response_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: resp } = await supabase.from("responses").select("id,student_id,class_id").eq("id", response_id).single();
      if (!resp || resp.student_id !== caller.id) return new Response(JSON.stringify({ error: "Response not yours" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabase.from("marking_flags").upsert({ response_id, student_id: caller.id, class_id: resp.class_id, reason: (reason || "").toString().slice(0, 500) }, { onConflict: "response_id" });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: "Thanks — your teacher will review this." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Teacher/HoD/Moderator: resolve a flag
    if (action === "resolve_flag") {
      if (role !== "teacher" && !isModerator && role !== "hod") return new Response(JSON.stringify({ error: "Not allowed" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { flag_id } = body;
      if (!flag_id) return new Response(JSON.stringify({ error: "Missing flag_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Tenant-isolation guard — mirrors the marking_flags_update RLS predicate
      // (class.teacher_id = caller OR is_moderator OR caller is the HoD of the
      // class's teacher). Without it, any teacher/HoD could resolve (suppress) ANY
      // school's flags by enumerating flag_id, since the service role bypasses RLS.
      // The Teacher/HoD panels resolve via RLS-protected PATCH and were already
      // safe; this closes the unguarded service-role edge path.
      if (!isModerator) {
        const { data: flag } = await supabase.from("marking_flags").select("class_id").eq("id", flag_id).single();
        if (!flag) return new Response(JSON.stringify({ error: "Flag not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: cls } = await supabase.from("classes").select("teacher_id").eq("id", flag.class_id).single();
        let allowed = !!cls && cls.teacher_id === caller.id;
        if (!allowed && role === "hod" && cls) {
          const { data: tp } = await supabase.from("profiles").select("hod_id").eq("id", cls.teacher_id).single();
          allowed = !!tp && tp.hod_id === caller.id;
        }
        if (!allowed) return new Response(JSON.stringify({ error: "You can only resolve flags for a class you teach or oversee" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabase.from("marking_flags").update({ resolved: true }).eq("id", flag_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: "Flag resolved" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!profile || (role !== "teacher" && role !== "hod" && !isModerator)) return new Response(JSON.stringify({ error: "Only teachers or moderators can manage students" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (class_id && !isModerator) {
      const { data: cls } = await supabase.from("classes").select("teacher_id").eq("id", class_id).single();
      if (!cls || cls.teacher_id !== caller.id) return new Response(JSON.stringify({ error: "Not your class" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Moderator-only: promote to HoD / demote to teacher
    if (action === "set_hod") {
      if (!isModerator) return new Response(JSON.stringify({ error: "Only moderators can set HoD role" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { target_id, promote } = body;
      if (!target_id) return new Response(JSON.stringify({ error: "Missing target_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const update: Record<string, unknown> = promote ? { role: "hod", updated_at: new Date().toISOString() } : { role: "teacher", hod_id: null, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("profiles").update(update).eq("id", target_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // If demoting, also clear any teachers whose hod_id points at this now-demoted HoD
      if (!promote) {
        await supabase.from("profiles").update({ hod_id: null, updated_at: new Date().toISOString() }).eq("hod_id", target_id);
      }
      return new Response(JSON.stringify({ success: true, message: promote ? "Promoted to HoD" : "Demoted to teacher" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Moderator-only: assign / unassign a teacher to a HoD's department
    if (action === "set_hod_link") {
      if (!isModerator) return new Response(JSON.stringify({ error: "Only moderators can assign teachers to HoDs" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { target_id, hod_id } = body;
      if (!target_id) return new Response(JSON.stringify({ error: "Missing target_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (hod_id) {
        const { data: hp } = await supabase.from("profiles").select("role").eq("id", hod_id).single();
        if (!hp || hp.role !== "hod") return new Response(JSON.stringify({ error: "That user is not a HoD" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabase.from("profiles").update({ hod_id: hod_id || null, updated_at: new Date().toISOString() }).eq("id", target_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: hod_id ? "Added to department" : "Removed from department" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create_teacher") {
      if (!isModerator) return new Response(JSON.stringify({ error: "Only moderators can create teacher accounts" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { new_email, new_display_name } = body;
      const email = String(new_email || "").trim().toLowerCase();
      const name = String(new_display_name || "").trim();
      const password = String(new_password || "").trim();
      if (!email || !name || !password) return new Response(JSON.stringify({ error: "Missing email, name, or temporary password" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (password.length < 6) return new Response(JSON.stringify({ error: "Temporary password must be at least 6 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new Response(JSON.stringify({ error: "Invalid email format" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name, role: "teacher" } });
      if (createErr || !created?.user) return new Response(JSON.stringify({ error: createErr?.message || "Create failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const userId = created.user.id;
      const { error: profErr } = await supabase.from("profiles").upsert({ id: userId, display_name: name, role: "teacher", email });
      if (profErr) return new Response(JSON.stringify({ error: "Account created but profile setup failed: " + profErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: `Teacher account created for ${email}`, teacher_id: userId, email, display_name: name }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "add_to_class") {
      if (!isModerator) return new Response(JSON.stringify({ error: "Only moderators can add students directly to classes" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!student_id || !class_id) return new Response(JSON.stringify({ error: "Missing student_id or class_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: sp } = await supabase.from("profiles").select("role,display_name").eq("id", student_id).single();
      if (!sp) return new Response(JSON.stringify({ error: "Student not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (sp.role !== "student") return new Response(JSON.stringify({ error: "Target user is not a student (role: " + sp.role + ")" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: cls } = await supabase.from("classes").select("id,name").eq("id", class_id).single();
      if (!cls) return new Response(JSON.stringify({ error: "Class not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabase.from("class_members").upsert({ class_id, student_id }, { onConflict: "class_id,student_id" });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: `${sp.display_name} added to ${cls.name}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "bulk_create") {
      const { students } = body;
      if (!class_id || !Array.isArray(students) || students.length === 0) return new Response(JSON.stringify({ error: "Missing class_id or students array" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (students.length > 60) return new Response(JSON.stringify({ error: "Max 60 students per upload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Stamp created pupils with the class's tenant (school) so plan/usage
      // attribution follows their real school. The profiles.school_id DEFAULT that
      // used to backfill this was removed (tier0_drop_school_default_*), so without
      // this every bulk-created pupil would land tenant-less. The class is already
      // ownership-checked above (non-moderators pass the class_id teacher guard).
      const { data: bcCls } = await supabase.from("classes").select("school_id").eq("id", class_id).single();
      const bcSchool = (bcCls?.school_id as string | null) ?? null;
      const results = [];
      for (const s of students) {
        const email = (s.email || "").trim().toLowerCase();
        const name = (s.display_name || "").trim();
        if (!email || !name) { results.push({ email, display_name: name, status: "error", error: "Missing name or email" }); continue; }
        const password = generatePassword();
        try {
          const { data: created, error: createErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name, role: "student" } });
          if (createErr || !created?.user) { results.push({ email, display_name: name, status: "error", error: createErr?.message || "Create failed" }); continue; }
          const userId = created.user.id;
          await supabase.from("profiles").upsert({ id: userId, display_name: name, role: "student", email, school_id: bcSchool });
          const { error: memberErr } = await supabase.from("class_members").upsert({ class_id, student_id: userId }, { onConflict: "class_id,student_id" });
          if (memberErr) results.push({ email, display_name: name, status: "error", error: "Created but failed to add to class: " + memberErr.message, password });
          else results.push({ email, display_name: name, status: "created", password });
        } catch (e) { results.push({ email, display_name: name, status: "error", error: String(e) }); }
      }
      const created = results.filter(r => r.status === "created").length;
      const failed = results.filter(r => r.status === "error").length;
      return new Response(JSON.stringify({ success: true, message: `${created} created, ${failed} failed`, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "rename_student") {
      if (!student_id || !new_name) return new Response(JSON.stringify({ error: "Missing student_id or new_name" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const trimmed = String(new_name).trim();
      if (trimmed.length === 0 || trimmed.length > 80) return new Response(JSON.stringify({ error: "Name must be 1-80 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!isModerator) {
        if (!class_id) return new Response(JSON.stringify({ error: "Missing class_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: mem } = await supabase.from("class_members").select("student_id").eq("class_id", class_id).eq("student_id", student_id).single();
        if (!mem) return new Response(JSON.stringify({ error: "Student not in your class" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabase.from("profiles").update({ display_name: trimmed, updated_at: new Date().toISOString() }).eq("id", student_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: "Name updated", display_name: trimmed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reset_password") {
      if (!student_id || !new_password) return new Response(JSON.stringify({ error: "Missing student_id or new_password" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Tenant-isolation guard: a non-moderator may only reset a pupil they teach.
      if (!isModerator && !(await callerTeachesStudent(supabase, caller.id, student_id))) return new Response(JSON.stringify({ error: "You can only reset the password of a pupil you teach" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabase.auth.admin.updateUser(student_id, { password: new_password });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: "Password updated" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_student") {
      if (!student_id) return new Response(JSON.stringify({ error: "Missing student_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Tenant-isolation guard: a non-moderator may only delete a pupil they teach.
      if (!isModerator && !(await callerTeachesStudent(supabase, caller.id, student_id))) return new Response(JSON.stringify({ error: "You can only delete a pupil you teach" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabase.auth.admin.deleteUser(student_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: "Student deleted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "remove_from_class") {
      if (!student_id || !class_id) return new Response(JSON.stringify({ error: "Missing student_id or class_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabase.from("class_members").delete().eq("student_id", student_id).eq("class_id", class_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, message: "Removed from class" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
