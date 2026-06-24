"use client";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { C } from "@/lib/theme";

/* Shared visual building blocks for the /driving section. Kept local to the
 * driving app so it can evolve independently of the main product's primitives. */

export const card: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
};

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 20px 80px" }}>{children}</div>
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
  ];
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        padding: "18px 0 22px",
        borderBottom: `1px solid ${C.rule}`,
        marginBottom: 28,
      }}
    >
      <Link
        href="/driving"
        style={{
          fontFamily: C.serif,
          fontSize: 22,
          color: C.text,
          textDecoration: "none",
          marginRight: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span aria-hidden>🚗</span> Driving Test Trainer
      </Link>
      <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {links.map(([href, label]) => {
          const on = active === href;
          return (
            <Link
              key={href}
              href={href}
              style={{
                fontFamily: C.mono,
                fontSize: 12,
                letterSpacing: "0.02em",
                padding: "6px 11px",
                borderRadius: 6,
                textDecoration: "none",
                color: on ? C.accentFg : C.muted,
                background: on ? C.accent : "transparent",
                border: `1px solid ${on ? C.accent : C.border}`,
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
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
