-- Deck-level "master" brand frame (header/footer/page numbers) that cascades
-- across every slide of a deck. Nullable: NULL means the deck has no brand frame.
-- Shape (jsonb): { enabled, headerLeft, headerCenter, headerRight,
--                  footerLeft, footerCenter, footerRight, color, accent, showRule }
-- Token support inside any text field: {n} slide number, {total} slide count,
-- {title} deck title, {date} today's date. Per-slide opt-out is stored on the
-- slide itself as slide.hideMaster = true.
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS master jsonb;
