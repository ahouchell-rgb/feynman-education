-- =====================================================================
-- Feynman Education — Content review pipeline (NOW plan · E7)
-- Applied to prod: (pending)
--
-- The chosen content model: AI-generate + teacher review. Items move
-- draft → in_review → approved/published (or rejected), with provenance
-- (human vs ai). Authors manage their own drafts (RLS); only an APPROVER
-- (admin / department lead) can approve or publish, via a SECURITY DEFINER
-- RPC — so nothing reaches the shared catalogue unreviewed.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.content_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id  uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  objective_id uuid REFERENCES public.objectives(id) ON DELETE SET NULL,
  kind        text NOT NULL DEFAULT 'note',          -- lesson | questions | sow | revision | note
  title       text NOT NULL,
  body        text,
  source      text NOT NULL DEFAULT 'human' CHECK (source IN ('human','ai')),
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','in_review','approved','published','rejected')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_status ON public.content_items(status);

DROP TRIGGER IF EXISTS content_items_set_updated_at ON public.content_items;
CREATE TRIGGER content_items_set_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
-- Authors manage their own items …
DROP POLICY IF EXISTS content_owner_all ON public.content_items;
CREATE POLICY content_owner_all ON public.content_items
  FOR ALL TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
-- … and everyone can read what's approved/published (the shared catalogue) +
-- what's in_review (so approvers can find it; the RPC enforces who can act).
DROP POLICY IF EXISTS content_catalogue_read ON public.content_items;
CREATE POLICY content_catalogue_read ON public.content_items
  FOR SELECT TO authenticated
  USING (status IN ('in_review','approved','published'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;

-- ── review_content: approver-only status transition ───────────────────────
CREATE OR REPLACE FUNCTION public.review_content(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_approver boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_decision NOT IN ('approved','published','rejected','in_review') THEN RAISE EXCEPTION 'invalid decision'; END IF;
  SELECT (role = 'admin' OR is_lead = true) INTO v_is_approver FROM public.profiles WHERE id = v_uid;
  IF NOT coalesce(v_is_approver, false) THEN RAISE EXCEPTION 'only an approver can review content'; END IF;
  UPDATE public.content_items
  SET status = p_decision, reviewer_id = v_uid, reviewed_at = now(), review_note = p_note
  WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_content(uuid, text, text) TO authenticated;

COMMENT ON TABLE public.content_items IS
  'AI-generate + teacher-review content pipeline. Authors own drafts; approvers publish via review_content().';
