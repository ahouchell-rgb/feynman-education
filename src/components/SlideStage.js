"use client";
import { useState, useEffect } from "react";
import { C } from "@/lib/theme";

/* The fixed virtual canvas every element is positioned within. */
export const VW = 960, VH = 540;

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

/* Visual style for box-like elements (text / rect / image), in virtual
   coordinates. Shared by the editor and all read-only views. Arrows are drawn
   separately by <ArrowSvg/> since they're defined by two points, not a box. */
export function elStyle(el) {
  const base = { position: "absolute", left: el.x, top: el.y, width: el.width };
  if (el.type === "text")
    return {
      ...base, height: el.height,
      fontSize: el.fontSize, color: el.color,
      fontFamily: el.font || C.sans,
      fontWeight: el.bold ? 700 : 400,
      fontStyle: el.italic ? "italic" : "normal",
      textAlign: el.align || "left",
      background: el.bg || "transparent",
      padding: el.bg ? "6px 10px" : 0,
      borderRadius: el.bg ? 8 : 0,
      boxSizing: "border-box",
      lineHeight: 1.15, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word",
    };
  if (el.type === "rect")
    return {
      ...base, height: el.height, background: el.fill,
      borderRadius: el.radius ?? 6,
      border: el.stroke ? `${el.strokeW || 3}px solid ${el.stroke}` : "none",
      boxSizing: "border-box",
    };
  if (el.type === "image")
    return { ...base, height: el.height };
  if (el.type === "timer")
    return {
      ...base, height: el.height,
      background: el.fill || "#1a1714", color: el.color || "#ffffff",
      borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
      fontSize: el.fontSize || 72, boxSizing: "border-box",
    };
  return base;
}

/* Inner content of a box element. */
export function ElInner({ el }) {
  if (el.type === "text") return el.text;
  if (el.type === "timer") return fmtTime(el.duration ?? 300);
  if (el.type === "image")
    return <img src={el.src} alt="" draggable={false}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />;
  return null;
}

/* A countdown that runs while a slide is presented. Restarts on mount (the
   present view keys each slide by index, so entering a slide restarts it). */
function LiveTimer({ el }) {
  const [rem, setRem] = useState(el.duration ?? 300);
  useEffect(() => {
    setRem(el.duration ?? 300);
    const t = setInterval(() => setRem((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [el.duration]);
  return <div style={{ ...elStyle(el), color: rem <= 10 ? "#ff5a4a" : (el.color || "#fff") }}>{fmtTime(rem)}</div>;
}

/* An arrow, defined by two endpoints. Read-only by default; the editor passes
   `hitProps` to add a fat transparent grab-line and `selected` to highlight. */
export function ArrowSvg({ el, selected, hitProps }) {
  const color = el.color || C.text;
  const w = el.thickness || 5;
  const mid = "ah-" + el.id;
  return (
    <svg width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`}
      style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }}>
      <defs>
        <marker id={mid} markerWidth="10" markerHeight="10" refX="6.5" refY="3.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L7,3.5 L0,7 Z" fill={color} />
        </marker>
      </defs>
      {selected && (
        <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={C.accent} strokeOpacity="0.25"
          strokeWidth={w + 8} strokeLinecap="round" />
      )}
      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={color} strokeWidth={w}
        strokeLinecap="round" markerEnd={`url(#${mid})`} />
      {hitProps && (
        <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="transparent"
          strokeWidth={Math.max(w + 16, 20)} strokeLinecap="round"
          style={{ pointerEvents: "stroke", cursor: "move" }} {...hitProps} />
      )}
    </svg>
  );
}

/* How many elements on a slide are marked "reveal on click". */
export const revealCount = (slide) => (slide?.elements || []).filter((e) => e.reveal).length;

/* A non-interactive slide scaled to `width` px. Used for thumbnails, the
   editor's rail, and present mode. `reveal` caps how many reveal-flagged
   elements are shown (in order) — Infinity shows everything. */
export function StaticSlide({ slide, width, style, reveal = Infinity, live = false }) {
  const scale = width / VW;
  let rIdx = 0;
  return (
    <div style={{ width: VW * scale, height: VH * scale, position: "relative", ...style }}>
      <div style={{ width: VW, height: VH, position: "absolute", top: 0, left: 0,
                    transform: `scale(${scale})`, transformOrigin: "top left",
                    background: slide?.background || "#fff", overflow: "hidden" }}>
        {(slide?.elements || []).map((el) => {
          if (el.reveal) {
            const show = rIdx < reveal;
            rIdx += 1;
            if (!show) return null;
          }
          if (el.type === "arrow") return <ArrowSvg key={el.id} el={el} />;
          if (el.type === "timer" && live) return <LiveTimer key={el.id} el={el} />;
          return <div key={el.id} style={elStyle(el)}><ElInner el={el} /></div>;
        })}
      </div>
    </div>
  );
}
