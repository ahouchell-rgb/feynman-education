-- STATUS: APPLIED (2026-06-18) to project uvzukwoxqhcxaxtzrziy.
--
-- Storage bucket for the "feedforward from an uploaded paper" feature (feynman):
-- a teacher uploads a photo / PDF of a past paper, the multimodal model reads it,
-- and builds a feedforward worksheet from the questions they say the class struggled
-- on. Public bucket (so the model can fetch the file by URL); staff-only writes,
-- mirroring the question-images policies. Accepts images + PDF, up to 20 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paper-uploads', 'paper-uploads', true, 20971520,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "paper_uploads_write_staff" on storage.objects;
create policy "paper_uploads_write_staff" on storage.objects for insert to public
  with check (bucket_id = 'paper-uploads' and exists (
    select 1 from public.profiles where id = auth.uid()
      and role = any (array['teacher','moderator','hod'])));

drop policy if exists "paper_uploads_modify_staff" on storage.objects;
create policy "paper_uploads_modify_staff" on storage.objects for update to public
  using (bucket_id = 'paper-uploads' and exists (
    select 1 from public.profiles where id = auth.uid()
      and role = any (array['teacher','moderator','hod'])));

drop policy if exists "paper_uploads_delete_staff" on storage.objects;
create policy "paper_uploads_delete_staff" on storage.objects for delete to public
  using (bucket_id = 'paper-uploads' and exists (
    select 1 from public.profiles where id = auth.uid()
      and role = any (array['teacher','moderator','hod'])));
