-- STATUS: APPLIED (2026-06-22) to project uvzukwoxqhcxaxtzrziy.
--
-- Phase 0 of the upload-docx -> feedforward feature (retrieval-app Papers tool).
-- Widen the paper-uploads bucket to accept .docx / .doc so a teacher can upload a
-- Word exam paper (previously images + PDF only — see 20260618_10). Keeps every
-- other bucket property and all three staff-only write policies unchanged.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('paper-uploads', 'paper-uploads', true, 20971520,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/msword'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
