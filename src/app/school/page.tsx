"use client";
import { useEffect, useMemo, useState } from "react";
import { sk, useAuth } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";

// SLT / Head-of-Department dashboard (strategy Build 2). Cohort mastery across
// every class in the school: the objectives the cohort is weakest on, and a
// per-class grid. Framed as support — aggregates only, no per-pupil surveillance.

interface WeakRow { topic_id: string; topic_name: string; pct_correct: number; marked: number | null; students: number | null; }
interface ClassRow { class_id: string; name: string; year_group: number; discipline: string; tier: string; teacher_name: string; linked: boolean; weak: WeakRow[]; }
interface Overview { enabled: boolean; role: string; school?: { name: string }; years?: number[]; classes?: ClassRow[]; }

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

function SchoolContent() {
  const { profile } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [discFilter, setDiscFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const token = sk.auth.getToken();
        const r = await fetch("/api/school/overview", { headers: { authorization: `Bearer ${token}` } });
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

  // Cohort roll-up: merge weak objectives across the filtered classes.
  const cohort = useMemo(() => {
    const m = new Map<string, { topic_name: string; sum: number; n: number; classes: number; pupils: number }>();
    for (const c of filtered) {
      for (const w of c.weak) {
        const e = m.get(w.topic_id) || { topic_name: w.topic_name, sum: 0, n: 0, classes: 0, pupils: 0 };
        e.sum += w.pct_correct; e.n += 1; e.classes += 1; e.pupils += w.students || 0;
        m.set(w.topic_id, e);
      }
    }
    return [...m.values()].map((e) => ({ topic_name: e.topic_name, avg: Math.round(e.sum / e.n), classes: e.classes, pupils: e.pupils }))
      .sort((a, b) => a.avg - b.avg);
  }, [filtered]);

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.08em" }}>Loading school data…</div>;
  if (err) return <div style={{ padding: 40, color: C.red, fontFamily: C.mono, fontSize: 12 }}>Error: {err}</div>;

  if (!data?.enabled) {
    return (
      <div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 40, lineHeight: 1.05, marginBottom: 10 }}>School dashboard</h1>
        <p style={{ fontSize: 14, color: C.muted, maxWidth: "54ch", lineHeight: 1.6 }}>
          This view is for Heads of Department and senior leaders. Your account isn't enabled for a school yet
          {profile?.full_name ? `, ${profile.full_name}` : ""}. Ask an administrator to link you to your school.
        </p>
      </div>
    );
  }

  const years = data.years || [];

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span style={{ flex: 1 }}>{data.school?.name} · {data.role === "slt" ? "Leadership" : "Department"}</span>
        {data.role === "slt" && <a href="/school/intervention" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.muted, textDecoration: "none", marginRight: 14 }}>Interventions →</a>}
        <a href="/school/integrations" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.muted, textDecoration: "none" }}>Integrations →</a>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Where the cohort is <em style={{ fontStyle: "italic", color: C.red }}>weakest</em>.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: "54ch", lineHeight: 1.55 }}>
        Aggregated across every class — to target support, not to rank teachers. {filtered.length} classes shown.
      </p>

      {/* filters */}
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

      {/* cohort weakest objectives */}
      <SectionLabel>Weakest objectives — cohort</SectionLabel>
      {cohort.length === 0 ? (
        <Empty>No retrieval data yet for this selection.</Empty>
      ) : (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 32 }}>
          {cohort.slice(0, 12).map((o, i) => {
            const h = heat(o.avg);
            return (
              <div key={o.topic_name + i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 70px", gap: 14, alignItems: "center", padding: "11px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
                <span style={{ fontSize: 14, color: C.text }}>{o.topic_name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Bar pct={o.avg} />
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: h.fg, fontWeight: 600, minWidth: 34, textAlign: "right" }}>{o.avg}%</span>
                </div>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{o.classes} {o.classes === 1 ? "class" : "classes"}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* per-class grid */}
      <SectionLabel>By class</SectionLabel>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
        {filtered.length === 0 ? <Empty>No classes match the filter.</Empty> : filtered.map((c, i) => {
          const d = DISC[c.discipline as keyof typeof DISC] || DISC.combined;
          const weakest = c.weak[0];
          const avg = c.weak.length ? Math.round(c.weak.reduce((s, w) => s + w.pct_correct, 0) / c.weak.length) : null;
          return (
            <div key={c.class_id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 130px", gap: 14, alignItems: "center", padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{c.name}</span>
                  {c.year_group ? <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>Y{c.year_group}</span> : null}
                </div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginTop: 3, paddingLeft: 15 }}>{c.teacher_name || "—"}</div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {!c.linked ? <span style={{ color: C.faint, fontStyle: "italic" }}>not linked to retrieval</span>
                  : weakest ? <>Weakest: <span style={{ color: C.text }}>{weakest.topic_name}</span></>
                  : <span style={{ color: C.faint }}>no data yet</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                {avg != null ? <><Bar pct={avg} /><span style={{ fontFamily: C.mono, fontSize: 12, color: heat(avg).fg, fontWeight: 600, minWidth: 34, textAlign: "right" }}>{avg}%</span></> : <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>
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

export default function SchoolPage() {
  return <AppShell><SchoolContent /></AppShell>;
}
