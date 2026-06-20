"use client";
import { useEffect, useMemo, useState } from "react";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";

// MAT / Trust dashboard (strategy Build 4). Every school in the trust, benchmarked
// on the same mastery graph: average mastery, weakest objectives, and how each
// school sits against the trust mean. For consistency + support across schools.

interface SchoolRow { school_id: string; name: string; classes: number; linked: number; avgMastery: number | null; weakest: { topic_name: string; avg: number }[]; }
interface CohortRow { topic_name: string; avg: number; schools: number; }
interface Overview { enabled: boolean; trust?: { name: string }; trustAvg?: number | null; schools?: SchoolRow[]; cohort?: CohortRow[]; }

function heat(pct: number) {
  if (pct < 40) return C.red; if (pct < 65) return C.amb; return C.grn;
}
function Bar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", minWidth: 70 }}>
      <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: heat(pct), opacity: 0.75 }} />
    </div>
  );
}

interface Snapshot { taken_on: string; trust_avg: number | null; }

function TrustContent() {
  const { profile } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<Snapshot[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/trust/overview", { headers: { authorization: `Bearer ${sk.auth.getToken()}` } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load");
        setData(d);
      } catch (e: any) { setErr(e.message); }
      setLoading(false);
      // Trend from saved snapshots (RLS scopes to the caller's trust). Best-effort.
      try {
        const snaps = await sk.q("trust_benchmark_snapshots", { params: { select: "taken_on,trust_avg", order: "taken_on.asc", limit: "16" } });
        setTrend((snaps || []).filter((s: Snapshot) => s.trust_avg != null));
      } catch { /* table may not exist yet */ }
    })();
  }, []);

  const maxClasses = useMemo(() => Math.max(1, ...(data?.schools || []).map((s) => s.classes)), [data]);

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.08em" }}>Loading trust data…</div>;
  if (err) return <div style={{ padding: 40, color: C.red, fontFamily: C.mono, fontSize: 12 }}>Error: {err}</div>;

  if (!data?.enabled) {
    return (
      <div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 40, lineHeight: 1.05, marginBottom: 10 }}>Trust dashboard</h1>
        <p style={{ fontSize: 14, color: C.muted, maxWidth: "54ch", lineHeight: 1.6 }}>
          This view is for trust (MAT) leaders. Your account isn't linked to a trust{profile?.full_name ? `, ${profile.full_name}` : ""}. Ask an administrator to enable it.
        </p>
      </div>
    );
  }

  const schools = data.schools || [];
  const trustAvg = data.trustAvg ?? null;

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>{data.trust?.name} · Trust</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Every school, <em style={{ fontStyle: "italic", color: C.grn }}>one</em> picture.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: "54ch", lineHeight: 1.55 }}>
        {schools.length} schools on the same mastery graph. {trustAvg != null && <>Trust average mastery <strong style={{ color: heat(trustAvg) }}>{trustAvg}%</strong>.</>} For consistency and support — not ranking.
      </p>

      {trend.length >= 2 && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim }}>Trust average · trend</div>
            <div style={{ fontFamily: C.serif, fontSize: 30, color: heat(trend[trend.length - 1].trust_avg || 0), lineHeight: 1.1 }}>
              {trend[trend.length - 1].trust_avg}%
              {trend.length >= 2 && (() => {
                const delta = (trend[trend.length - 1].trust_avg || 0) - (trend[0].trust_avg || 0);
                return <span style={{ fontFamily: C.mono, fontSize: 12, color: delta >= 0 ? C.grn : C.red, marginLeft: 8 }}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts</span>;
              })()}
            </div>
          </div>
          <Sparkline points={trend.map((s) => s.trust_avg || 0)} />
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginLeft: "auto", textAlign: "right" }}>
            {trend.length} snapshots<br />since {new Date(trend[0].taken_on + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
          </div>
        </div>
      )}

      {/* school benchmark */}
      <SectionLabel>Schools — benchmarked</SectionLabel>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 32 }}>
        {schools.length === 0 ? <Empty>No schools with data yet.</Empty> : schools.map((s, i) => {
          const below = trustAvg != null && s.avgMastery != null && s.avgMastery < trustAvg;
          return (
            <div key={s.school_id} style={{ display: "grid", gridTemplateColumns: "1.4fr 150px 1.2fr", gap: 14, alignItems: "center", padding: "13px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                  {s.name}
                  {below && <span style={{ fontFamily: C.mono, fontSize: 9, color: C.amb, background: C.ambS, padding: "1px 6px", borderRadius: 3, letterSpacing: "0.05em" }}>BELOW AVG</span>}
                </div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginTop: 3 }}>{s.classes} classes · {s.linked} linked</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {s.avgMastery != null ? <><Bar pct={s.avgMastery} /><span style={{ fontFamily: C.mono, fontSize: 12, color: heat(s.avgMastery), fontWeight: 600, minWidth: 34, textAlign: "right" }}>{s.avgMastery}%</span></> : <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>no data</span>}
              </div>
              <div style={{ fontSize: 12, color: C.muted, overflow: "hidden" }}>
                {s.weakest.length ? <>Weakest: <span style={{ color: C.text }}>{s.weakest[0].topic_name}</span></> : <span style={{ color: C.faint }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* trust-wide weakest objectives */}
      <SectionLabel>Weakest objectives — trust-wide</SectionLabel>
      {(data.cohort || []).length === 0 ? <Empty>No retrieval data yet.</Empty> : (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
          {(data.cohort || []).slice(0, 12).map((o, i) => (
            <div key={o.topic_name + i} style={{ display: "grid", gridTemplateColumns: "1fr 140px 90px", gap: 14, alignItems: "center", padding: "11px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <span style={{ fontSize: 14, color: C.text }}>{o.topic_name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bar pct={o.avg} />
                <span style={{ fontFamily: C.mono, fontSize: 12, color: heat(o.avg), fontWeight: 600, minWidth: 34, textAlign: "right" }}>{o.avg}%</span>
              </div>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{o.schools} {o.schools === 1 ? "school" : "schools"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}>
    <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} /><span>{children}</span><span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
  </div>
);
const Empty = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "20px", color: C.dim, fontFamily: C.mono, fontSize: 12, marginBottom: 24 }}>{children}</div>
);

// Tiny inline trend line of the trust average over recent snapshots.
function Sparkline({ points, w = 220, h = 40 }: { points: number[]; w?: number; h?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points);
  const span = Math.max(1, max - min);
  const xs = (i: number) => (i / (points.length - 1)) * (w - 4) + 2;
  const ys = (v: number) => h - 4 - ((v - min) / span) * (h - 8);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={heat(last)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs(points.length - 1)} cy={ys(last)} r={3} fill={heat(last)} />
    </svg>
  );
}

export default function TrustPage() {
  return <AppShell><TrustContent /></AppShell>;
}
