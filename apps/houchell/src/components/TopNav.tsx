"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Settings } from "./Settings";
import { AccessibilityMenu } from "./AccessibilityMenu";

// The five standalone (non-Teacher) section roots. Everything else — "/",
// /curriculum, /slides, /school … — is the Teacher workspace, so the secondary
// teacher row shows there.
const STANDALONE = ["/learn", "/revise", "/retrieve", "/tools"];

const PRIMARY = [
  { href: "/", label: "Home", hard: false },
  { href: "/learn", label: "Learn", hard: true },
  { href: "/revise", label: "Revise" },
  { href: "/retrieve", label: "Retrieve" },
  { href: "/teacher", label: "Teacher", teacher: true },
  { href: "/tools", label: "Tools" },
];

export function TopNav({ onOpenVisualiser, onOpenSearch }) {
  const { profile, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showSettings, setShowSettings] = useState(false);

  const inTeacher = !STANDALONE.some(p => pathname === p || pathname?.startsWith(p + "/"));

  const teacherTabs = [
    { href: "/", label: "This week" },
    { href: "/curriculum", label: "Curriculum" },
    ...(profile?.role === "admin" || profile?.is_lead ? [{ href: "/content", label: "Content" }] : []),
    { href: "/slides", label: "Slides" },
    { href: "/parents", label: "Parents" },
    { href: "/home-course", label: "Home course" },
    { href: "/assessments", label: "Assess" },
    { href: "/teacher", label: "My mastery" },
    { href: "/school", label: "School" },
    ...(profile?.trust_role === "trust_lead" ? [{ href: "/trust", label: "Trust" }] : []),
    { href: "/manage", label: "Manage" },
    { href: "/setup", label: "Setup" },
    { href: "/billing", label: "Billing" },
    { href: "/account", label: "Account" },
  ];

  const primaryActive = (it) => {
    if (it.href === "/") return pathname === "/";
    if (it.teacher) return inTeacher && pathname !== "/";
    return pathname === it.href || pathname?.startsWith(it.href + "/");
  };

  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 15, padding: 4, display: "inline-flex" };

  return (
    <>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <header style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(20px)", background: "rgba(7,17,31,0.72)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: "min(1180px, calc(100% - 36px))", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 0" }}>
          {/* Brand */}
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "inherit" }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, background: C.accentGrad, display: "grid", placeItems: "center", color: C.accentFg, fontWeight: 900, fontFamily: C.serif, fontSize: 20, boxShadow: "0 10px 30px rgba(88,224,194,0.25)" }}>H</span>
            <span style={{ fontFamily: C.serif, fontSize: 22, lineHeight: 1, letterSpacing: "-0.01em", color: C.text }}>Hou<em style={{ fontStyle: "italic", color: C.accent }}>chell</em></span>
          </Link>

          {/* Primary pill nav */}
          <nav aria-label="Primary" style={{ display: "flex", gap: 4, alignItems: "center", padding: 5, border: `1px solid ${C.border}`, borderRadius: 999, background: "rgba(255,255,255,0.045)" }}>
            {PRIMARY.map(it => {
              const active = primaryActive(it);
              const style = { padding: "8px 15px", borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: C.sans, letterSpacing: "-0.01em", color: active ? C.text : C.muted, background: active ? "rgba(255,255,255,0.1)" : "transparent", textDecoration: "none", transition: "all .16s ease", whiteSpace: "nowrap" };
              return it.hard
                ? <a key={it.href} href={it.href} aria-current={active ? "page" : undefined} style={style}>{it.label}</a>
                : <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined} style={style}>{it.label}</Link>;
            })}
          </nav>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => onOpenSearch?.()} aria-label="Search" title="Search (⌘K)"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 999, background: "rgba(255,255,255,0.045)", color: C.muted, cursor: "pointer", fontFamily: C.mono, fontSize: 12 }}>
              <span aria-hidden>⌕</span>
              <span style={{ fontSize: 10, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 6px" }}>⌘K</span>
            </button>
            <AccessibilityMenu />
            <button onClick={() => onOpenVisualiser?.()} title="Visualiser (camera)" aria-label="Open the visualiser" style={iconBtn}><span aria-hidden>📷</span></button>
            <button onClick={() => setShowSettings(true)} title="Settings" aria-label="Open settings" style={iconBtn}><span aria-hidden>⚙</span></button>
            <button onClick={() => { logout(); router.push("/login"); }} title="Sign out" aria-label="Sign out" style={{ ...iconBtn, fontFamily: C.mono, fontSize: 13 }}><span aria-hidden>↪</span></button>
            <div title={profile?.full_name || "Teacher"} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, display: "grid", placeItems: "center", fontSize: 12, fontFamily: C.mono, color: C.muted, flexShrink: 0 }}>
              {(profile?.full_name || "?").charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Secondary teacher row */}
        {inTeacher && (
          <div style={{ borderTop: `1px solid ${C.rule}`, background: "rgba(4,11,22,0.5)" }}>
            <div style={{ width: "min(1180px, calc(100% - 36px))", margin: "0 auto", display: "flex", gap: 6, alignItems: "center", padding: "10px 0", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {teacherTabs.map(t => {
                const active = pathname === t.href || (t.href === "/curriculum" && pathname?.startsWith("/unit/"));
                return (
                  <Link key={t.href + t.label} href={t.href} aria-current={active ? "page" : undefined}
                    style={{ flex: "0 0 auto", padding: "6px 13px", borderRadius: 999, fontFamily: C.mono, fontSize: 11.5, fontWeight: active ? 600 : 500, letterSpacing: "0.01em", color: active ? C.accentFg : C.muted, background: active ? C.accent : "rgba(255,255,255,0.04)", border: `1px solid ${active ? "transparent" : C.border}`, textDecoration: "none", whiteSpace: "nowrap", transition: "all .14s ease" }}>
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
