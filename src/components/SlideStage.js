"use client";
import { useState, useEffect, useRef } from "react";
import { C } from "@/lib/theme";

/* The fixed virtual canvas every element is positioned within. */
export const VW = 960, VH = 540;

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

const SHADOW = "0 6px 18px rgba(0,0,0,0.28)";
const STAR = "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";
const TRIANGLE = "polygon(50% 0%, 0% 100%, 100% 100%)";

/* Visual style for box-like elements (text / rect / image), in virtual
   coordinates. Shared by the editor and all read-only views. Arrows are drawn
   separately by <ArrowSvg/> since they're defined by two points, not a box. */
export function elStyle(el) {
  const rot = el.rotation ? `rotate(${el.rotation}deg)` : undefined;
  const base = { position: "absolute", left: el.x, top: el.y, width: el.width, opacity: el.opacity ?? 1, transform: rot };
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
      boxShadow: el.shadow ? SHADOW : undefined,
      boxSizing: "border-box",
      lineHeight: 1.15, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word",
    };
  if (el.type === "rect") {
    const shape = el.shape || "rect";
    const border = el.stroke ? `${el.strokeW || 3}px ${el.dashed ? "dashed" : "solid"} ${el.stroke}` : "none";
    const s = { ...base, height: el.height, background: el.fill, boxShadow: el.shadow ? SHADOW : undefined, boxSizing: "border-box" };
    if (shape === "ellipse") return { ...s, borderRadius: "50%", border };
    if (shape === "triangle") return { ...s, clipPath: TRIANGLE };
    if (shape === "star") return { ...s, clipPath: STAR };
    return { ...s, borderRadius: el.radius ?? 6, border };
  }
  if (el.type === "image")
    return {
      ...base, height: el.height,
      borderRadius: el.radius ?? 0, overflow: "hidden",
      border: el.stroke ? `${el.strokeW || 3}px solid ${el.stroke}` : "none",
      boxShadow: el.shadow ? SHADOW : undefined, boxSizing: "border-box",
    };
  if (el.type === "video" || el.type === "visualiser" || el.type === "retrieval")
    return { ...base, height: el.height, background: "#0f0f12", borderRadius: 8, overflow: "hidden", boxSizing: "border-box" };
  if (el.type === "table")
    return { ...base, height: el.height, boxSizing: "border-box" };
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

/* Inner content of a box element (static / editor view). */
export function ElInner({ el }) {
  if (el.type === "text") return el.text;
  if (el.type === "timer") return fmtTime(el.duration ?? 300);
  if (el.type === "image") return <ImageInner el={el} />;
  if (el.type === "table") return <TableView el={el} />;
  if (el.type === "video") return <Placeholder icon="▶" label={el.title || el.src || "Video"} />;
  if (el.type === "visualiser") return <Placeholder icon="📷" label="Visualiser — live camera in Present" />;
  if (el.type === "retrieval") return <Placeholder icon="📚" label="Retrieval — live app in Present" />;
  return null;
}

/* Image, honouring an optional crop ({x,y,w,h} as 0–1 fractions of the image). */
function ImageInner({ el }) {
  if (el.crop) {
    const { x, y, w, h } = el.crop;
    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
        <img src={el.src} alt="" draggable={false}
          style={{ position: "absolute", width: `${100 / w}%`, height: `${100 / h}%`,
                   left: `${-(x * 100) / w}%`, top: `${-(y * 100) / h}%`,
                   objectFit: "fill", display: "block", pointerEvents: "none" }} />
      </div>
    );
  }
  return <img src={el.src} alt="" draggable={false}
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />;
}

