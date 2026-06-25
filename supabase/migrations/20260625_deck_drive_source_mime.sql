-- Linked-deck refresh: remember the MIME type of the Drive file a deck is
-- linked to, so the app can:
--   1. Re-fetch it correctly on a manual "Refresh from Drive" — a native Google
--      Slides file is exported to .pptx by Drive, an uploaded .pptx is fetched
--      as-is. fetchAsPptxBlob() branches on exactly this value.
--   2. Avoid clobbering a native Slides file on "Save to Drive". We only ever
--      overwrite .pptx targets in place; a deck linked to a native Slides file
--      is linked for *reading* (refresh), so save-back exports a fresh copy
--      instead of writing .pptx bytes over the Slides file.
--
-- Pre-existing rows have no value here. They were only ever linked when the
-- source was a .pptx (native Slides imports used to stay unlinked), so a NULL
-- mime is treated as .pptx by the app for backwards compatibility.
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS drive_file_mime text;

COMMENT ON COLUMN public.decks.drive_file_mime IS
  'MIME type of the linked Drive source (application/vnd.google-apps.presentation for native Slides, ...presentationml.presentation for .pptx). Drives how Refresh re-fetches it and whether Save to Drive may overwrite in place. NULL = legacy .pptx link.';
