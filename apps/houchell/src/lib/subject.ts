// Houchell Education — subject resolution (shared).
// Resolves a unit's subject for subject-aware AI prompts. Units now carry a
// subject_id (T6.1); embed it with SUBJECT_SELECT. Falls back to the legacy
// science discipline, then "Science", so existing science content is unchanged.

export const SUBJECT_SELECT = "subject:subjects(name,slug)";

const DISCIPLINE_NAME: Record<string, string> = { biology: "Biology", chemistry: "Chemistry", physics: "Physics" };

/** Human subject name for a unit row that embedded `subject:subjects(name,slug)`. */
export function subjectName(unit: any): string {
  return unit?.subject?.name || DISCIPLINE_NAME[unit?.discipline] || "Science";
}

/** Subject slug ("science" | "maths" | …) — used to branch subject-specific wording. */
export function subjectSlug(unit: any): string {
  if (unit?.subject?.slug) return unit.subject.slug;
  if (unit?.discipline) return "science";
  return "science";
}

export const isScience = (unit: any) => subjectSlug(unit) === "science";