/* Read-only table (editor display, thumbnails, present). */
export function TableView({ el }) {
  const rows = el.rows || 1, cols = el.cols || 1, cells = el.cells || [];
  const border = el.borderColor || "#9a9486";
  const headerBg = el.headerBg || "#1a1714", headerColor = el.headerColor || "#ffffff";
  return (
    <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed",
                    fontFamily: el.font || C.sans, fontSize: el.fontSize || 22, color: el.color || "#1a1714" }}>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => {
              const head = el.headerRow && r === 0;
              return (
                <td key={c} style={{ border: `1px solid ${border}`, padding: "4px 9px", verticalAlign: "middle",
                                     background: head ? headerBg : "transparent", color: head ? headerColor : undefined,
                                     fontWeight: head ? 700 : 400, overflow: "hidden", wordBreak: "break-word" }}>
                  {cells[r]?.[c] || ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Placeholder({ icon, label }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 8, color: "#cfcfd6", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 10 }}>
      <span style={{ fontSize: 34 }}>{icon}</span>
      <span style={{ fontSize: 13, opacity: 0.8, maxWidth: "92%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

/* Live video embed (Present only). stopPropagation so play-clicks don't advance. */
function VideoFrame({ el }) {
  const stop = (e) => e.stopPropagation();
  if (el.provider === "file") {
    return <video src={el.embed || el.src} controls onClick={stop} onMouseDown={stop}
      style={{ width: "100%", height: "100%", display: "block", background: "#000" }} />;
  }
  return <iframe src={el.embed} title="video" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
    onClick={stop} onMouseDown={stop}
    style={{ width: "100%", height: "100%", border: "none", display: "block" }} />;
}

/* Live embed of the retrieval app (Present only). The teacher picks topics
   inside the embed. An "Open ↗" escape hatch covers the case where the
   retrieval app blocks embedding (X-Frame-Options / CSP frame-ancestors). */
function RetrievalFrame({ el }) {
  const stop = (e) => e.stopPropagation();
  const url = el.url || "https://retrieval-app.com";
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#fff" }} onClick={stop} onMouseDown={stop}>
      <iframe src={url} title="retrieval"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer-when-downgrade"
        style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff" }} />
      <a href={url} target="_blank" rel="noreferrer" onClick={stop}
        style={{ position: "absolute", top: 6, right: 8, fontSize: 11, fontFamily: "monospace", color: "#333", background: "rgba(255,255,255,0.88)", padding: "2px 8px", borderRadius: 6, textDecoration: "none" }}>Open ↗</a>
    </div>
  );
}

/* Live webcam (Present only), with a device picker remembered per browser. */
function LiveCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(() => { try { return localStorage.getItem("sk_visualiser_device") || ""; } catch { return ""; } });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) throw new Error("This browser can't access the camera.");
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        const s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((d) => d.kind === "videoinput"));
      } catch (e) { if (!cancelled) setError(e?.message || "Couldn't access the camera."); }
    })();
    return () => { cancelled = true; if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, [deviceId]);

  const pick = (id) => { setDeviceId(id); try { localStorage.setItem("sk_visualiser_device", id); } catch {} };

  if (error) return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#e88", fontFamily: "system-ui", fontSize: 13, textAlign: "center", padding: 12 }}>📷 {error}</div>;
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000" }} onClick={(e) => e.stopPropagation()}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
      {devices.length > 1 && (
        <select value={deviceId} onChange={(e) => pick(e.target.value)}
          style={{ position: "absolute", top: 8, right: 8, fontSize: 12, padding: "4px 6px", borderRadius: 6, opacity: 0.85, border: "none" }}>
          <option value="">Default camera</option>
          {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
        </select>
      )}
    </div>
  );
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
          if (el.type === "video" && live) return <div key={el.id} style={elStyle(el)}><VideoFrame el={el} /></div>;
          if (el.type === "visualiser" && live) return <div key={el.id} style={elStyle(el)}><LiveCamera /></div>;
          if (el.type === "retrieval" && live) return <div key={el.id} style={elStyle(el)}><RetrievalFrame el={el} /></div>;
          return <div key={el.id} style={elStyle(el)}><ElInner el={el} /></div>;
        })}
      </div>
    </div>
  );
}
