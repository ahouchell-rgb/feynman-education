/* Sleek, modern dark theme for the consumer driving app. Same token keys as the
 * main app's palette (src/lib/theme C) so driving components can swap to it with
 * a one-line import alias and instantly render dark. */

// Mirrors the main app palette (src/lib/theme C) so the driving sub-app reads as
// the same product: deep-navy glassmorphism, teal accent, Inter + Instrument Serif.
export const Cd = {
  bg: "#07111f",
  surface: "rgba(255,255,255,0.07)",
  surfaceStrong: "rgba(255,255,255,0.12)",
  border: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(255,255,255,0.22)",
  text: "#f5f7fb",
  muted: "#9aa8bc",
  dim: "#7d8aa0",
  faint: "rgba(255,255,255,0.3)",
  rule: "rgba(255,255,255,0.1)",
  ruleStrong: "rgba(255,255,255,0.18)",
  // primary action = teal with near-black text (matches the main app)
  accent: "#58e0c2",
  accentFg: "#06101e",
  accent2: "#7aa7ff",
  accent3: "#ffd166",
  accentGrad: "linear-gradient(135deg, #58e0c2, #7aa7ff)",
  grn: "#58e0c2",
  grnS: "rgba(88,224,194,0.13)",
  red: "#ff6b8a",
  redS: "rgba(255,107,138,0.13)",
  amb: "#ffd166",
  ambS: "rgba(255,209,102,0.13)",
  blu: "#7aa7ff",
  bluS: "rgba(122,167,255,0.13)",
  glow: "0 24px 70px rgba(0,0,0,0.35)",
  mono: "'IBM Plex Mono', monospace",
  sans: "'Inter', 'IBM Plex Sans', -apple-system, sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
};
