/* Offline-resilient deck cache for Present mode.

   A 20-second wifi stutter in a classroom must not white-screen a live lesson.
   On a SUCCESSFUL deck load we stash a JSON copy in localStorage keyed by deck
   id; if a later (re)load FAILS we fall back to that copy so the teacher can keep
   presenting from a slightly stale-but-complete deck. Quota is guarded: a write
   that overflows storage is dropped silently (the live lesson still works, it
   just won't have an offline copy), and on quota errors we prune older cached
   decks before giving up. */

const PREFIX = "sk_deck_cache:";
const INDEX_KEY = "sk_deck_cache_index"; // ids in least-recently-saved order
const MAX_DECKS = 12; // cap so a heavy user can't fill localStorage

interface Cached<T> { savedAt: number; deck: T; }

const readIndex = (): string[] => {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]") || []; } catch { return []; }
};
const writeIndex = (ids: string[]) => {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(ids)); } catch {}
};
const touchIndex = (id: string) => {
  const ids = readIndex().filter((x) => x !== id);
  ids.push(id);
  writeIndex(ids);
};

/* Remove the oldest cached deck (used to free space on quota errors). Returns
   true if something was actually evicted. */
const evictOldest = (keepId?: string): boolean => {
  const ids = readIndex();
  const victim = ids.find((x) => x !== keepId);
  if (!victim) return false;
  try { localStorage.removeItem(PREFIX + victim); } catch {}
  writeIndex(ids.filter((x) => x !== victim));
  return true;
};

/* Cache a deck after a successful load. Best-effort: never throws. */
export function cacheDeck(id: string, deck: unknown): void {
  if (typeof window === "undefined" || !id || deck == null) return;
  let payload: string;
  try { payload = JSON.stringify({ savedAt: Date.now(), deck }); }
  catch { return; } // unserialisable — skip rather than crash the lesson
  // Trim the index to the cap before writing the new one.
  while (readIndex().filter((x) => x !== id).length >= MAX_DECKS) {
    if (!evictOldest(id)) break;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      localStorage.setItem(PREFIX + id, payload);
      touchIndex(id);
      return;
    } catch {
      // Likely QuotaExceededError — drop the oldest deck and retry.
      if (!evictOldest(id)) return;
    }
  }
}

/* Read a cached deck (used as a fallback when a live load fails). Returns null
   if there's no usable copy. */
export function readCachedDeck<T = any>(id: string): { deck: T; savedAt: number } | null {
  if (typeof window === "undefined" || !id) return null;
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached<T>;
    if (!parsed || parsed.deck == null) return null;
    return { deck: parsed.deck, savedAt: parsed.savedAt || 0 };
  } catch { return null; }
}
