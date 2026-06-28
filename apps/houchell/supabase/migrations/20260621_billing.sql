-- =====================================================================
-- Houchell Education — Billing & entitlements (NOW plan · E2)
-- Applied to prod: (pending)
--
-- Plans are config (not code); a subscription row per user tracks Stripe
-- state; entitlements are read from the active plan's features. Writes to
-- subscriptions happen ONLY via the Stripe webhook (service role) — no client
-- write path. Stripe itself is env-gated (STRIPE_SECRET_KEY); without it the
-- billing UI shows plans but checkout is disabled.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.plans (
  slug            text PRIMARY KEY,
  name            text NOT NULL,
  price_pence     int  NOT NULL DEFAULT 0,
  interval        text NOT NULL DEFAULT 'month',
  audience        text NOT NULL DEFAULT 'teacher',   -- teacher | school | parent
  features        jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_price_id text,
  sort_order      int  NOT NULL DEFAULT 0
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read ON public.plans;
CREATE POLICY plans_read ON public.plans FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.plans TO authenticated;

INSERT INTO public.plans (slug, name, price_pence, audience, features, sort_order) VALUES
  ('free',        'Free',         0,   'teacher', '{"ai_generators": false, "unlimited_ai": false}', 0),
  ('teacher_pro', 'Teacher Pro',  800, 'teacher', '{"ai_generators": true,  "unlimited_ai": true}',  1),
  ('school',      'School',       0,   'school',  '{"dashboards": true, "qla": true, "mis": true, "all_subjects": true}', 2),
  ('parent_home', 'Home',         600, 'parent',  '{"home_practice": true, "reports": true}', 3)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id               uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_slug              text REFERENCES public.plans(slug),
  status                 text NOT NULL DEFAULT 'inactive'
                           CHECK (status IN ('inactive','trialing','active','past_due','canceled')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  seats                  int NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_owner_read ON public.subscriptions;
CREATE POLICY subscriptions_owner_read ON public.subscriptions
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
GRANT SELECT ON public.subscriptions TO authenticated;

COMMENT ON TABLE public.plans IS 'Billing plans as config. Edit a plan''s features without a deploy.';
COMMENT ON TABLE public.subscriptions IS 'One row per user; Stripe state. Written by the billing webhook (service role) only.';
