"use client";
import { C } from "@/lib/theme";

// Per-objective mastery, blended across retrieval + common-assessment QLA.
// One weakest-first table sold to SLT and trust leaders off the same payload
// (school/trust overview routes attach `objectiveMastery`). Source chips show
// whether a row is backed by retrieval (R), assessment (A) or both.

export interface BlendedObjectiveRow {
  key: string;
  label: string;
  blendedPct: number;
  marked: number;
  sources: ("retrieval" | "assessment")[];
  subject_slug?: string | null;
  strand?: string | null;
  retrieval?: { pct: number; marked: number };
  assessment?: { pct: number; marked: number; students: number };
}

function heat(pct: number) {
  if (pct < 40) return C.red; if (pct < 65) return C.amb; return C.grn;
}

function SourceChip({ kind }: { kind: "retrieval" | "assessment" }) {
  const r = kind === "retrieval";
  return (
    <span
      title={r ? "Retrieval practice" : "Common assessment (QLA)"}
      style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: r ? C.grn : C.amb, background: C.surface, border: `1px solid ${C.rule}`, borderRadius: 3, padding: "1px 5px" }}>
      {r ? "RET" : "QLA"}
    </span>
  );
}

export function ObjectiveMasteryPanel({ rows, limit = 14, drillBase }: { rows?: BlendedObjectiveRow[]; limit?: number; drillBase?: string }) {
  const list = (rows || []).slice(0, limit);
  if (list.length === 0) {
    return <div style={{ padding: "20px", color: C.dim, fontFamily: C.mono, fontSize: 12, marginBottom: 24 }}>No objective-level data yet — tag assessment questions to objectives or link retrieval classes.</div>;
  }
  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 32 }}>
      {list.map((o, i) => (
        <div key={o.key + i} style={{ display: "grid", gridTemplateColumns: "1fr 150px 110px", gap: 14, alignItems: "center", padding: "11px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, color: C.text, display: "flex", alignItems: "center", gap: 7 }}>
              {drillBase ? (
                <a href={`${drillBase}?topic=${encodeURIComponent(o.label)}`} title="See the pupils below threshold on this objective"
                  style={{ color: C.text, textDecoration: "none", borderBottom: `1px dotted ${C.dim}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</a>
              ) : (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
              )}
              {o.sources.map((s) => <SourceChip key={s} kind={s} />)}
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginTop: 3 }}>
              {o.strand ? `${o.strand} · ` : ""}
              {o.retrieval && <>retrieval {o.retrieval.pct}%</>}
              {o.retrieval && o.assessment && " · "}
              {o.assessment && <>assessment {o.assessment.pct}%{o.assessment.students ? ` (${o.assessment.students} pupils)` : ""}</>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", flex: 1, minWidth: 60 }}>
              <div style={{ width: `${Math.max(2, o.blendedPct)}%`, height: "100%", background: heat(o.blendedPct), opacity: 0.75 }} />
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: heat(o.blendedPct), fontWeight: 600, minWidth: 34, textAlign: "right" }}>{o.blendedPct}%</span>
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, textAlign: "right" }}>{o.marked.toLocaleString()} marks</span>
        </div>
      ))}
    </div>
  );
}
