/* ─── Theme, constants, helpers ─── */

// ─── Sleek dark "glassmorphism" theme ───
// Keys are unchanged from the old light theme so every `C.*` reference across
// the app re-skins from here. `surface` is now a translucent glass panel that
// sits on the dark gradient body; `bg` is the deep navy base.
export const C = {
  bg: "#07111f", bgSoft: "#0b1728",
  surface: "rgba(255,255,255,0.07)", surfaceStrong: "rgba(255,255,255,0.12)",
  border: "rgba(255,255,255,0.12)", borderStrong: "rgba(255,255,255,0.22)",
  text: "#f5f7fb", muted: "#9aa8bc", dim: "#7d8aa0", faint: "rgba(255,255,255,0.3)",
  rule: "rgba(255,255,255,0.1)", ruleStrong: "rgba(255,255,255,0.18)",
  // Primary accent = the mint/teal; accentFg is the dark ink used on top of it.
  accent: "#58e0c2", accentFg: "#06101e",
  accent2: "#7aa7ff", accent3: "#ffd166",
  accentGrad: "linear-gradient(135deg, #58e0c2, #7aa7ff)",
  grn: "#58e0c2", grnS: "rgba(88,224,194,0.13)",
  red: "#ff6b8a", redS: "rgba(255,107,138,0.13)",
  amb: "#ffd166", ambS: "rgba(255,209,102,0.13)",
  blu: "#7aa7ff", bluS: "rgba(122,167,255,0.13)",
  glow: "0 24px 70px rgba(0,0,0,0.35)",
  mono: "'IBM Plex Mono', monospace",
  sans: "'Inter', 'IBM Plex Sans', -apple-system, sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
};

// ─── Canonical design scales ───
// These are the single source of truth for spacing, corner radius and type
// sizes. The values match what's already most common across the app's inline
// styles, so they're drop-in. NEW code should pull from these instead of
// hardcoding pixel values; existing inline styles are being migrated lazily.
export const SPACING = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40,
} as const;

export const RADIUS = {
  sm: 4, md: 6, lg: 8, xl: 12, pill: 999,
} as const;

// Font-size scale (px). Alias `FONT_SIZE` is provided for readability.
export const TYPE = {
  micro: 10, tiny: 11, xs: 12, sm: 13, base: 14, md: 16, lg: 18,
  xl: 22, xxl: 24, h2: 28, h1: 44,
} as const;
export const FONT_SIZE = TYPE;

// Discipline accents, brightened for the dark theme so they read on navy.
export const DISC = {
  biology:   { color: "#54d6a8", bg: "rgba(84,214,168,0.14)",  label: "Biology" },
  chemistry: { color: "#ff9166", bg: "rgba(255,145,102,0.14)", label: "Chemistry" },
  physics:   { color: "#7aa7ff", bg: "rgba(122,167,255,0.14)", label: "Physics" },
  combined:  { color: "#c08cff", bg: "rgba(192,140,255,0.14)", label: "Combined" },
};

// Subject palette (multi-subject). Keyed by subject slug; science keeps using
// the per-discipline DISC map above.
export const SUBJECTS = {
  maths:      { color: "#7aa7ff", label: "Mathematics" },
  english:    { color: "#ff9166", label: "English" },
  humanities: { color: "#c08cff", label: "Humanities" },
  mfl:        { color: "#ffd166", label: "Languages" },
  computing:  { color: "#54d6a8", label: "Computing" },
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
