// Formula helpers — map normal characters to Unicode sub/superscripts. Covers
// every digit + common signs, plus the subset of letters Unicode provides.
// Pure functions, extracted from SlideEditor so they can be unit-tested.
export const SUB = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};
export const SUP = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};
const invertMap = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const SUB_INV = invertMap(SUB);
const SUP_INV = invertMap(SUP);

// Toggle a selection between normal and sub/superscript: if every char is
// already scripted, invert back; otherwise script it. Used by ⌘,/⌘. on a selection.
export const mapScript = (seg, kind) => {
  const map = kind === "sub" ? SUB : SUP;
  const inv = kind === "sub" ? SUB_INV : SUP_INV;
  const already = [...seg].every((c) => c === " " || inv[c] !== undefined);
  return [...seg].map((c) => (c === " " ? c : already ? (inv[c] ?? c) : (map[c] ?? c))).join("");
};

// Whole-text transforms used by the PropsBar X₂ / X² buttons.
export const toSubscript = (t) => (t || "").replace(/([A-Za-z\)\]])(\d+)/g, (m, a, d) => a + d.replace(/\d/g, (c) => SUB[c]));
export const toSuperscript = (t) => (t || "").replace(/\^(-?\d+|[+\-])/g, (m, g) => g.replace(/[\d+\-]/g, (c) => SUP[c] || c));

// Live auto-format: subscript digits ONLY inside chemical-formula-shaped tokens,
// so lesson codes (P1.1, C2, B9) and ordinary numbers (Year 7) are left alone
// while CO2, H2O, H2SO4, CaCO3, Ca(OH)2 convert. A "formula" needs ≥2 element
// groups, or a lowercase element letter (Ca, Cl…) — a lone capital+digit (P1, C2)
// is too code-like to touch. Length-preserving (digit→sub digit) so the caret is
// stable; superscript stays manual (⌘. / the X² button), since live ^N breaks as
// you type the second digit.
export const looksLikeFormula = (tok) => {
  if (!/\d/.test(tok) || !/^[A-Za-z0-9()[\]]+$/.test(tok)) return false;
  const groups = tok.match(/\([A-Za-z0-9]+\)\d*|[A-Z][a-z]?\d*/g);
  if (!groups || groups.join("") !== tok) return false;
  return groups.length >= 2 || /[A-Z][a-z]/.test(tok);
};
export const autoSub = (text) => (text || "").replace(/[A-Za-z0-9()[\]]+/g, (tok) =>
  looksLikeFormula(tok) ? tok.replace(/([A-Za-z\)\]])(\d+)/g, (m, a, d) => a + d.replace(/\d/g, (c) => SUB[c] || c)) : tok);
