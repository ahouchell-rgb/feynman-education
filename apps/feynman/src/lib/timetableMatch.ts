// Feynman Education — timetable class-name matcher (pure, client-safe).
//
// The AI timetable-photo importer returns class names as Claude read them off the
// grid. They must be mapped back to the teacher's OWN class ids before anything is
// written. matchClassName tries an exact match first, then a normalised match
// (lowercase, punctuation stripped, whitespace collapsed) so "10X Chemistry",
// "10x chemistry" and "10X  Chem." resolve to the same class where unambiguous.

export interface MatchableClass {
  id: string;
  name: string;
  discipline?: string | null;
}

/** Lowercase, strip punctuation, collapse whitespace — for tolerant comparison. */
export function normalise(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Resolve a raw class name returned by the model to one of the teacher's class
 * ids. Returns the id on a confident match, else null:
 *   1. exact (trimmed) name match;
 *   2. unique normalised match.
 * If a normalised name matches more than one class it is ambiguous → null (the
 * teacher corrects it in the grid rather than us guessing).
 */
export function matchClassName(raw: string, classes: MatchableClass[]): string | null {
  const want = String(raw || "").trim();
  if (!want || !Array.isArray(classes) || classes.length === 0) return null;

  // 1. Exact trimmed match.
  const exact = classes.find((c) => String(c.name || "").trim() === want);
  if (exact) return exact.id;

  // 2. Normalised match — only if it maps to exactly one class.
  const wantNorm = normalise(want);
  if (!wantNorm) return null;
  const hits = classes.filter((c) => normalise(c.name || "") === wantNorm);
  return hits.length === 1 ? hits[0].id : null;
}
