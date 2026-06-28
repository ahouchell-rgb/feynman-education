"use client";
import { useRef } from "react";
import { C } from "../lib/theme";
import { TA } from "./ui";

/* ─── MATHS ANSWER INPUT ───
 * A textarea tuned for maths answers, shown only when the subject's
 * marker_profile is "maths". Three things the plain textarea can't do:
 *   1. ENTER makes a new line (NOT submit) so pupils can lay out lines of
 *      working; the parent's Submit button is the only way to send. (The
 *      non-maths retrieval box keeps Enter-to-submit for fast recall drills.)
 *   2. A symbol row + ⌘. / Ctrl. insert tokens the marker already understands
 *      in plain text ("^" for a power, "√", "π", "×", "÷", "≤" …). Storage stays
 *      plain text, so the marking pipeline is unchanged.
 *   3. A live preview renders "x^2" as x² etc. so the pupil can see what they
 *      typed. Preview is built as React nodes (never innerHTML) — no XSS path.
 */

// The symbol palette. `ins` is inserted at the cursor; `caret` (optional) is
// where the caret lands relative to the start of the inserted text.
const KEYS = [
  { label: "x²", ins: "^", title: "Power — or press ⌘ ." },
  { label: "√", ins: "√", title: "Square root" },
  { label: "a/b", ins: "/", title: "Fraction / divide" },
  { label: "( )", ins: "()", caret: 1, title: "Brackets" },
  { label: "π", ins: "π", title: "Pi" },
  { label: "×", ins: "×", title: "Multiply" },
  { label: "÷", ins: "÷", title: "Divide" },
  { label: "±", ins: "±", title: "Plus or minus" },
  { label: "°", ins: "°", title: "Degrees" },
  { label: "≤", ins: "≤", title: "Less than or equal" },
  { label: "≥", ins: "≥", title: "Greater than or equal" },
  { label: "≠", ins: "≠", title: "Not equal" },
];

// Does the text contain anything the preview would render differently? If not,
// we hide the preview (e.g. a bare "42" needs no preview).
const NEEDS_PREVIEW = /\^|√|\bsqrt\b|\bpi\b|<=|>=|!=|\*/i;

// Render ONE line of answer text to React nodes: symbol substitutions + ^power
// superscripts. Pure, allocation-only, no HTML injection.
function renderLine(line, keyBase) {
  const s = line
    .replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠")
    .replace(/\bsqrt\b/gi, "√").replace(/\bpi\b/g, "π").replace(/\*/g, "×");
  const nodes = [];
  // ^ followed by {grouped} or a run of exponent chars
  const re = /\^(\{[^}]*\}|[0-9a-zA-Z.+\-]+)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    let exp = m[1];
    if (exp.startsWith("{")) exp = exp.slice(1, -1);
    nodes.push(<sup key={`${keyBase}-s${i++}`} style={{ fontSize: "0.72em" }}>{exp}</sup>);
    last = m.index + m[0].length;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}

function renderMath(text) {
  const lines = text.split("\n");
  const out = [];
  lines.forEach((ln, li) => {
    if (li > 0) out.push(<br key={`br-${li}`} />);
    renderLine(ln, `l${li}`).forEach(n => out.push(n));
  });
  return out;
}

export function MathInput({ value, onChange, rows = 4, placeholder, disabled, style }) {
  const ref = useRef(null);

  const insert = (snippet, caret) => {
    const el = ref.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    const pos = start + (caret != null ? caret : snippet.length);
    requestAnimationFrame(() => {
      if (el) { try { el.focus(); el.setSelectionRange(pos, pos); } catch { /* no-op */ } }
    });
  };

  const onKeyDown = (e) => {
    // ⌘. / Ctrl. = start a power (mirrors the superscript shortcut in Docs/Word).
    if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); insert("^"); }
    // Enter deliberately does nothing special here → it inserts a new line.
  };

  const showPreview = value.trim() !== "" && NEEDS_PREVIEW.test(value);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {KEYS.map(k => (
          <button
            key={k.label}
            type="button"
            title={k.title}
            disabled={disabled}
            onMouseDown={e => e.preventDefault() /* keep textarea focus + caret */}
            onClick={() => insert(k.ins, k.caret)}
            style={{
              minWidth: 34, height: 32, padding: "0 8px", borderRadius: 6,
              border: `1px solid ${C.bdr}`, background: C.card, color: C.txt,
              fontSize: 14, fontFamily: C.serif, cursor: disabled ? "default" : "pointer",
              lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >{k.label}</button>
        ))}
      </div>
      <TA
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={rows}
        placeholder={placeholder || "Type your working — press Enter for a new line, then tap Submit"}
        disabled={disabled}
        style={{ fontFamily: C.serif, fontSize: 15, lineHeight: 1.5, ...style }}
      />
      {showPreview && (
        <div style={{ marginTop: 8, padding: "8px 12px", background: C.priSoft || `${C.bdr}33`, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 600, marginBottom: 4 }}>Preview</div>
          <div style={{ fontFamily: C.serif, fontSize: 16, color: C.txt, lineHeight: 1.5 }}>{renderMath(value)}</div>
        </div>
      )}
      <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>
        Powers: type <code style={{ fontFamily: "monospace" }}>^</code> or press ⌘ . — e.g. <code style={{ fontFamily: "monospace" }}>x^2</code> shows as x².
      </div>
    </div>
  );
}
