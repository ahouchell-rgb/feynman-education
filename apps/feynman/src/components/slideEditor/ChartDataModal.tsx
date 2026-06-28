"use client";
import { useState } from "react";
import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { CHART_COLORS } from "@/components/SlideStage";

interface ChartDataModalProps {
  el: any;
  onApply: (data: { labels: string[]; series: any[] }) => void;
  onCancel: () => void;
}

/* Chart data editor: categories down the side, one column per series
   (name + colour + a value per category). Add/remove either dimension. */
export function ChartDataModal({ el, onApply, onCancel }: ChartDataModalProps) {
  const [labels, setLabels] = useState(() => (el.labels?.length ? [...el.labels] : ["A", "B", "C"]));
  const [series, setSeries] = useState(() => (el.series?.length ? el.series.map((s) => ({ name: s.name || "", color: s.color || CHART_COLORS[0], values: [...(s.values || [])] })) : [{ name: "Series 1", color: CHART_COLORS[0], values: [1, 2, 3] }]));

  const inp: CSSProperties = { padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12, width: "100%", boxSizing: "border-box" };
  const setLabel = (i, v) => setLabels((a) => a.map((x, j) => (j === i ? v : x)));
  const setVal = (si, ri, v) => setSeries((a) => a.map((s, j) => (j === si ? { ...s, values: labels.map((_, ri2) => (ri2 === ri ? v : (s.values[ri2] ?? ""))) } : s)));
  const setSName = (si, v) => setSeries((a) => a.map((s, j) => (j === si ? { ...s, name: v } : s)));
  const setSColor = (si, v) => setSeries((a) => a.map((s, j) => (j === si ? { ...s, color: v } : s)));
  const addRow = () => { setLabels((a) => [...a, `Cat ${a.length + 1}`]); setSeries((a) => a.map((s) => ({ ...s, values: [...s.values, 0] }))); };
  const delRow = (i) => { if (labels.length <= 1) return; setLabels((a) => a.filter((_, j) => j !== i)); setSeries((a) => a.map((s) => ({ ...s, values: s.values.filter((_, j) => j !== i) }))); };
  const addSeries = () => setSeries((a) => [...a, { name: `Series ${a.length + 1}`, color: CHART_COLORS[a.length % CHART_COLORS.length], values: labels.map(() => 0) }]);
  const delSeries = (si) => setSeries((a) => (a.length <= 1 ? a : a.filter((_, j) => j !== si)));
  const apply = () => onApply({ labels, series: series.map((s) => ({ ...s, values: labels.map((_, i) => +s.values[i] || 0) })) });

  return (
    <div onMouseDown={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 18, maxWidth: 720, maxHeight: "84vh", overflow: "auto" }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.dim, marginBottom: 12 }}>Chart data</div>
        <table style={{ borderCollapse: "collapse", fontFamily: C.sans }}>
          <thead>
            <tr>
              <th style={{ padding: 4, fontSize: 11, color: C.dim, textAlign: "left" }}>Category</th>
              {series.map((s, si) => (
                <th key={si} style={{ padding: 4, minWidth: 90 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="color" value={s.color} onChange={(e) => setSColor(si, e.target.value)} style={{ width: 22, height: 22, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
                    <input value={s.name} onChange={(e) => setSName(si, e.target.value)} style={{ ...inp, width: 80 }} />
                    {series.length > 1 && <button onClick={() => delSeries(si)} title="Remove series" style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>}
                  </div>
                </th>
              ))}
              <th style={{ padding: 4 }}><button onClick={addSeries} style={{ fontSize: 11, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer" }}>+ Series</button></th>
            </tr>
          </thead>
          <tbody>
            {labels.map((lab, ri) => (
              <tr key={ri}>
                <td style={{ padding: 3 }}><input value={lab} onChange={(e) => setLabel(ri, e.target.value)} style={{ ...inp, width: 110 }} /></td>
                {series.map((s, si) => (
                  <td key={si} style={{ padding: 3 }}><input type="number" value={s.values[ri] ?? 0} onChange={(e) => setVal(si, ri, e.target.value)} style={inp} /></td>
                ))}
                <td style={{ padding: 3 }}>{labels.length > 1 && <button onClick={() => delRow(ri)} title="Remove row" style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addRow} style={{ marginTop: 8, fontSize: 11, padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer" }}>+ Category</button>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <Btn v="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn onClick={apply}>Apply</Btn>
        </div>
      </div>
    </div>
  );
}
