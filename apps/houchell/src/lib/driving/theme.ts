/* Sleek, modern dark theme for the consumer driving app. Same token keys as the
 * main app's palette (src/lib/theme C) so driving components can swap to it with
 * a one-line import alias and instantly render dark. */

export const Cd = {
  bg: "#0c0f16", // app background (near-black navy)
  surface: "#161c27", // elevated cards
  border: "#27303f",
  borderStrong: "#3a4658",
  text: "#eef2f8",
  muted: "#a7b2c2",
  dim: "#6f7c8c",
  faint: "#3f4a5a",
  rule: "#1f2735",
  ruleStrong: "#33404f",
  // primary action = vibrant mint-green with near-black text (sits on dark UI)
  accent: "#36e08a",
  accentFg: "#06140c",
  grn: "#36e08a",
  grnS: "rgba(54,224,138,0.14)",
  red: "#ff6b6b",
  redS: "rgba(255,107,107,0.14)",
  amb: "#ffc24b",
  ambS: "rgba(255,194,75,0.14)",
  blu: "#5b9dff",
  bluS: "rgba(91,157,255,0.14)",
  mono: "'IBM Plex Mono', monospace",
  sans: "'IBM Plex Sans', -apple-system, sans-serif",
  // modern display face for headings (loaded in the root layout)
  serif: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
};
