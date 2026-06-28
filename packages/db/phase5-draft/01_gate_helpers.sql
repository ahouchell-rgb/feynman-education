-- PHASE 5 — DRAFT, NOT APPLIED. Gate helpers for the interactive weak-topic RPCs.
-- Reuses the EXACT scope pattern proven in school_classes / school_objective_mastery /
-- trust_classes (see ../live-defs/ROLE_MODEL.md). Identity-only (no secret) — the secret
-- branch is handled at the RPC level during additive→subtractive (see docs/PHASE5_DESIGN.md).
--
-- Designed as a strict SUPERSET of today's access: keeps the class teacher AND the legacy
-- profiles.hod_id pointer, and ADDS school_role (hod/slt) + trust_role (trust_lead) scope.
-- So applying these + 02 (additive) cannot remove anyone's current access.
--
-- Review, then apply via apply_migration ONLY after sign-off.

-- Class-scoped (class_weak_topics, class_unit_gaps, class_paper_gaps, class_objective_breakdown).
create or replace function public.can_read_class_analytics(p_class_id uuid)
returns boolean language sql stable security definer
set search_path to 'public','pg_temp'
as $$
  select
       public.is_moderator()
    or exists (select 1 from public.classes c
                where c.id = p_class_id and c.teacher_id = auth.uid())                         -- class teacher
    or exists (select 1 from public.classes c join public.profiles tp on tp.id = c.teacher_id
                where c.id = p_class_id and tp.hod_id = auth.uid())                            -- legacy hod_id pointer (kept)
    or exists (select 1 from public.classes c join public.profiles me on me.id = auth.uid()
                where c.id = p_class_id and c.school_id = me.school_id
                  and me.school_role in ('hod','slt'))                                         -- school hod/slt (new)
    or exists (select 1 from public.classes c join public.schools s on s.id = c.school_id
                join public.profiles me on me.id = auth.uid()
                where c.id = p_class_id and s.trust_id = me.trust_id
                  and me.trust_role = 'trust_lead');                                           -- trust lead (new)
$$;

-- PII (class_intervention_list returns pupil names). DECISION = "Teacher + HoD/SLT + trust"
-- (chosen 2026-06-28): identical surface to analytics for now, but kept as a SEPARATE function
-- so it can be tightened later (e.g. to slt-only) without touching the analytics RPCs.
create or replace function public.can_read_class_pii(p_class_id uuid)
returns boolean language sql stable security definer
set search_path to 'public','pg_temp'
as $$
  select public.can_read_class_analytics(p_class_id);
$$;

-- Student-scoped (student_weak_topics takes p_student_id, not a class).
create or replace function public.can_read_student_analytics(p_student_id uuid)
returns boolean language sql stable security definer
set search_path to 'public','pg_temp'
as $$
  select
       public.is_moderator()
    or exists (select 1 from public.responses r join public.classes c on c.id = r.class_id
                where r.student_id = p_student_id and c.teacher_id = auth.uid())               -- a teacher of a class the pupil is in
    or exists (select 1 from public.responses r join public.classes c on c.id = r.class_id
                join public.profiles tp on tp.id = c.teacher_id
                where r.student_id = p_student_id and tp.hod_id = auth.uid())                  -- legacy hod_id pointer (kept)
    or exists (select 1 from public.profiles stu join public.profiles me on me.id = auth.uid()
                where stu.id = p_student_id and stu.school_id = me.school_id
                  and me.school_role in ('hod','slt'))                                         -- school hod/slt (new)
    or exists (select 1 from public.profiles stu join public.schools s on s.id = stu.school_id
                join public.profiles me on me.id = auth.uid()
                where stu.id = p_student_id and s.trust_id = me.trust_id
                  and me.trust_role = 'trust_lead');                                           -- trust lead (new)
$$;
