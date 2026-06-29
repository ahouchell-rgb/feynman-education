"use client";
import { useEffect, useMemo, useState } from "react";
import { sk } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";
import { ObjectiveMasteryPanel, type BlendedObjectiveRow } from "@/components/ObjectiveMasteryPanel";

// Teacher dashboard — a private, owner-scoped view of THIS teacher's own classes:
// the objectives their pupils are weakest on, and a per-class breakdown. Unlike
// /school this isn't role-gated and never shows another teacher's data. Retrieval
// -only for now (assessment QLA isn't teacher-scopable yet — see the API route).

interface WeakRow { topic_id: string; topic_name: string; pct_correct: number; marked: number | null; students: number | null; }
interface ClassRow { class_id: string; name: string; year_group: number; discipline: string; tier: string; linked: boolean; avg: number | null; weak: WeakRow[]; }
interface Overview { enabled: boolean; years?: number[]; classes?: ClassRow[]; objectiveMastery?: BlendedObjectiveRow[]; assessmentIncluded?: boolean; meta?: { source: string; scope: string }; }

// Colour a 0–100% mastery reading: red (weak) → amber → green (secure).
function heat(pct: number) {
  if (pct < 40) return { bg: C.redS, fg: C.red };
  if (pct < 65) return { bg: C.ambS, fg: C.amb };
  return { bg: C.grnS, fg: C.grn };
}

function Bar({ pct }: { pct: number }) {
  const h = heat(pct);
  return (
    <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", minWidth: 64 }}>
      <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: h.fg, opacity: 0.7 }} />
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}>
    <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} />
    <span>{children}</span>
    <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
  </div>
);
const Empty = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "20px", color: C.dim, fontFamily: C.mono, fontSize: 12 }}>{children}</div>
);

function TeacherContent() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [discFilter, setDiscFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/teacher/overview", { headers: { authorization: `Bearer ${sk.auth.getToken()}` } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load");
        setData(d);
      } catch (e: any) { setErr(e.message); }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const cs = data?.classes || [];
    return cs.filter((c) => (yearFilter === "all" || c.year_group === yearFilter) && (discFilter === "all" || c.discipline === discFilter));
  }, [data, yearFilter, discFilter]);

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.08em" }}>Loading your classes…</div>;
  if (err) return <div style={{ padding: 40, color: C.red, fontFamily: C.mono, fontSize: 12 }}>Error: {err}</div>;

  const classes = data?.classes || [];
  const years = data?.years || [];
  const unlinked = classes.filter((c) => !c.linked).length;

  // Brand-new teacher with no classes at all: a friendly empty state.
  if (classes.length === 0) {
    return (
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 24, height: 1, background: C.dim }} /><span>My classes</span>
        </div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
          Your <em style={{ fontStyle: "italic", color: C.grn }}>classes</em>, at a glance.
        </h1>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "54ch", lineHeight: 1.55 }}>
          Once you add classes and link them to retrieval practice, this page shows the objectives your pupils are weakest on — just for you.
        </p>
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 20, background: C.surface }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>No classes yet</div>
          <p style={{ fontSize: 13, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>Add your classes and timetable in setup, then come back to see their mastery.</p>
          <a href="/setup" style={{ fontFamily: C.mono, fontSize: 12, color: C.grn, textDecoration: "none", borderBottom: `1px dotted ${C.grn}` }}>Go to setup →</a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span style={{ flex: 1 }}>My classes · {classes.length}</span>
        <a href="/school" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.muted, textDecoration: "none" }}>School view →</a>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Where your pupils are <em style={{ fontStyle: "italic", color: C.red }}>weakest</em>.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: "54ch", lineHeight: 1.55 }}>
        Your own classes only — private to you. {filtered.length} of {classes.length} shown.
      </p>

      {unlinked > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.ambS, border: `1px solid ${C.amb}`, borderRadius: 8, marginBottom: 24, fontSize: 13, color: C.text }}>
          <span style={{ color: C.amb, fontWeight: 600 }}>!</span>
          <span>{unlinked} {unlinked === 1 ? "class isn't" : "classes aren't"} linked to retrieval practice yet, so {unlinked === 1 ? "it has" : "they have"} no mastery data. <a href="/setup" style={{ color: C.amb }}>Link in setup →</a></span>
        </div>
      )}

      {/* filters — mirror the school dashboard */}
      {(years.length > 1 || classes.some((c) => c.discipline)) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, paddingBottom: 18, borderBottom: `1px solid ${C.rule}` }}>
          {(["all", ...years] as (number | "all")[]).map((y) => {
            const active = yearFilter === y;
            return (
              <button key={String(y)} onClick={() => setYearFilter(y)}
                style={{ background: active ? C.accent : "transparent", color: active ? C.accentFg : C.muted, border: `1px solid ${active ? C.accent : C.border}`, cursor: "pointer", padding: "6px 14px", fontFamily: C.mono, fontSize: 12, borderRadius: 999 }}>
                {y === "all" ? "All years" : `Year ${y}`}
              </button>
            );
          })}
          <span style={{ width: 1, background: C.rule, margin: "0 4px" }} />
          {["all", "biology", "chemistry", "physics"].map((dz) => {
            const active = discFilter === dz;
            const col = dz === "all" ? null : DISC[dz as keyof typeof DISC]?.color;
            return (
              <button key={dz} onClick={() => setDiscFilter(dz)}
                style={{ background: active ? C.accent : "transparent", color: active ? C.accentFg : C.muted, border: `1px solid ${active ? C.accent : C.border}`, cursor: "pointer", padding: "6px 14px", fontFamily: C.mono, fontSize: 11, borderRadius: 999, textTransform: "capitalize", display: "flex", alignItems: "center", gap: 6 }}>
                {col && <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />}{dz}
              </button>
            );
          })}
        </div>
      )}

      {/* per-objective mastery (retrieval-only for now) */}
      <SectionLabel>My weakest objectives — retrieval{data?.assessmentIncluded ? " + assessment" : ""}</SectionLabel>
      {!data?.assessmentIncluded && (
        <p style={{ fontSize: 12, color: C.dim, fontFamily: C.mono, margin: "-6px 0 12px" }}>
          From low-stakes retrieval practice. Assessment QLA isn&rsquo;t included in your private view yet.
        </p>
      )}
      <ObjectiveMasteryPanel rows={data?.objectiveMastery} />

      {/* per-class breakdown */}
      <SectionLabel>By class</SectionLabel>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
        {filtered.length === 0 ? <Empty>No classes match the filter.</Empty> : filtered.map((c, i) => {
          const d = DISC[c.discipline as keyof typeof DISC] || DISC.combined;
          const weakest = c.weak[0];
          return (
            <div key={c.class_id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 130px", gap: 14, alignItems: "center", padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{c.name}</span>
                  {c.year_group ? <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>Y{c.year_group}</span> : null}
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {!c.linked ? <span style={{ color: C.faint, fontStyle: "italic" }}>not linked to retrieval</span>
                  : weakest ? <>Weakest: <span style={{ color: C.text }}>{weakest.topic_name}</span></>
                  : <span style={{ color: C.faint }}>no data yet</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                {c.avg != null ? <><Bar pct={c.avg} /><span style={{ fontFamily: C.mono, fontSize: 12, color: heat(c.avg).fg, fontWeight: 600, minWidth: 34, textAlign: "right" }}>{c.avg}%</span></> : <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TeacherPage() {
  return <AppShell><TeacherContent /></AppShell>;
}
