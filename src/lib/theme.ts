/* ─── Theme, constants, helpers ─── */

export const C = {
  bg: "#f3eee2", surface: "#faf6ec", border: "#dcd5c0", borderStrong: "#b8b1a0",
  // `dim` darkened from #8c8678 → #615c49 to clear WCAG AA contrast (4.5:1) on
  // the cream bg for the small uppercase labels that use it (caught by axe).
  text: "#1a1714", muted: "#4d4940", dim: "#615c49", faint: "#b8b1a0",
  rule: "#d8d1bd", ruleStrong: "#a8a191",
  accent: "#1a1714", accentFg: "#f3eee2",
  grn: "#5e7c4b", grnS: "rgba(94,124,75,0.10)",
  red: "#b95a3c", redS: "rgba(185,90,60,0.10)",
  amb: "#a06520", ambS: "rgba(160,101,32,0.10)",
  blu: "#2e3a5f", bluS: "rgba(46,58,95,0.10)",
  mono: "'IBM Plex Mono', monospace",
  sans: "'IBM Plex Sans', -apple-system, sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
};

export const DISC = {
  biology:   { color: "#5e7c4b", bg: "rgba(94,124,75,0.10)",   label: "Biology" },
  chemistry: { color: "#b95a3c", bg: "rgba(185,90,60,0.10)",   label: "Chemistry" },
  physics:   { color: "#2e3a5f", bg: "rgba(46,58,95,0.10)",    label: "Physics" },
  combined:  { color: "#6b4f7a", bg: "rgba(107,79,122,0.10)",  label: "Combined" },
};

// Subject palette (multi-subject). Keyed by subject slug; science keeps using
// the per-discipline DISC map above.
export const SUBJECTS = {
  maths:      { color: "#2e3a5f", label: "Mathematics" },
  english:    { color: "#b95a3c", label: "English" },
  humanities: { color: "#6b4f7a", label: "Humanities" },
  mfl:        { color: "#a06520", label: "Languages" },
  computing:  { color: "#3a6b6b", label: "Computing" },
};

// Resolve a unit's accent + label. Prefers an embedded subject:subjects(name,slug);
// falls back to the legacy science discipline, then "combined" — so existing
// science content is unchanged.
export function unitAccent(u) {
  const slug = u?.subject?.slug;
  if (slug && slug !== "science" && SUBJECTS[slug]) {
    const s = SUBJECTS[slug];
    return { color: s.color, label: u?.subject?.name || s.label, bg: s.color + "1a" };
  }
  return DISC[u?.discipline] || DISC.combined;
}

export const TERM_ORDER = { autumn: 0, spring: 1, summer: 2 };

export const DAYS = [
  { num: 1, short: "Mon", full: "Monday" },
  { num: 2, short: "Tue", full: "Tuesday" },
  { num: 3, short: "Wed", full: "Wednesday" },
  { num: 4, short: "Thu", full: "Thursday" },
  { num: 5, short: "Fri", full: "Friday" },
];
export const PERIODS = [1, 2, 3, 4, 5];

export const isoDate = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
