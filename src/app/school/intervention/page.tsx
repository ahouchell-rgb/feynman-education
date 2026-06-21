"use client";
import { useEffect, useState } from "react";
import { sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

// SLT intervention list (Build 2 action layer). Pupils below a mastery threshold,
// grouped by objective, exportable as CSV for intervention groups / PP tracking.
// Pupil-level + SLT-only — see the data-protection note in docs/SLT_DASHBOARD.md.

interface Row { class_name: string; teacher_name: string; year_group: number; student_name: string; topic_name: string; pct_correct: number; marked: number | null; }
interface ByObj { topic_name: string; pupils: number; avg: number; }
interface Data { enabled: boolean; threshold?: number; topic?: string; total?: number; byObjective?: ByObj[]; rows?: Row[]; note?: string; }

const THRESHOLDS = [40, 50, 65];

function toCsv(rows: Row[]): string {
  const head = ["Pupil", "Class", "Teacher", "Year", "Objective", "% correct", "Answers"];
  const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((r) => [r.student_name, r.class_name, r.teacher_name, r.year_group, r.topic_name, r.pct_correct, r.marked].map(esc).join(","));
  return [head.join(","), ...lines].join("\n");
}

function InterventionContent() {
  const [threshold, setThreshold] = useState(50);
  const [topic, setTopic] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Pick up ?topic= when drilling in from a dashboard's weak objective.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("topic");
    if (t) setTopic(t);
  }, []);

  const load = async (t: number, topicQ: string) => {
    setLoading(true); setErr("");
    try {
      const qs = `threshold=${t}${topicQ ? `&topic=${encodeURIComponent(topicQ)}` : ""}`;
      const r = await fetch(`/api/school/intervention?${qs}`, { headers: { authorization: `Bearer ${sk.auth.getToken()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      setData(d);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(threshold, topic); /* eslint-disable-next-line */ }, [threshold, topic]);

  const downloadCsv = () => {
    if (!data?.rows?.length) return;
    const blob = new Blob([toCsv(data.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `intervention-below-${threshold}pct${topic ? `-${topic.replace(/[^a-z0-9]+/gi, "-")}` : ""}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (data && !data.enabled) {
    return (
      <div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 40, lineHeight: 1.05, marginBottom: 10 }}>Intervention list</h1>
        <p style={{ fontSize: 14, color: C.muted, maxWidth: "54ch", lineHeight: 1.6 }}>This pupil-level view is for senior leaders only.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span style={{ flex: 1 }}>School · Intervention</span>
        <a href="/school" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.muted, textDecoration: "none" }}>← Dashboard</a>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Who needs <em style={{ fontStyle: "italic", color: C.red }}>support</em>.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 22, maxWidth: "54ch", lineHeight: 1.55 }}>
        Pupils below a mastery threshold per objective — for intervention groups and disadvantaged-gap tracking. Pupil-level; handle per your data-protection policy.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 24, paddingBottom: 18, borderBottom: `1px solid ${C.rule}` }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginRight: 4 }}>Below</span>
        {THRESHOLDS.map((t) => {
          const active = threshold === t;
          return (
            <button key={t} onClick={() => setThreshold(t)}
              style={{ background: active ? C.accent : "transparent", color: active ? C.accentFg : C.muted, border: `1px solid ${active ? C.accent : C.border}`, cursor: "pointer", padding: "6px 14px", fontFamily: C.mono, fontSize: 12, borderRadius: 999 }}>
              {t}%
            </button>
          );
        })}
        {topic && (
          <button onClick={() => setTopic("")}
            style={{ background: C.redS, color: C.red, border: `1px solid ${C.red}`, cursor: "pointer", padding: "6px 12px", fontFamily: C.mono, fontSize: 11, borderRadius: 999, display: "flex", alignItems: "center", gap: 6 }}>
            {topic} ✕
          </button>
        )}
        <span style={{ flex: 1 }} />
        <Btn v="soft" onClick={downloadCsv} disabled={!data?.rows?.length}>⬇ Export CSV</Btn>
      </div>

      {err && <div style={{ padding: "10px 14px", background: C.redS, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 13, marginBottom: 18 }}>{err}</div>}
      {loading ? <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 12 }}>Loading…</div> : data && (
        <>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, marginBottom: 18 }}>
            <strong style={{ color: C.text }}>{data.total}</strong> pupil-objective flags below {threshold}%{topic ? <> on <strong style={{ color: C.text }}>{topic}</strong></> : ""}.
          </div>

          {data.note && <div style={{ padding: "10px 14px", background: C.ambS, border: `1px solid ${C.amb}`, borderRadius: 6, color: C.amb, fontSize: 13, marginBottom: 20 }}>{data.note}</div>}

          {(data.byObjective || []).length > 0 && (
            <>
              <SectionLabel>By objective</SectionLabel>
              <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 32 }}>
                {data.byObjective!.map((o, i) => (
                  <div key={o.topic_name + i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 70px", gap: 14, alignItems: "center", padding: "11px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
                    <span style={{ fontSize: 14, color: C.text }}>{o.topic_name}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: C.red, fontWeight: 600 }}>{o.pupils} pupil{o.pupils === 1 ? "" : "s"}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, textAlign: "right" }}>avg {o.avg}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(data.rows || []).length > 0 && (
            <>
              <SectionLabel>Pupils</SectionLabel>
              <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
                {data.rows!.slice(0, 300).map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 70px", gap: 12, alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{r.student_name}</div>
                      <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono }}>{r.class_name}{r.year_group ? ` · Y${r.year_group}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.topic_name}</div>
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: C.red, fontWeight: 600, textAlign: "right" }}>{r.pct_correct}%</span>
                  </div>
                ))}
                {data.rows!.length > 300 && <div style={{ padding: "10px 16px", fontFamily: C.mono, fontSize: 11, color: C.dim, borderTop: `1px solid ${C.rule}` }}>Showing first 300 — export CSV for the full list.</div>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}>
    <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} /><span>{children}</span><span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
  </div>
);

export default function InterventionPage() {
  return <AppShell><InterventionContent /></AppShell>;
}
