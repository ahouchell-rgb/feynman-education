"use client";
import { useEffect, useRef } from "react";
import { C } from "./theme";

export const Btn = ({ v = "pri", style, children, ...p }) => {
  const s = {
    pri:   { background: C.accent, color: C.accentFg, border: "none" },
    ghost: { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
    soft:  { background: C.bg, color: C.text, border: `1px solid ${C.border}` },
  };
  return (
    <button {...p} style={{ padding: "8px 16px", borderRadius: 6, fontFamily: C.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.02em", cursor: "pointer", transition: "all .12s", ...s[v], ...style, ...(p.disabled ? { opacity: .4, cursor: "default" } : {}) }}>
      {children}
    </button>
  );
};

export const Inp = ({ style, ...p }) => (
  <input {...p} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 13, background: C.surface, color: C.text, outline: "none", ...style }} />
);

export const Badge = ({ children, color = C.muted, bg = C.bg }) => (
  <span style={{ fontSize: 10, fontFamily: C.mono, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 3, color, background: bg }}>{children}</span>
);

export const Card = ({ children, style, ...p }) => (
  <div {...p} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, ...style }}>{children}</div>
);

export function RichEditor({ value, onChange, readOnly, minHeight = 120, placeholder = "Add content..." }) {
  const ref = useRef(null);
  const lastValue = useRef(value);

  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.innerHTML = value || "";
      lastValue.current = value;
    }
  }, [value]);

  const exec = (cmd, val) => { document.execCommand(cmd, false, val); ref.current?.focus(); };

  const toolbar = [
    { label: "B", cmd: "bold", style: { fontWeight: 700 } },
    { label: "I", cmd: "italic", style: { fontStyle: "italic" } },
    { label: "U", cmd: "underline", style: { textDecoration: "underline" } },
    { label: "H1", cmd: "formatBlock", val: "h2" },
    { label: "H2", cmd: "formatBlock", val: "h3" },
    { label: "•", cmd: "insertUnorderedList" },
    { label: "1.", cmd: "insertOrderedList" },
  ];

  if (readOnly) return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: C.text }}
      dangerouslySetInnerHTML={{ __html: value || `<p style="color:${C.dim}">No content yet.</p>` }} />
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 2, padding: "6px 8px", borderBottom: `1px solid ${C.border}`, background: C.bg, flexWrap: "wrap" }}>
        {toolbar.map(t => (
          <button key={t.label} onMouseDown={e => { e.preventDefault(); exec(t.cmd, t.val); }}
            style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 12, fontFamily: C.mono, color: C.muted, ...t.style }}>
            {t.label}
          </button>
        ))}
        <button onMouseDown={e => { e.preventDefault(); exec("removeFormat"); }}
          style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 11, fontFamily: C.mono, color: C.dim, marginLeft: "auto" }}>
          clear
        </button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={() => { lastValue.current = ref.current.innerHTML; onChange(ref.current.innerHTML); }}
        style={{ padding: "12px 14px", minHeight, fontSize: 14, lineHeight: 1.7, color: C.text, outline: "none" }}
        data-placeholder={placeholder} />
      <style>{`[contenteditable]:empty:before { content: attr(data-placeholder); color: ${C.dim}; pointer-events: none; }`}</style>
    </div>
  );
}
