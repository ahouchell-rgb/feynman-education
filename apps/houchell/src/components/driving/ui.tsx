"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Cd as C } from "@/lib/driving/theme";

/* Shared visual building blocks for the /driving section. Kept local to the
 * driving app so it can evolve independently of the main product's primitives. */

export const card: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 28px rgba(0,0,0,0.32)",
};

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        color: C.text,
        background: `radial-gradient(circle at 10% -10%, rgba(88,224,194,0.18), transparent 34%), radial-gradient(circle at 92% 0%, rgba(122,167,255,0.20), transparent 36%), radial-gradient(circle at 50% 120%, rgba(255,209,102,0.08), transparent 38%), ${C.bg}`,
      }}
    >
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 20px 90px" }}>{children}</div>
    </div>
  );
}

export function TopBar({ active }: { active?: string }) {
  const links: [string, string][] = [
    ["/driving", "Home"],
    ["/driving/learn", "Learn"],
    ["/driving/theory", "Mock test"],
    ["/driving/hazard", "Hazard perception"],
    ["/driving/practice", "Practice"],
    ["/driving/revise", "Revise"],
    ["/driving/premium", "Premium"],
  ];
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        padding: "16px 0 18px",
        position: "sticky",
        top: 0,
        zIndex: 40,
        backdropFilter: "blur(20px)",
        background: "rgba(7,17,31,0.72)",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 28,
      }}
    >
      <Link
        href="/driving"
        style={{
          fontFamily: C.serif,
          fontWeight: 700,
          fontSize: 21,
          textDecoration: "none",
          marginRight: "auto",
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}
      >
        <span aria-hidden style={{ fontSize: 20 }}>🚗</span>
        <span style={{ background: `linear-gradient(90deg, ${C.text}, ${C.grn})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          Driving&nbsp;Trainer
        </span>
      </Link>
      <nav style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {links.map(([href, label]) => {
          const on = active === href;
          const premium = label === "Premium";
          return (
            <Link
              key={href}
              href={href}
              style={{
                fontFamily: C.mono,
                fontSize: 12,
                letterSpacing: "0.02em",
                padding: "7px 13px",
                borderRadius: 999,
                textDecoration: "none",
                color: premium ? (on ? "#1b1405" : C.amb) : on ? C.accentFg : C.muted,
                background: premium ? (on ? C.amb : C.ambS) : on ? C.accent : "transparent",
                border: `1px solid ${premium ? C.amb : on ? C.accent : C.border}`,
                fontWeight: premium ? 600 : 400,
              }}
            >
              {premium && "★ "}
              {label}
            </Link>
          );
        })}
        <AccessibilityToggle />
      </nav>
    </header>
  );
}

const A11Y_KEY = "uk-driving-a11y";
type A11y = { large: boolean; dyslexic: boolean; contrast: boolean };

function AccessibilityToggle() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<A11y>({ large: false, dyslexic: false, contrast: false });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(A11Y_KEY);
      if (raw) setS({ ...{ large: false, dyslexic: false, contrast: false }, ...JSON.parse(raw) });
    } catch {}
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-a11y-text", s.large ? "large" : "normal");
    el.setAttribute("data-a11y-font", s.dyslexic ? "dyslexic" : "normal");
    el.setAttribute("data-a11y-contrast", s.contrast ? "high" : "normal");
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(s)); } catch {}
  }, [s]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const rows: [keyof A11y, string][] = [["large", "Larger text"], ["dyslexic", "Dyslexia-friendly font"], ["contrast", "High contrast"]];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Accessibility options"
        aria-expanded={open}
        title="Accessibility"
        style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: C.muted, background: "transparent", border: `1px solid ${C.border}`, minWidth: 36, minHeight: 32 }}
      >
        ♿
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 60, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, width: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim, padding: "4px 6px 8px" }}>Accessibility</div>
          {rows.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setS((v) => ({ ...v, [k]: !v[k] }))}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 6, cursor: "pointer", background: "transparent", border: "none", fontFamily: "inherit", fontSize: 13.5, color: C.text }}
            >
              <span>{label}</span>
              <span style={{ width: 36, height: 20, borderRadius: 99, background: s[k] ? C.grn : C.border, position: "relative", flexShrink: 0 }}>
                <span style={{ position: "absolute", top: 2, left: s[k] ? 18 : 2, width: 16, height: 16, borderRadius: 99, background: "#fff", transition: "left .12s" }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PageTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {kicker && (
        <div
          style={{
            fontFamily: C.mono,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.dim,
            marginBottom: 8,
          }}
        >
          {kicker}
        </div>
      )}
      <h1 style={{ fontFamily: C.serif, fontSize: 38, lineHeight: 1.05, fontWeight: 400 }}>{title}</h1>
      {sub && <p style={{ color: C.muted, fontSize: 15, marginTop: 10, maxWidth: 620, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

export function ProgressBar({ value, max, color = C.text }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      style={{ height: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 99, overflow: "hidden" }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width .25s ease" }} />
    </div>
  );
}

export function fmtTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
