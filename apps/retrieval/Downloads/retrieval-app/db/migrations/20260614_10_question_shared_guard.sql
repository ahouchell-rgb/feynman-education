-- STATUS: APPLIED to project uvzukwoxqhcxaxtzrziy on 2026-06-14.
--
-- Lock down "publish to the shared/central question bank". Previously any teacher
-- with row access could PATCH `questions.shared = true` (or INSERT a shared row)
-- and push their own question into the cross-school shared bank surfaced by
-- can_view_question()'s `shared` branch. A BEFORE INSERT/UPDATE trigger now lets
-- only a moderator or HoD set `shared = true`; for anyone else the flag is forced
-- false. Edits to an already-shared question still work (we keep OLD.shared on
-- update), so this doesn't break content edits — it only blocks *turning sharing
-- on*. is_moderator()/is_hod() read the caller's JWT (auth.uid()), so this is
-- correct even though the trigger function is SECURITY DEFINER.

create or replace function public.enforce_question_shared_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(NEW.shared, false) and not (public.is_moderator() or public.is_hod()) then
    if TG_OP = 'UPDATE' and coalesce(OLD.shared, false) then
      NEW.shared := true;   -- already shared; allow the edit, keep it shared
    else
      NEW.shared := false;  -- a non-privileged user may not publish to the shared bank
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_question_shared_guard on public.questions;
create trigger trg_question_shared_guard
  before insert or update on public.questions
  for each row execute function public.enforce_question_shared_guard();
