"use client";
import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { toSubscript, toSuperscript } from "@/lib/formula";
import { FONTS } from "./constants";

interface PropsBarProps {
  selEl: any;
  slide: any;
  patchEl: (id: string, patch: any) => void;
  setSlideBg: (hex: string) => void;
  onCrop: () => void;
  onResetCrop: () => void;
  onEditChart: () => void;
}

/* ── Properties bar: element controls, or slide controls when nothing is selected ── */
export function PropsBar({ selEl, slide, patchEl, setSlideBg, onCrop, onResetCrop, onEditChart }: PropsBarProps) {
  const wrap: CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 12px",
                 background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.muted };
  const tag = (t) => <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10, color: C.dim }}>{t}</span>;
  const color = (val, on) => <input type="color" value={val} onChange={(e) => on(e.target.value)} style={{ width: 30, height: 24, border: "none", background: "none", cursor: "pointer", padding: 0 }} />;
  const num = (val, on) => <input type="number" value={val} onChange={(e) => on(+e.target.value || 1)} style={{ width: 52, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12 }} />;
  const toggle = (active, label, on) => (
    <button onClick={on} style={{ width: 28, height: 26, borderRadius: 4, cursor: "pointer", fontSize: 13,
      border: `1px solid ${active ? C.accent : C.border}`, background: active ? C.bg : "#fff", color: C.text,
      fontWeight: label === "B" ? 700 : 400, fontStyle: label === "I" ? "italic" : "normal" }}>{label}</button>
  );

  if (!selEl) {
    const hex = slide.background?.startsWith?.("#") ? slide.background : "#ffffff";
    return (
      <div style={wrap}>
        {tag("slide")}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>background {color(hex, setSlideBg)}</label>
        <button onClick={() => setSlideBg("#ffffff")} style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>white</button>
        <span style={{ color: C.dim }}>· click an element to style it · Delete to remove · arrows to nudge</span>
      </div>
    );
  }

  const P = (patch) => patchEl(selEl.id, patch);
  const selStyle = { padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12, background: "#fff" };
  const pill = (active) => ({ height: 26, padding: "0 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, border: `1px solid ${active ? C.accent : C.border}`, background: active ? C.bg : "#fff", color: C.text });
  const opacityCtl = (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>opacity
      <input type="range" min={20} max={100} value={Math.round((selEl.opacity ?? 1) * 100)} onChange={(e) => P({ opacity: +e.target.value / 100 })} style={{ width: 70 }} />
    </label>
  );

  if (selEl.type === "text") {
    return (
      <div style={wrap}>
        {tag("text")}
        <select value={selEl.font || FONTS[0].css}
          onChange={(e) => { const f = FONTS.find(x => x.css === e.target.value) || FONTS[0]; P({ font: f.css, fontFace: f.face }); }}
          style={{ padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12, background: "#fff" }}>
          {FONTS.map(f => <option key={f.label} value={f.css}>{f.label}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>size {num(selEl.fontSize, (v) => P({ fontSize: v }))}</label>
        {toggle(selEl.bold, "B", () => P({ bold: !selEl.bold }))}
        {toggle(selEl.italic, "I", () => P({ italic: !selEl.italic }))}
        <span style={{ display: "flex", gap: 4 }}>
          {["left", "center", "right"].map(a =>
            <button key={a} onClick={() => P({ align: a })}
              style={{ width: 28, height: 26, borderRadius: 4, cursor: "pointer", border: `1px solid ${selEl.align === a || (!selEl.align && a === "left") ? C.accent : C.border}`, background: "#fff", color: C.text }}>
              {a === "left" ? "⬅" : a === "center" ? "↔" : "➡"}
            </button>)}
        </span>
        <span style={{ display: "flex", gap: 4 }}>
          <button onClick={() => P({ text: toSubscript(selEl.text) })} title="Subscript numbers — H2O → H₂O"
            style={{ height: 26, padding: "0 7px", borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.mono, fontSize: 12 }}>X₂</button>
          <button onClick={() => P({ text: toSuperscript(selEl.text) })} title="Superscript after ^ — 10^23 → 10²³"
            style={{ height: 26, padding: "0 7px", borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.mono, fontSize: 12 }}>X²</button>
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>colour {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          highlight {color(selEl.bg?.startsWith("#") ? selEl.bg : "#2e3a5f", (v) => P({ bg: v }))}
          {selEl.bg && <button onClick={() => P({ bg: null })} style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>none</button>}
        </label>
        <button onClick={() => P({ shadow: !selEl.shadow })} style={pill(selEl.shadow)}>shadow</button>
        {opacityCtl}
      </div>
    );
  }

  if (selEl.type === "rect") {
    const shape = selEl.shape || "rect";
    return (
      <div style={wrap}>
        {tag("shape")}
        <select value={shape} onChange={(e) => P({ shape: e.target.value })} style={selStyle}>
          <option value="rect">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="triangle">Triangle</option>
          <option value="star">Star</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>fill {color(selEl.fill?.startsWith("#") ? selEl.fill : "#5e7c4b", (v) => P({ fill: v }))}</label>
        {(shape === "rect" || shape === "ellipse") && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              border {color(selEl.stroke || "#1a1714", (v) => P({ stroke: v }))}
              {selEl.stroke && <button onClick={() => P({ stroke: null })} style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>none</button>}
            </label>
            {selEl.stroke && <button onClick={() => P({ dashed: !selEl.dashed })} style={pill(selEl.dashed)}>dashed</button>}
          </>
        )}
        {shape === "rect" && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>round {num(selEl.radius ?? 6, (v) => P({ radius: Math.max(0, v) }))}</label>}
        <button onClick={() => P({ shadow: !selEl.shadow })} style={pill(selEl.shadow)}>shadow</button>
        {opacityCtl}
      </div>
    );
  }

  if (selEl.type === "arrow") {
    return (
      <div style={wrap}>
        {tag("arrow")}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>colour {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>thickness {num(selEl.thickness || 6, (v) => P({ thickness: Math.max(1, v) }))}</label>
        <span style={{ color: C.dim }}>· drag the round ends to aim</span>
      </div>
    );
  }

  if (selEl.type === "timer") {
    const d = selEl.duration ?? 300;
    const mm = Math.floor(d / 60), ss = d % 60;
    const setDur = (sec) => P({ duration: Math.max(0, Math.round(sec)) });
    const tnum = (val, on) => <input type="number" value={val} min={0} onChange={(e) => on(Math.max(0, +e.target.value || 0))}
      style={{ width: 48, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12 }} />;
    return (
      <div style={wrap}>
        {tag("timer")}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>min {tnum(mm, (v) => setDur(v * 60 + ss))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>sec {tnum(ss, (v) => setDur(mm * 60 + (v % 60)))}</label>
        <span style={{ display: "flex", gap: 4 }}>
          {[1, 2, 5, 10].map((m) => (
            <button key={m} onClick={() => setDur(m * 60)}
              style={{ height: 26, padding: "0 8px", borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontFamily: C.mono, fontSize: 11 }}>{m}m</button>
          ))}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>face {color(selEl.fill?.startsWith("#") ? selEl.fill : "#1a1714", (v) => P({ fill: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>digits {color(selEl.color?.startsWith("#") ? selEl.color : "#ffffff", (v) => P({ color: v }))}</label>
        <span style={{ color: C.dim }}>· counts down live in Present</span>
      </div>
    );
  }

  if (selEl.type === "table") {
    const resize = (rows, cols) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => selEl.cells?.[r]?.[c] ?? ""));
    return (
      <div style={wrap}>
        {tag("table")}
        <span style={{ color: C.dim }}>{selEl.rows}×{selEl.cols}</span>
        <button onClick={() => P({ rows: selEl.rows + 1, cells: resize(selEl.rows + 1, selEl.cols) })} style={pill(false)}>+ Row</button>
        <button onClick={() => selEl.rows > 1 && P({ rows: selEl.rows - 1, cells: resize(selEl.rows - 1, selEl.cols) })} style={pill(false)}>− Row</button>
        <button onClick={() => P({ cols: selEl.cols + 1, cells: resize(selEl.rows, selEl.cols + 1) })} style={pill(false)}>+ Col</button>
        <button onClick={() => selEl.cols > 1 && P({ cols: selEl.cols - 1, cells: resize(selEl.rows, selEl.cols - 1) })} style={pill(false)}>− Col</button>
        <button onClick={() => P({ headerRow: !selEl.headerRow })} style={pill(selEl.headerRow)}>header</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>size {num(selEl.fontSize || 22, (v) => P({ fontSize: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>text {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>lines {color(selEl.borderColor || "#9a9486", (v) => P({ borderColor: v }))}</label>
        {selEl.headerRow && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>header {color(selEl.headerBg || "#1a1714", (v) => P({ headerBg: v }))}</label>}
        <span style={{ color: C.dim }}>· double-click to type</span>
      </div>
    );
  }

  if (selEl.type === "image") {
    return (
      <div style={wrap}>
        {tag("image")}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }} title="Describe this image for screen-reader and low-vision pupils. Leave blank if purely decorative.">
          alt
          <input value={selEl.alt || ""} onChange={(e) => P({ alt: e.target.value })} placeholder="Describe this image"
            aria-label="Image description (alt text)"
            style={{ width: 150, padding: "5px 7px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12 }} />
        </label>
        <Btn v="ghost" onClick={onCrop} style={{ fontSize: 12, padding: "5px 12px" }}>Crop</Btn>
        {selEl.crop && <Btn v="ghost" onClick={onResetCrop} style={{ fontSize: 12, padding: "5px 12px" }}>Reset crop</Btn>}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>round {num(selEl.radius ?? 0, (v) => P({ radius: Math.max(0, v) }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          border {color(selEl.stroke || "#1a1714", (v) => P({ stroke: v }))}
          {selEl.stroke && <button onClick={() => P({ stroke: null })} style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>none</button>}
        </label>
        <button onClick={() => P({ shadow: !selEl.shadow })} style={pill(selEl.shadow)}>shadow</button>
        {opacityCtl}
      </div>
    );
  }

  if (selEl.type === "chart") {
    return (
      <div style={wrap}>
        {tag("chart")}
        <select value={selEl.chartType || "bar"} onChange={(e) => P({ chartType: e.target.value })} style={selStyle}>
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
        </select>
        <input value={selEl.title || ""} onChange={(e) => P({ title: e.target.value })} placeholder="Title"
          style={{ width: 120, padding: "5px 7px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12 }} />
        <Btn v="soft" onClick={onEditChart} style={{ fontSize: 12, padding: "5px 12px" }}>Edit data…</Btn>
        {selEl.chartType !== "pie" && <button onClick={() => P({ showLegend: !(selEl.showLegend !== false) })} style={pill(selEl.showLegend !== false)}>legend</button>}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>labels {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <span style={{ color: C.dim }}>· {(selEl.series || []).length} series × {(selEl.labels || []).length} cats</span>
      </div>
    );
  }

  if (selEl.type === "equation") {
    return (
      <div style={{ ...wrap, alignItems: "flex-start" }}>
        {tag("equation")}
        <textarea value={selEl.latex || ""} onChange={(e) => P({ latex: e.target.value })} spellCheck={false}
          placeholder="LaTeX, e.g. \\frac{1}{2}mv^2"
          style={{ width: 280, height: 56, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: C.mono, fontSize: 12, background: "#fff", resize: "vertical" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>size {num(selEl.fontSize || 36, (v) => P({ fontSize: Math.max(8, v) }))}</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>colour {color(selEl.color?.startsWith("#") ? selEl.color : "#1a1714", (v) => P({ color: v }))}</label>
        <span style={{ display: "flex", gap: 4 }}>
          {["left", "center", "right"].map(a =>
            <button key={a} onClick={() => P({ align: a })}
              style={{ width: 28, height: 26, borderRadius: 4, cursor: "pointer", border: `1px solid ${selEl.align === a || (!selEl.align && a === "center") ? C.accent : C.border}`, background: "#fff", color: C.text }}>
              {a === "left" ? "⬅" : a === "center" ? "↔" : "➡"}
            </button>)}
        </span>
        <a href="https://katex.org/docs/supported.html" target="_blank" rel="noreferrer" style={{ color: C.dim, fontSize: 11 }}>LaTeX help ↗</a>
      </div>
    );
  }

  return (
    <div style={wrap}>{tag(selEl.type)}<span style={{ color: C.dim }}>drag the corners to resize</span></div>
  );
}
