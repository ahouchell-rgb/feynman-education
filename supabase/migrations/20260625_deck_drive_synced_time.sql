-- On-open auto-sync for linked decks. We remember the Drive file's modifiedTime
-- (RFC-3339) as captured at the last sync. When a linked deck is opened the app
-- fetches the current modifiedTime (one cheap metadata call) and only re-imports
-- the deck when it differs — so opening an unchanged deck is free, and a deck
-- whose Google source has changed upstream is refreshed automatically.
--
-- NULL = never synced with a modifiedTime recorded (e.g. a legacy linked deck);
-- the app treats that as "unknown" and will sync once to establish a baseline.
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS drive_synced_time text;

COMMENT ON COLUMN public.decks.drive_synced_time IS
  'Drive modifiedTime (RFC-3339) of the linked source at last sync. On open, the deck re-imports only when the live modifiedTime differs from this. NULL = not yet baselined.';
