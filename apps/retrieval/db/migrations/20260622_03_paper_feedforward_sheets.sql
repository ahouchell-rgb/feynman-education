-- STATUS: APPLIED (2026-06-22) to project uvzukwoxqhcxaxtzrziy.
--
-- Phase 0 of the upload-docx -> feedforward feature. Stores each generated
-- feedforward sheet so it "sits in the app" against its paper: the source upload,
-- what the teacher said pupils struggled with, the structured spec we generated
-- (for audit / regenerate), and the path to the produced .docx in paper-uploads.
--
-- Writes are done by the paper-feedforward route under the SERVICE ROLE (bypasses
-- RLS), after it has verified paper ownership. Client reads are gated by identity,
-- mirroring class_paper_gaps (20260618_09): owner OR the paper-teacher's HoD OR a
-- moderator. No anon access.
create table if not exists public.paper_feedforward_sheets (
  id                 uuid primary key default gen_random_uuid(),
  paper_id           uuid not null references public.papers(id) on delete cascade,
  teacher_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  class_id           uuid references public.classes(id) on delete set null,
  source_upload_path text,                 -- path in paper-uploads to the uploaded exam .docx (nullable: free-text-only sheets)
  struggled_input    jsonb,                -- what the teacher tagged: { notes?, question_ids?, freeText? }
  spec               jsonb,                -- the structured feedforward spec the .docx was built from (regenerate / audit)
  docx_path          text not null,        -- path in paper-uploads to the generated .docx
  title              text,
  created_at         timestamptz not null default now()
);

create index if not exists paper_feedforward_sheets_paper_idx
  on public.paper_feedforward_sheets (paper_id, created_at desc);
create index if not exists paper_feedforward_sheets_teacher_idx
  on public.paper_feedforward_sheets (teacher_id, created_at desc);

alter table public.paper_feedforward_sheets enable row level security;
revoke all on public.paper_feedforward_sheets from anon;

-- Read: owner, the paper-teacher's HoD, or a moderator.
drop policy if exists ff_sheets_select on public.paper_feedforward_sheets;
create policy ff_sheets_select on public.paper_feedforward_sheets for select to authenticated
  using (
    teacher_id = auth.uid()
    or public.is_moderator()
    or exists (select 1 from public.profiles tp
               where tp.id = paper_feedforward_sheets.teacher_id and tp.hod_id = auth.uid())
  );

-- Delete: owner or moderator. (Inserts/updates go through the service-role route only —
-- no client write policy on purpose, so clients can never forge or rewrite a sheet row.)
drop policy if exists ff_sheets_delete on public.paper_feedforward_sheets;
create policy ff_sheets_delete on public.paper_feedforward_sheets for delete to authenticated
  using (teacher_id = auth.uid() or public.is_moderator());

comment on table public.paper_feedforward_sheets is
  'Generated exam feedforward sheets, one row per produced .docx, tied to a paper. Service-role write (post ownership check); identity-gated read (owner/HoD/moderator). See FEEDFORWARD-FEATURE-SPEC.md + 20260622_03.';
