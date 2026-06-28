-- PHASE 5 — DRAFT, NOT APPLIED. Proposed gate helpers for the interactive
-- weak-topic RPCs. Reuses the EXACT scope pattern already proven in
-- school_classes / school_objective_mastery / trust_classes (see
-- ../live-defs/ROLE_MODEL.md). Identity-only (no secret) — the secret branch is
-- handled at the RPC level during the additive→subtractive rollout (see
-- docs/PHASE5_DESIGN.md). Review, then apply via apply_migration ONLY after sign-off.

-- Non-PII analytics (class_weak_topics, student_weak_topics, class_unit_gaps,
-- class_paper_gaps, class_objective_breakdown): class teacher + school hod/slt + trust_lead + moderator.
create or replace function public.can_read_class_analytics(p_class_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public','pg_temp'
as $$
  select
       public.is_moderator()
    or exists (select 1 from public.classes c
                where c.id = p_class_id and c.teacher_id = auth.uid())
    or exists (select 1 from public.classes c
                join public.profiles me on me.id = auth.uid()
               where c.id = p_class_id
                 and c.school_id = me.school_id
                 and me.school_role in ('hod','slt'))
    or exists (select 1 from public.classes c
                join public.schools s  on s.id  = c.school_id
                join public.profiles me on me.id = auth.uid()
               where c.id = p_class_id
                 and s.trust_id = me.trust_id
                 and me.trust_role = 'trust_lead');
$$;

-- PII (class_intervention_list returns pupil names): tighter.
-- DECISION (see docs/PHASE5_DESIGN.md): the runbook says "slt-only". Below is the
-- recommended middle line — slt + hod + trust_lead + moderator (HoDs legitimately run
-- interventions). For strict runbook behaviour, change `school_role in ('hod','slt')`
-- to `school_role = 'slt'` and drop the class-teacher branch.
create or replace function public.can_read_class_pii(p_class_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public','pg_temp'
as $$
  select
       public.is_moderator()
    or exists (select 1 from public.classes c
                where c.id = p_class_id and c.teacher_id = auth.uid())          -- class's own teacher
    or exists (select 1 from public.classes c
                join public.profiles me on me.id = auth.uid()
               where c.id = p_class_id
                 and c.school_id = me.school_id
                 and me.school_role in ('hod','slt'))
    or exists (select 1 from public.classes c
                join public.schools s  on s.id  = c.school_id
                join public.profiles me on me.id = auth.uid()
               where c.id = p_class_id
                 and s.trust_id = me.trust_id
                 and me.trust_role = 'trust_lead');
$$;
