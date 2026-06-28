-- =====================================================================
-- Houchell Education — Billing: free trial + annual Teacher Pro
-- Applied to prod: (pending)
--
-- Adds two config-only plan rows on top of 20260621_billing.sql:
--   • trial               — a time-limited free trial that grants the Pro AI
--                           features (subscriptions.status='trialing' is treated
--                           as active by getEntitlement), so a teacher can try
--                           the AI generators before paying. Price 0.
--   • teacher_pro_annual  — the yearly Teacher Pro price (~£80/yr), same features
--                           as teacher_pro, billed once a year.
-- Non-destructive: INSERT ... ON CONFLICT DO NOTHING, matching the existing seed
-- style; never deletes or alters the existing rows.
-- =====================================================================

INSERT INTO public.plans (slug, name, price_pence, interval, audience, features, sort_order) VALUES
  ('trial',              'Free trial',         0,    'month', 'teacher', '{"ai_generators": true, "unlimited_ai": true}', 1),
  ('teacher_pro_annual', 'Teacher Pro (year)', 8000, 'year',  'teacher', '{"ai_generators": true, "unlimited_ai": true}', 2)
ON CONFLICT (slug) DO NOTHING;
