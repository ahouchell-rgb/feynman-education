"use client";
import { useState } from "react";
import { C } from "../lib/theme";

/* ─── UI primitives ─── */
export const Inp = ({ style, ...p }) => <input {...p} style={{ width: "100%", padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 3, color: C.txt, fontSize: 15, outline: "none", boxSizing: "border-box", WebkitAppearance: "none", ...style }} />;
export const TA = ({ style, ...p }) => <textarea {...p} style={{ width: "100%", padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 3, color: C.txt, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", ...style }} />;
export const Btn = ({ v = "pri", style, children, ...p }) => {
  const s = { pri: { background: C.pri, color: C.bg }, ghost: { background: "transparent", color: C.mid, border: `1px solid ${C.bdr}` } };
  return <button {...p} style={{ padding: "11px 18px", borderRadius: 3, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", letterSpacing: ".06em", textTransform: "uppercase", ...s[v], ...style, ...(p.disabled ? { background: C.bg, color: C.dim, border: `1.5px solid ${C.bdr}`, opacity: 1, cursor: "default" } : {}) }}>{children}</button>;
};
export const Card = ({ children, style, ...p }) => <div {...p} style={{ background: C.card, borderRadius: 3, border: `1px solid ${C.bdr}`, ...style }}>{children}</div>;
export const Badge = ({ children, color = C.pri, style }) => <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 3, background: `${color}18`, color, textTransform: "uppercase", letterSpacing: ".12em", ...style }}>{children}</span>;
export const Pill = ({ on, children, onClick, style }) => <button onClick={onClick} aria-pressed={!!on} style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${on ? C.pri : C.bdr}`, background: on ? C.priSoftBg : "transparent", color: on ? C.pri : C.mid, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", letterSpacing: ".02em", ...style }}>{children}</button>;
export const Stat = ({ label, value, color = C.txt }) => <Card style={{ padding: "14px 10px", textAlign: "center", flex: "1 1 0", minWidth: 0 }}><div style={{ fontFamily: C.serif, fontSize: 26, fontWeight: 500, color, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div><div style={{ fontSize: 9, color: C.mid, marginTop: 6, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 600 }}>{label}</div></Card>;
export const Bar = ({ pct, label }) => {
  const now = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return <div role="progressbar" aria-valuenow={now} aria-valuemin={0} aria-valuemax={100} aria-label={label || "progress"} style={{ width: "100%", height: 3, background: C.bdrSoft, borderRadius: 1.5, overflow: "hidden" }}><div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red, borderRadius: 1.5, transition: "width .4s" }} /></div>;
};

/* Editorial primitives — for D2 register */
export const Kicker = ({ children, color = C.pri, style }) => <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color, marginBottom: 6, ...style }}>{children}</div>;
export const Headline = ({ children, size = 24, style }) => <div style={{ fontFamily: C.serif, fontSize: size, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.15, color: C.txt, ...style }}>{children}</div>;
export const Deck = ({ children, style }) => <div style={{ fontFamily: C.serif, fontSize: 14, fontStyle: "italic", lineHeight: 1.45, color: C.mid, ...style }}>{children}</div>;
export const SectionTitle = ({ children, style }) => <div style={{ fontFamily: C.serif, fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: C.txt, ...style }}>{children}</div>;
export const Dateline = ({ left, right, style }) => <div style={{ padding: "8px 0", borderBottom: `1px solid ${C.bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: C.mid, fontWeight: 500, ...style }}><span style={{ color: C.pri, fontWeight: 600 }}>{left}</span><span>{right}</span></div>;
// Collapsible detail section: shows just a title + one-line teaser until the
// teacher opens it. Lets the dashboard lead with headlines and keep the deep
// analytics/settings one tap away. `right` holds header controls shown when open.
export const Section = ({ label, teaser, right = null, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `2px solid ${C.bdr}`, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: open ? "14px 0 10px" : "14px 0" }}>
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: "flex", alignItems: "baseline", gap: 9, minWidth: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", padding: 0 }}>
          <span aria-hidden="true" style={{ color: C.dim, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
          <span style={{ color: C.txt, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{label}</span>
          {!open && teaser != null && <span style={{ fontSize: 11, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{teaser}</span>}
        </button>
        {open && (right || <button onClick={() => setOpen(false)} style={{ fontSize: 11, color: C.dim, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Hide</button>)}
      </div>
      {open && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  );
};
export const StatTile = ({ label, value, onClick, active, color }) => (
  <button onClick={onClick} disabled={!onClick} aria-pressed={onClick ? !!active : undefined} style={{ padding: "10px 8px", background: active ? C.priSoft : C.card, border: `1px solid ${active ? C.pri : C.bdr}`, borderRadius: 8, cursor: onClick ? "pointer" : "default", fontFamily: "inherit", textAlign: "center" }}>
    <div style={{ fontSize: 18, fontWeight: 700, color: color || (active ? C.pri : C.txt), lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: .5, marginTop: 4 }}>{label}</div>
  </button>
);

/* ─── HoD PANEL ─── */
