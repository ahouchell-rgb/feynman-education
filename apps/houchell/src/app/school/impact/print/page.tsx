"use client";
import { useEffect, useState } from "react";
import { sk } from "@/lib/sk";
import {
  overallTrend, objectiveDeltas, mostImproved, stillStuck, impactNarrative,
  type Snapshot, type CohortOutcome,
} from "@/lib/impact";

/* PRIORITY #3 — Governors / Ofsted impact summary (printable).
 *
 * A print-friendly one-pager the SLT can take to governors: the school mastery
 * trend + delta, most-improved / still-weak objectives, recorded cohort
 * outcomes, and an auto-templated narrative line (pure fn from /lib/impact, no
 * AI). Built entirely from the EXISTING snapshot history + cohort_outcomes,
 * read under the SLT's own JWT + RLS (school-scoped; no pupil-level data).
 *
 * Reuses the deck print pattern: a sticky no-print control bar + window.print(),
 * @page margins, white background. Degrades gracefully when history is thin. */

const heat = (pct: number) => (pct < 40 ? "#b95a3c" : pct < 65 ? "#a06520" : "#5e7c4b");

export default function ImpactPrintPage() {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [outcomes, setOutcomes] = useState<CohortOutcome[]>([]);
  const [school, setSchool] = useState<string>("");
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await sk.q("profiles", { params: { select: "school_id,school_role" }, single: true });
        if (!me?.school_id || (me.school_role !== "hod" && me.school_role !== "slt")) { setGated(true); return; }
        const [s, snapRows, outRows] = await Promise.all([
          sk.q("schools", { params: { id: `eq.${me.school_id}`, select: "name" }, single: true }).catch(() => null),
          sk.q("school_benchmark_snapshots", { params: { select: "taken_on,school_avg,payload", order: "taken_on.asc", limit: "40" } }).catch(() => []),
          sk.q("cohort_outcomes", { params: { select: "id,label,term,metric,value,recorded_at", order: "recorded_at.desc", limit: "50" } }).catch(() => []),
        ]);
        setSchool(s?.name || "Your school");
        setSnaps(snapRows || []);
        setOutcomes(outRows || []);
      } catch (e: any) { setErr(e.message || "Couldn't load impact data"); }
    })();
  }, []);

  if (gated) return <div style={{ padding: 40, fontFamily: "monospace", fontSize: 13, color: "#b00" }}>This summary is available to senior leaders only.</div>;
  if (err) return <div style={{ padding: 40, fontFamily: "monospace", fontSize: 13, color: "#b00" }}>{err}</div>;
  if (!snaps) return <div style={{ padding: 40, fontFamily: "monospace", fontSize: 13, color: "#888" }}>Loading…</div>;

  const trend = overallTrend(snaps);
  const deltas = objectiveDeltas(snaps);
  const improved = mostImproved(deltas, 6);
  const stuck = stillStuck(deltas, 6);
  const narrative = impactNarrative(trend, deltas, outcomes);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const ink = "#1a1714", dim = "#6b6256", faint = "#9a9486", rule = "#d9d2c0";
  const label: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: faint, marginBottom: 8 };
  const card: React.CSSProperties = { border: `1px solid ${rule}`, borderRadius: 6, padding: 16, breakInside: "avoid" };

  return (
    <div style={{ background: "#fff", minHeight: "100dvh", color: ink }}>
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 14mm; } html, body { background: #fff !important; } }`}</style>

      {/* Controls (hidden when printing) */}
      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 20px", borderBottom: `1px solid #e3ddcc`, background: "#faf7f0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
        <a href="/school" style={{ color: dim, textDecoration: "none", border: `1px solid ${rule}`, borderRadius: 6, padding: "5px 10px" }}>← School</a>
        <strong style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 16, color: ink }}>Impact summary</strong>
        <span style={{ flex: 1 }} />
        <button onClick={() => window.print()} style={{ padding: "7px 16px", border: "none", borderRadius: 6, background: ink, color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Print / Save PDF</button>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 28px 60px" }}>
        {/* Header */}
        <div style={label}>Governors / Ofsted · Impact summary</div>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: 38, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 4px" }}>{school}</h1>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: dim, marginBottom: 24 }}>Science cohort mastery & outcomes · generated {today}</div>

        {/* Narrative line */}
        <div style={{ ...card, background: "#faf7f0", marginBottom: 22, fontSize: 14, lineHeight: 1.6 }}>{narrative}</div>

        {/* Mastery trend */}
        <div style={label}>Cohort mastery trend</div>
        {trend.enough ? (
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", marginBottom: 22 }}>
            <div>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 40, color: heat(trend.latest || 0), lineHeight: 1 }}>{trend.latest}%</div>
              {trend.delta != null && (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: trend.delta >= 0 ? "#5e7c4b" : "#b95a3c" }}>
                  {trend.delta >= 0 ? "+" : ""}{trend.delta} pts since {new Date(trend.points[0].taken_on + "T00:00:00").toLocaleDateString("en-GB", { month: "long" })}
                </div>
              )}
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: faint, marginTop: 4 }}>{trend.points.length} weekly snapshots</div>
            </div>
            <PrintTrend points={trend.points} />
          </div>
        ) : (
          <div style={{ ...card, marginBottom: 22, fontSize: 13, color: dim }}>Not enough snapshot history yet to show a term trend{trend.latest != null ? ` — current cohort mastery is ${trend.latest}%.` : "."}</div>
        )}

        {/* Most improved / Still weak */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
          <div>
            <div style={label}>Most improved</div>
            <PrintRows rows={improved.map((r) => ({ label: r.label, right: `${r.delta! >= 0 ? "+" : ""}${r.delta} pts`, col: r.delta! >= 0 ? "#5e7c4b" : "#b95a3c" }))} empty="No measured improvement yet." rule={rule} dim={dim} ink={ink} faint={faint} />
          </div>
          <div>
            <div style={label}>Still weak</div>
            <PrintRows rows={stuck.map((r) => ({ label: r.label, right: `${r.latest}%`, col: heat(r.latest) }))} empty="No persistently weak objectives." rule={rule} dim={dim} ink={ink} faint={faint} />
          </div>
        </div>

        {/* Recorded outcomes */}
        <div style={label}>Recorded cohort outcomes</div>
        {outcomes.length === 0 ? (
          <div style={{ ...card, fontSize: 13, color: dim }}>No outcomes recorded yet. Add results (e.g. mock pass rates) on the school dashboard to correlate with the mastery trend.</div>
        ) : (
          <div style={{ border: `1px solid ${rule}`, borderRadius: 6, overflow: "hidden", breakInside: "avoid" }}>
            {outcomes.map((o, i) => (
              <div key={(o as any).id || i} style={{ display: "grid", gridTemplateColumns: "1fr 130px 80px", gap: 12, alignItems: "center", padding: "9px 14px", borderTop: i === 0 ? "none" : `1px solid ${rule}`, fontSize: 13 }}>
                <span>{o.label}{o.metric ? <span style={{ color: dim, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}> · {o.metric}</span> : null}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: dim }}>{o.term || "—"}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, textAlign: "right" }}>{o.value}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: faint, marginTop: 32, lineHeight: 1.5 }}>
          Aggregated, cohort-level data only — no pupil-level information. Mastery is a mark-weighted blend of low-stakes retrieval and common-assessment marks across the school's science classes.
        </div>
      </div>
    </div>
  );
}

