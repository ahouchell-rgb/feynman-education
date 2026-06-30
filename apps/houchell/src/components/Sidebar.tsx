"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, sk } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { Settings } from "./Settings";
import { AccessibilityMenu } from "./AccessibilityMenu";

export function Sidebar({ onOpenVisualiser, onOpenSearch }) {
  const { profile, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [groups, setGroups] = useState([]);
  const [units, setUnits] = useState({});
  const [openGroups, setOpenGroups] = useState(new Set(["y7"]));
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const gs = await sk.q("groups", { params: { order: "sort_order.asc" } });
        setGroups(gs);
        const all = await sk.q("units", { params: { select: "*", order: "sort_order.asc" } });
        const byGroup = {};
        gs.forEach(g => { byGroup[g.id] = all.filter(u => u.group_id === g.id); });
        setUnits(byGroup);
      } catch {}
    })();
  }, []);

  const isActive = (path) => pathname === path;
  const currentUnitId = pathname?.startsWith("/unit/") ? pathname.split("/")[2] : null;

  // Top-level sections. Everything that isn't a standalone section belongs to
  // the Teacher app (home, curriculum, slides, school…), so the detailed
  // teacher nav + curriculum tree only render when you're inside it.
  const SECTIONS = [
    { href: "/learn", label: "Learn", hint: "Springboard", hard: true },
    { href: "/revise", label: "Revise", hint: "Revision" },
    { href: "/retrieve", label: "Retrieve", hint: "Practice" },
    { href: "/", label: "Teacher", hint: "Science Kit", teacher: true },
    { href: "/tools", label: "Tools", hint: "Interactive" },
  ];
  const STANDALONE = ["/learn", "/revise", "/retrieve", "/tools"];
  const inTeacher = !STANDALONE.some(p => pathname === p || pathname?.startsWith(p + "/"));

  return (
    <>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <nav aria-label="Primary" style={{ width: 240, minWidth: 240, borderRight: `1px solid ${C.border}`, background: C.surface, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100dvh", overflowY: "auto" }}>
        <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${C.border}` }}>
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 4 }}>Houchell Education</div>
            <div style={{ fontFamily: C.serif, fontSize: 24, lineHeight: 1, letterSpacing: "-0.01em", color: C.text }}>Hou<em style={{ fontStyle: "italic", color: C.grn }}>chell</em></div>
          </Link>
        </div>

        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <button onClick={() => onOpenSearch?.()} aria-label="Search the curriculum"
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, color: C.muted, cursor: "pointer", fontFamily: C.mono, fontSize: 12 }}>
            <span aria-hidden style={{ fontSize: 13 }}>⌕</span>
            <span style={{ flex: 1, textAlign: "left" }}>Search</span>
            <span style={{ fontSize: 10, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 5px" }}>⌘K</span>
          </button>
        </div>

        <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
          {SECTIONS.map(s => {
            const active = s.teacher ? inTeacher : (pathname === s.href || pathname?.startsWith(s.href + "/"));
            const inner = (
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "baseline", gap: 8, background: active ? C.bg : "transparent", borderLeft: active ? `2px solid ${C.grn}` : "2px solid transparent", cursor: "pointer" }}>
                <span style={{ fontFamily: C.serif, fontSize: 16, color: active ? C.text : C.muted, lineHeight: 1 }}>{s.label}</span>
                <span style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: active ? C.grn : C.dim, marginLeft: "auto" }}>{s.hint}</span>
              </div>
            );
            // /learn is a static rewrite, not a router page → hard navigation.
            return s.hard
              ? <a key={s.href} href={s.href} aria-current={active ? "page" : undefined} style={{ display: "block", textDecoration: "none" }}>{inner}</a>
              : <Link key={s.href} href={s.href} aria-current={active ? "page" : undefined} style={{ display: "block", textDecoration: "none" }}>{inner}</Link>;
          })}
        </div>

        {inTeacher && <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
          {[
            { href: "/", label: "This week" },
            { href: "/curriculum", label: "Curriculum" },
            // Content review pipeline is for authors / department leads.
            ...(profile?.role === "admin" || profile?.is_lead ? [{ href: "/content", label: "Content" }] : []),
            { href: "/slides", label: "Slides" },
            { href: "/parents", label: "Parents" },
            { href: "/home-course", label: "Home course" },
            { href: "/assessments", label: "Assess" },
            // Teacher's own private, owner-scoped insight view of their classes.
            { href: "/teacher", label: "My mastery" },
            // School: dashboard for hod/slt, self-serve onboarding for everyone else.
            { href: "/school", label: "School" },
            // Trust dashboard is only for MAT leaders.
            ...(profile?.trust_role === "trust_lead" ? [{ href: "/trust", label: "Trust" }] : []),
            { href: "/manage", label: "Manage" },
            { href: "/setup", label: "Setup" },
            { href: "/billing", label: "Billing" },
            { href: "/account", label: "Account" },
          ].map(item => {
            const active = isActive(item.href) || (item.href === "/curriculum" && pathname?.startsWith("/unit/"));
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} style={{ display: "block", textDecoration: "none" }}>
                <div style={{ padding: "9px 16px", display: "flex", alignItems: "center", background: active ? C.bg : "transparent", borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent", fontFamily: C.mono, fontSize: 12, fontWeight: active ? 600 : 500, color: active ? C.text : C.muted, letterSpacing: "0.02em", cursor: "pointer" }}>
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>}

        {inTeacher ? <div style={{ flex: 1, padding: "10px 0" }}>
          {groups.map(g => {
            const isOpen = openGroups.has(g.id);
            const groupUnits = units[g.id] || [];
            const ksColor = g.key_stage === "ks3" ? C.blu : C.grn;
            return (
              <div key={g.id}>
                <button onClick={() => setOpenGroups(p => { const n = new Set(p); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}
                  aria-expanded={isOpen} aria-label={`${g.label} units`}
                  style={{ width: "100%", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span aria-hidden style={{ fontSize: 10, color: C.dim, transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                  <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.text, flex: 1 }}>{g.label}</span>
                  <span style={{ fontSize: 9, fontFamily: C.mono, padding: "1px 5px", borderRadius: 2, background: `${ksColor}18`, color: ksColor }}>{g.key_stage?.toUpperCase()}</span>
                </button>
                {isOpen && groupUnits.map(u => {
                  const d = DISC[u.discipline] || DISC.combined;
                  const isSelected = currentUnitId === u.id;
                  return (
                    <Link key={u.id} href={`/unit/${u.id}`} style={{ textDecoration: "none", display: "block" }}>
                      <div style={{ width: "100%", padding: "6px 16px 6px 34px", display: "flex", alignItems: "center", gap: 8, background: isSelected ? `${d.color}0f` : "transparent", borderLeft: isSelected ? `2px solid ${d.color}` : "2px solid transparent", cursor: "pointer" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: isSelected ? d.color : C.text, fontWeight: isSelected ? 500 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.title}</span>
                        {u.hours && <span style={{ fontSize: 10, color: C.dim, fontFamily: C.mono }}>{u.hours}h</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div> : <div style={{ flex: 1 }} />}

        <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.bg, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: C.mono, color: C.muted, flexShrink: 0 }}>
            {(profile?.full_name || "?").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.full_name || "Teacher"}</div>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono }}>{profile?.role}</div>
          </div>
          <AccessibilityMenu />
          <button onClick={() => onOpenVisualiser?.()} title="Visualiser (camera)" aria-label="Open the visualiser" style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 14, padding: 2 }}><span aria-hidden>📷</span></button>
          <button onClick={() => setShowSettings(true)} title="Settings" aria-label="Open settings" style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 14, padding: 2 }}><span aria-hidden>⚙</span></button>
          <button onClick={() => { logout(); router.push("/login"); }} title="Sign out" aria-label="Sign out" style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 12, fontFamily: C.mono, padding: 2 }}><span aria-hidden>↪</span></button>
        </div>
      </nav>
    </>
  );
}
