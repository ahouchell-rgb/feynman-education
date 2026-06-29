"use client";
import { forwardRef, useEffect, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { C } from "./theme";
import { sanitizeHtml } from "./sanitize";

/* Static style objects are hoisted to module scope so they aren't re-allocated
 * on every render (and so the variants are defined once, not per <Btn>). */
const BTN_BASE: CSSProperties = {
  padding: "9px 18px",
  borderRadius: 999,
  fontFamily: C.mono,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.02em",
  cursor: "pointer",
  transition: "all .16s ease",
};

type BtnVariant = "pri" | "ghost" | "soft";
const BTN_VARIANTS: Record<BtnVariant, CSSProperties> = {
  pri: { background: C.accentGrad, color: C.accentFg, border: "none", boxShadow: "0 14px 36px rgba(88,224,194,0.22)" },
  ghost: { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
  soft: { background: C.surfaceStrong, color: C.text, border: `1px solid ${C.border}` },
};
const BTN_DISABLED: CSSProperties = { opacity: 0.4, cursor: "default" };

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  v?: BtnVariant;
}
export const Btn = ({ v = "pri", style, children, ...p }: BtnProps) => (
  <button {...p} style={{ ...BTN_BASE, ...BTN_VARIANTS[v], ...style, ...(p.disabled ? BTN_DISABLED : null) }}>
    {children}
  </button>
);

const INP_BASE: CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  fontFamily: C.mono,
  fontSize: 13,
  background: "rgba(255,255,255,0.05)",
  color: C.text,
  outline: "none",
};
export const Inp = ({ style, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} style={{ ...INP_BASE, ...style }} />
);

const BADGE_BASE: CSSProperties = {
  fontSize: 10,
  fontFamily: C.mono,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "2px 8px",
  borderRadius: 3,
};
export interface BadgeProps {
  children?: ReactNode;
  color?: string;
  bg?: string;
}
export const Badge = ({ children, color = C.muted, bg = C.bg }: BadgeProps) => (
  <span style={{ ...BADGE_BASE, color, background: bg }}>{children}</span>
);

const CARD_BASE: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 18,
  backdropFilter: "blur(8px)",
};
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, style, ...p }, ref) => (
    <div ref={ref} {...p} style={{ ...CARD_BASE, ...style }}>{children}</div>
  ),
);
Card.displayName = "Card";

interface ToolbarBtn {
  label: string;
  cmd: string;
  val?: string;
  style?: CSSProperties;
}
const RICH_TOOLBAR: ToolbarBtn[] = [
  { label: "B", cmd: "bold", style: { fontWeight: 700 } },
  { label: "I", cmd: "italic", style: { fontStyle: "italic" } },
  { label: "U", cmd: "underline", style: { textDecoration: "underline" } },
  { label: "H1", cmd: "formatBlock", val: "h2" },
  { label: "H2", cmd: "formatBlock", val: "h3" },
  { label: "•", cmd: "insertUnorderedList" },
  { label: "1.", cmd: "insertOrderedList" },
];

export interface RichEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  minHeight?: number;
  placeholder?: string;
}
export function RichEditor({ value, onChange, readOnly, minHeight = 120, placeholder = "Add content..." }: RichEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Sentinel: uninitialised, so the first effect after mount populates innerHTML
  // even when `value` matches itself (was a real bug — content existed but the
  // editor mounted blank because the ref was seeded with `value`).
  const lastValue = useRef<string | undefined>();

  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastValue.current) {
      ref.current.innerHTML = value || "";
      lastValue.current = value;
    }
  }, [value]);

  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); ref.current?.focus(); };

  if (readOnly) return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: C.text }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) || `<p style="color:${C.dim}">No content yet.</p>` }} />
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 2, padding: "6px 8px", borderBottom: `1px solid ${C.border}`, background: C.bg, flexWrap: "wrap" }}>
        {RICH_TOOLBAR.map(t => (
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
        onInput={() => { lastValue.current = ref.current!.innerHTML; onChange?.(ref.current!.innerHTML); }}
        style={{ padding: "12px 14px", minHeight, fontSize: 14, lineHeight: 1.7, color: C.text, outline: "none" }}
        data-placeholder={placeholder} />
      <style>{`[contenteditable]:empty:before { content: attr(data-placeholder); color: ${C.dim}; pointer-events: none; }`}</style>
    </div>
  );
}