// Print-safe trend line (self-contained; no app theme dependency).
function PrintTrend({ points }: { points: { taken_on: string; avg: number }[] }) {
  if (points.length < 2) return null;
  const w = 380, ht = 96, padL = 24, padB = 16;
  const vals = points.map((p) => p.avg);
  const min = Math.max(0, Math.min(...vals) - 5), max = Math.min(100, Math.max(...vals) + 5), span = Math.max(1, max - min);
  const xs = (i: number) => padL + (i / (points.length - 1)) * (w - padL - 6);
  const ys = (v: number) => ht - padB - ((v - min) / span) * (ht - padB - 6);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.avg).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const fmt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <svg width={w} height={ht} style={{ overflow: "visible" }}>
      {[min, max].map((g) => (
        <g key={g}>
          <line x1={padL} y1={ys(g)} x2={w - 6} y2={ys(g)} stroke="#e3ddcc" strokeWidth={1} />
          <text x={padL - 5} y={ys(g) + 3} textAnchor="end" fontFamily="'IBM Plex Mono', monospace" fontSize={9} fill="#9a9486">{g}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke={heat(last.avg)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={xs(i)} cy={ys(p.avg)} r={i === points.length - 1 ? 3.5 : 2} fill={heat(p.avg)} />)}
      <text x={xs(0)} y={ht - 2} textAnchor="start" fontFamily="'IBM Plex Mono', monospace" fontSize={9} fill="#9a9486">{fmt(points[0].taken_on)}</text>
      <text x={w - 6} y={ht - 2} textAnchor="end" fontFamily="'IBM Plex Mono', monospace" fontSize={9} fill="#9a9486">{fmt(last.taken_on)}</text>
    </svg>
  );
}

function PrintRows({ rows, empty, rule, dim, ink, faint }: { rows: { label: string; right: string; col: string }[]; empty: string; rule: string; dim: string; ink: string; faint: string }) {
  if (rows.length === 0) return <div style={{ border: `1px solid ${rule}`, borderRadius: 6, padding: "12px 14px", fontSize: 12, color: dim, breakInside: "avoid" }}>{empty}</div>;
  return (
    <div style={{ border: `1px solid ${rule}`, borderRadius: 6, overflow: "hidden", breakInside: "avoid" }}>
      {rows.map((r, i) => (
        <div key={r.label + i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 12px", borderTop: i === 0 ? "none" : `1px solid ${rule}`, fontSize: 13, color: ink }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: r.col }}>{r.right}</span>
        </div>
      ))}
    </div>
  );
}
