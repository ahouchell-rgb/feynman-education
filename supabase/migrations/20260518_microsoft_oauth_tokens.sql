-- =====================================================================
-- ScienceKit — Microsoft 365 OAuth tokens
-- Stores per-teacher access + refresh tokens for Microsoft Graph API.
-- One row per teacher (PK = teacher_id). Refresh tokens are sensitive;
-- RLS scopes reads to the owner only, and writes only happen via the
-- server-side OAuth callback route using the service role key.
-- =====================================================================

CREATE TABLE public.microsoft_tokens (
  teacher_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  ms_user_id text,          -- the "id" from Graph /me — stable identifier
  ms_user_email text,       -- for display in Settings: "Connected as alice@school.edu"
  ms_display_name text,     -- e.g. "Adam Houchell"
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER microsoft_tokens_set_updated_at
  BEFORE UPDATE ON public.microsoft_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.microsoft_tokens ENABLE ROW LEVEL SECURITY;

-- The teacher can see their own connection status (used in Settings).
-- They cannot see the tokens themselves — service role only — but they
-- can see ms_user_email / ms_display_name to verify which account is linked.
CREATE POLICY "ms_tokens_owner_read" ON public.microsoft_tokens
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid());

-- Owner can delete to disconnect. Inserts/updates go via the service role
-- (in the OAuth callback route) — no client-side INSERT/UPDATE policy.
CREATE POLICY "ms_tokens_owner_delete" ON public.microsoft_tokens
  FOR DELETE TO authenticated
  USING (teacher_id = auth.uid());
