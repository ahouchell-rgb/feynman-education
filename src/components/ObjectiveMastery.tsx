"use client";
import { useEffect, useState } from "react";
import { ret } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Card } from "@/lib/primitives";

interface Props {
  unitId: string;
  contextClass?: { name?: string; retrieval_class_ids?: string[] } | null;
}
interface Row {
  objective_id: string;
  objective_title: string;
  pct: number | null;
  retrieval_pct: number | null;
  paper_pct: number | null;
  marks: number;
  pupils: number;
}

/**
 * ObjectiveMastery — the mastery graph made visible for this unit. For the class
 * being taught, shows each objective's BLENDED mastery (retrieval practice + past-paper
 * exam marks, one mark-weighted %, ret.objectiveBreakdown → class_objective_breakdown),
 * weakest first, with the retrieval/exam split. Read-only overview; the gap panels
 * (UnitGaps / PaperGaps) below turn the weak ones into feedforward.
 *
 * Renders nothing unless the lesson has a linked retrieval class with some marked data
 * mapped to objectives — so it stays out of the way until there's a graph to show.
 */
export function ObjectiveMastery({ unitId, contextClass }: Props) {
  const retIds = contextClass?.retrieval_class_ids || [];
  const [rows, setRows] = useState<Row[] | null>(null); // null = loading

  useEffect(() => {
    let live = true;
    if (!unitId || retIds.length === 0) { setRows([]); return; }
    setRows(null);
    ret.objectiveBreakdown(retIds, unitId)
      .then((r) => { if (live) setRows(r as Row[]); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, retIds.join(",")]);

  if (retIds.length === 0) return null;        // no linked retrieval class
  if (rows && rows.length === 0) return null;  // nothing mapped to objectives yet

  return (
    <Card style={{ padding: 16, marginBottom: 24, borderLeft: `3px solid ${C.blu}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>
          Objective mastery{contextClass?.name ? ` · ${contextClass.name}` : ""}
        </div>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>retrieval + exam · blended</span>
      </div>

      {rows === null ? (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading mastery…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {rows.map((r) => {
            const pct = r.pct == null ? null : Math.round(r.pct);
            const col = pct == null ? C.dim : pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red;
            return (
              <div key={r.objective_id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ fontFamily: C.serif, fontSize: 18, fontWeight: 600, color: col, minWidth: 46, textAlign: "right" }}>{pct == null ? "—" : `${pct}%`}</span>
                <span style={{ flex: 1, minWidth: 0, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.objective_title}</span>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, flexShrink: 0, display: "flex", gap: 8 }}>
                  {r.retrieval_pct != null ? <span title="retrieval practice">R {Math.round(r.retrieval_pct)}%</span> : null}
                  {r.paper_pct != null ? <span title="past-paper exam marks" style={{ color: C.amb }}>E {Math.round(r.paper_pct)}%</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
