-- =====================================================================
-- Feynman Education — Google Drive OAuth tokens
-- Per-teacher access + refresh tokens for the Google Drive API, used to
-- import Google Slides / .pptx files from Drive and save decks back.
-- Mirrors public.microsoft_tokens exactly: one row per teacher
-- (PK = teacher_id), owner-readable via RLS, written only by the
-- server-side OAuth callback/refresh routes using the service role.
-- =====================================================================

CREATE TABLE public.google_tokens (
  teacher_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  google_user_id text,        -- the OpenID "sub" — stable identifier
  google_user_email text,     -- for display in Settings: "Connected as alice@school.edu"
  google_display_name text,   -- e.g. "Adam Houchell"
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER google_tokens_set_updated_at
  BEFORE UPDATE ON public.google_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

-- The teacher can read their own row (Settings connection status, and the
-- access_token the browser Picker needs). Refresh-token rotation and writes
-- happen server-side via the service role — no client INSERT/UPDATE policy.
CREATE POLICY "google_tokens_owner_read" ON public.google_tokens
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

-- Owner can delete to disconnect.
CREATE POLICY "google_tokens_owner_delete" ON public.google_tokens
  FOR DELETE TO authenticated
  USING (teacher_id = auth.uid());

-- ---------------------------------------------------------------------
-- Link a deck back to the Drive file it was imported from / saved to, so
-- "Save to Drive" can update the same .pptx instead of creating duplicates.
-- NULL = deck has no Drive linkage (first save creates a new file).
-- We only ever own/write .pptx files; decks imported from a *native* Google
-- Slides file leave these NULL so save-back creates a fresh .pptx export.
-- ---------------------------------------------------------------------
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS drive_file_id text;
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS drive_file_name text;
