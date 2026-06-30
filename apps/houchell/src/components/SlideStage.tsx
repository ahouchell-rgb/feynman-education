"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { C } from "@/lib/theme";
import { sanitizeHtml } from "@/lib/sanitize";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RETRIEVAL_ORIGIN } from "@/lib/interactive";

/* The fixed virtual canvas every element is positioned within. */
export const VW = 960, VH = 540;

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

const SHADOW = "0 6px 18px rgba(0,0,0,0.28)";
const STAR = "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";
const TRIANGLE = "polygon(50% 0%, 0% 100%, 100% 100%)";

// Guard against a non-finite coordinate (e.g. an Infinity/NaN x from a broken
// import or AI-generated deck) reaching a CSS length — React floods the dev
// console with "`Infinity` is an invalid value for the `left` css property".
const finite = (v) => (typeof v === "number" && !Number.isFinite(v) ? 0 : v);

/* Visual style for box-like elements (text / rect / image), in virtual
   coordinates. Shared by the editor and all read-only views. Arrows are drawn
   separately by <ArrowSvg/> since they're defined by two points, not a box. */
export function elStyle(el: any): CSSProperties {
  const rot = el.rotation ? `rotate(${el.rotation}deg)` : undefined;
  const base: CSSProperties = { position: "absolute", left: finite(el.x), top: finite(el.y), width: finite(el.width), opacity: el.opacity ?? 1, transform: rot };
  if (el.type === "text")
    return {
      ...base, height: finite(el.height),
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
      lineHeight: 1.15, overflow: "hidden", whiteSpace: el.rich ? "normal" : "pre-wrap", wordBreak: "break-word",
    };
  if (el.type === "rect") {
    const shape = el.shape || "rect";
    const border = el.stroke ? `${el.strokeW || 3}px ${el.dashed ? "dashed" : "solid"} ${el.stroke}` : "none";
    const s: CSSProperties = { ...base, height: finite(el.height), background: el.fill, boxShadow: el.shadow ? SHADOW : undefined, boxSizing: "border-box" };
    if (shape === "ellipse") return { ...s, borderRadius: "50%", border };
    if (shape === "triangle") return { ...s, clipPath: TRIANGLE };
    if (shape === "star") return { ...s, clipPath: STAR };
    return { ...s, borderRadius: el.radius ?? 6, border };
  }
  if (el.type === "image")
    return {
      ...base, height: finite(el.height),
      borderRadius: el.radius ?? 0, overflow: "hidden",
      border: el.stroke ? `${el.strokeW || 3}px solid ${el.stroke}` : "none",
      boxShadow: el.shadow ? SHADOW : undefined, boxSizing: "border-box",
    };
  if (el.type === "chart")
    return { ...base, height: finite(el.height), background: el.bg || "transparent", overflow: "hidden", boxSizing: "border-box" };
  if (el.type === "equation")
    return {
      ...base, height: finite(el.height),
      display: "flex", alignItems: "center",
      justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center",
      color: el.color || "#1a1714", fontSize: el.fontSize || 36,
      background: el.bg || "transparent", padding: el.bg ? "6px 12px" : 0, borderRadius: el.bg ? 8 : 0,
      overflow: "visible", boxSizing: "border-box", // never clip maths; size with fontSize
    };
  if (el.type === "html")
    return {
      ...base, height: finite(el.height),
      background: "#ffffff", borderRadius: el.radius ?? 8, overflow: "hidden",
      border: el.stroke ? `${el.strokeW || 3}px solid ${el.stroke}` : "none",
      boxShadow: el.shadow ? SHADOW : undefined, boxSizing: "border-box",
    };
  if (el.type === "video" || el.type === "visualiser" || el.type === "retrieval")
    return { ...base, height: finite(el.height), background: "#0f0f12", borderRadius: 8, overflow: "hidden", boxSizing: "border-box" };
  if (el.type === "table")
    return { ...base, height: finite(el.height), boxSizing: "border-box" };
  if (el.type === "timer")
    return {
      ...base, height: finite(el.height),
      background: el.fill || "#1a1714", color: el.color || "#ffffff",
      borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
      fontSize: el.fontSize || 72, boxSizing: "border-box",
    };
  return base;
}

/* Inner content of a box element (static / editor view). */
export function ElInner({ el }) {
  if (el.type === "text") return el.rich ? <span className="rt" style={{ display: "block", width: "100%" }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(el.rich) }} /> : el.text;
  if (el.type === "timer") return fmtTime(el.duration ?? 300);
  if (el.type === "image") return <ImageInner el={el} />;
  if (el.type === "table") return <TableView el={el} />;
  if (el.type === "video") return <Placeholder icon="▶" label={el.title || el.src || "Video"} />;
  if (el.type === "visualiser") return <Placeholder icon="📷" label="Visualiser — live camera in Present" />;
  if (el.type === "retrieval") return <Placeholder icon="📚" label="Retrieval — live app in Present" />;
  if (el.type === "html") return <HtmlInner el={el} />;
  if (el.type === "equation") return <EqInner el={el} />;
  if (el.type === "chart") return <ChartInner el={el} />;
  return null;
}

/* Default chart palette (chem orange, physics blue, bio green, …). */
export const CHART_COLORS = ["#2e3a5f", "#b95a3c", "#5e7c4b", "#c9a227", "#7a4e7e", "#3b7dd8", "#9a3b5a", "#3b9a86"];

/* A bar / line / pie chart drawn as plain SVG so it renders identically in the
   editor, thumbnails and Present (and exports as a native PowerPoint chart). */
function ChartInner({ el }) {
  const W = el.width || 480, H = el.height || 320;
  const type = el.chartType || "bar";
  const labels = (el.labels && el.labels.length ? el.labels : ["A", "B", "C"]);
  const series = (el.series && el.series.length ? el.series : [{ name: "Series 1", values: [4, 7, 3] }])
    .map((s, i) => ({ name: s.name || `Series ${i + 1}`, color: s.color || CHART_COLORS[i % CHART_COLORS.length], values: s.values || [] }));
  const font = el.font || C.sans;
  const axis = "#9a9486", grid = "#e7e2d6", ink = el.color || "#1a1714";
  const title = el.title;
  const showLegend = el.showLegend !== false && (type === "pie" || series.length > 1);
  const padT = (title ? 26 : 10) + 4, padB = 30, padL = 40, padR = 12;
  const legendH = showLegend ? 24 : 0;
  const plotW = Math.max(10, W - padL - padR), plotH = Math.max(10, H - padT - padB - legendH);
  const x0 = padL, y0 = padT, y1 = padT + plotH;

  const titleEl = title ? <text x={W / 2} y={16} textAnchor="middle" fontFamily={font} fontSize={15} fontWeight={700} fill={ink}>{title}</text> : null;
  const legendEl = showLegend ? (
    <g fontFamily={font} fontSize={11} fill={ink}>
      {(type === "pie" ? labels : series.map((s) => s.name)).map((name, i) => {
        const col = type === "pie" ? CHART_COLORS[i % CHART_COLORS.length] : series[i].color;
        const lx = padL + i * Math.min(120, plotW / Math.max(1, (type === "pie" ? labels : series).length));
        return <g key={i} transform={`translate(${lx}, ${H - 14})`}><rect width={11} height={11} y={-9} fill={col} rx={2} /><text x={15} y={0}>{String(name).slice(0, 12)}</text></g>;
      })}
    </g>
  ) : null;

  if (type === "pie") {
    const vals = (series[0]?.values || []).map((v) => Math.max(0, +v || 0));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = x0 + plotW / 2, cy = y0 + plotH / 2, r = Math.max(8, Math.min(plotW, plotH) / 2 - 4);
    let acc = 0;
    const arcs = vals.map((v, i) => {
      const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2; acc += v;
      const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [sx, sy] = p(a0), [ex, ey] = p(a1);
      if (v <= 0) return null;
      if (vals.length === 1) return <circle key={i} cx={cx} cy={cy} r={r} fill={CHART_COLORS[i % CHART_COLORS.length]} />;
      return <path key={i} d={`M${cx},${cy} L${sx},${sy} A${r},${r} 0 ${large} 1 ${ex},${ey} Z`} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#fff" strokeWidth={1.5} />;
    });
    return <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">{titleEl}{arcs}{legendEl}</svg>;
  }

  const allVals = series.flatMap((s) => s.values.map((v) => +v || 0));
  const maxV = Math.max(1, ...allVals), minV = Math.min(0, ...allVals);
  const yToPx = (v) => y1 - ((v - minV) / (maxV - minV || 1)) * plotH;
  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = minV + (i / ticks) * (maxV - minV); const y = yToPx(v);
    return <g key={i}><line x1={x0} y1={y} x2={x0 + plotW} y2={y} stroke={grid} strokeWidth={1} /><text x={x0 - 5} y={y + 3} textAnchor="end" fontFamily={font} fontSize={10} fill={axis}>{Math.round(v * 10) / 10}</text></g>;
  });
  const bandW = plotW / labels.length;
  const labelEls = labels.map((lab, i) => <text key={i} x={x0 + bandW * (i + 0.5)} y={y1 + 16} textAnchor="middle" fontFamily={font} fontSize={10} fill={axis}>{String(lab).slice(0, 10)}</text>);

  let marks = null;
  if (type === "line") {
    marks = series.map((s, si) => {
      const pts = s.values.map((v, i) => `${x0 + bandW * (i + 0.5)},${yToPx(+v || 0)}`).join(" ");
      return <g key={si}><polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
        {s.values.map((v, i) => <circle key={i} cx={x0 + bandW * (i + 0.5)} cy={yToPx(+v || 0)} r={3} fill={s.color} />)}</g>;
    });
  } else { // bar (grouped)
    const gap = bandW * 0.18, groupW = bandW - gap * 2, barW = groupW / series.length;
    marks = labels.map((_, i) => (
      <g key={i}>{series.map((s, si) => {
        const v = +s.values[i] || 0; const y = yToPx(v); const base = yToPx(0);
        return <rect key={si} x={x0 + bandW * i + gap + si * barW} y={Math.min(y, base)} width={Math.max(1, barW - 2)} height={Math.abs(base - y)} fill={s.color} rx={2} />;
      })}</g>
    ));
  }
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {titleEl}{gridLines}
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke={axis} strokeWidth={1} />
      <line x1={x0} y1={y1} x2={x0 + plotW} y2={y1} stroke={axis} strokeWidth={1} />
      {marks}{labelEls}{legendEl}
    </svg>
  );
}

/* A LaTeX equation rendered with KaTeX. Colour & size come from the element
   box (KaTeX inherits currentColor and the container font-size). Renders the
   same in the editor, thumbnails, Present and (via a snapshot) export. */
function EqInner({ el }) {
  const html = useMemo(() => {
    if (!el.latex) return "";
    try {
      return katex.renderToString(el.latex, { displayMode: true, throwOnError: false, output: "html" })
        .replace('class="katex-display"', 'class="katex-display" style="margin:0"');
    } catch { return null; }
  }, [el.latex]);
  if (!el.latex) return <Placeholder icon="∑" label="Equation — add LaTeX in the panel" />;
  if (html === null) return <span style={{ color: "#c0392b", fontFamily: "monospace", fontSize: 14, padding: 6 }}>⚠ {el.latex}</span>;
  return <span style={{ maxWidth: "100%" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* Static preview of an imported HTML template. Scripts are disabled here
   (sandbox="") so deck-list thumbnails and the editor stay cheap and safe;
   the page comes alive interactively in Present (see HtmlFrame). */
function HtmlInner({ el }) {
  if (!el.html) return <Placeholder icon="</>" label={el.title || "HTML template"} />;
  return <iframe title={el.title || "html"} srcDoc={el.html} sandbox="" scrolling="no"
    style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff", pointerEvents: "none" }} />;
}

/* Image, honouring an optional crop ({x,y,w,h} as 0–1 fractions of the image).
   `el.alt` is the author-provided description (editor → Present → print). Missing
   alt renders alt="" so the image is treated as decorative by screen readers —
   backward-compatible with decks created before alt existed. */
function ImageInner({ el }) {
  const alt = el.alt || "";
  if (el.crop) {
    const { x, y, w, h } = el.crop;
    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
        <img src={el.src} alt={alt} draggable={false}
          style={{ position: "absolute", width: `${100 / w}%`, height: `${100 / h}%`,
                   left: `${-(x * 100) / w}%`, top: `${-(y * 100) / h}%`,
                   objectFit: "fill", display: "block", pointerEvents: "none" }} />
      </div>
    );
  }
  return <img src={el.src} alt={alt} draggable={false}
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

/* Per-element error fallback (Present). A broken chart/video/equation used to
   vanish silently — the teacher never knew something failed and couldn't
   explain the gap. This small, unobtrusive card sits in the element's box so the
   teacher SEES that one element didn't load and can simply move on. Sized to the
   element so it never blows out the slide layout. */
function ElementErrorCard({ el }: { el: any }) {
  return (
    <div style={{ ...elStyle(el), background: "rgba(243,238,226,0.96)", border: "1px dashed #b8a78a",
                  borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#8a6d3b", fontFamily: "system-ui, sans-serif", textAlign: "center",
                  padding: 8, overflow: "hidden", boxSizing: "border-box" }}>
      <span style={{ fontSize: 13, lineHeight: 1.3, maxWidth: "100%" }}>⚠ This element couldn’t load</span>
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
  const url = el.url || RETRIEVAL_ORIGIN;
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

/* A strict Content-Security-Policy injected into the live HTML-slide srcdoc.
   Interactive imported widgets genuinely need their own scripts, so we keep
   allow-scripts; the CSP then closes the EXFILTRATION path that the sandbox
   alone leaves open. The opaque-origin sandbox stops the page reading the
   parent's session, but a malicious deck's own script could still beacon what
   it can reach to an attacker (fetch/XHR/WebSocket/img/form to any host). This
   policy permits only inline + same-origin scripts/styles and blocks ALL
   outbound connections (connect-src 'none') and remote form posts, so an
   imported deck can run interactively but cannot phone home. */
const HTML_SLIDE_CSP =
  "default-src 'none'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self' data:; " +
  "media-src 'self' data: blob:; " +
  "connect-src 'none'; " +
  "form-action 'none'; " +
  "frame-src 'none'; " +
  "base-uri 'none'";

/* Prepend the CSP <meta> to the imported HTML so the iframe enforces it. We
   inject into an existing <head> when present, otherwise wrap the document — a
   <meta http-equiv> only takes effect inside <head>, so order matters. */
function withHtmlSlideCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${HTML_SLIDE_CSP}">`;
  const src = html || "";
  if (/<head[\s>]/i.test(src)) return src.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  return `<!doctype html><html><head>${meta}</head><body>${src}</body></html>`;
}

/* Live, interactive HTML template (Present only). Runs the imported page's own
   CSS/JS in a sandboxed iframe. stopPropagation so clicks inside the lesson
   don't advance the slide (use the arrow keys to move on).
   NOTE: deliberately NO allow-same-origin — a srcdoc iframe inherits the app's
   origin, so allowing it together with scripts would let imported (and possibly
   shared/department) HTML read this user's session. Without it the page runs in
   an opaque origin: scripts/forms still work, but it can't touch the parent.
   We ALSO inject a strict CSP (withHtmlSlideCsp) that blocks outbound network
   (connect-src/form-action 'none') so a malicious imported deck can't exfiltrate
   anything it does reach. Sandbox isolates the parent; CSP closes the phone-home
   path while still allowing the widget's own inline scripts to run. */
function HtmlFrame({ el }) {
  const stop = (e) => e.stopPropagation();
  const srcDoc = useMemo(() => withHtmlSlideCsp(el.html || ""), [el.html]);
  return (
    <iframe title={el.title || "html-slide"} srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
      onClick={stop} onMouseDown={stop}
      style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff" }} />
  );
}

/* Camera permission, remembered per browser. Once a teacher grants access we
   record it so the next lesson with a visualiser slide doesn't surprise them
   mid-flow. Returns "granted" | "denied" | "prompt" | "unsupported". */
export const CAM_PERMISSION_KEY = "sk_camera_permission"; // "granted" once allowed

export async function probeCameraPermission(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator?.mediaDevices?.getUserMedia) return "unsupported";
  // The Permissions API is the non-intrusive way to read state without prompting.
  try {
    const status = await (navigator as any).permissions?.query?.({ name: "camera" as any });
    if (status?.state) {
      if (status.state === "granted") { try { localStorage.setItem(CAM_PERMISSION_KEY, "granted"); } catch {} }
      return status.state;
    }
  } catch {}
  // Fall back to our remembered choice (Firefox/Safari may not expose camera here).
  try { if (localStorage.getItem(CAM_PERMISSION_KEY) === "granted") return "granted"; } catch {}
  return "prompt";
}

/* Live webcam (Present only), with a device picker remembered per browser. The
   stream is only requested once `armed` is true — the present page pre-checks
   permission and arms it (or the teacher taps the in-frame "Enable camera"
   button), so the OS permission prompt never ambushes a live class. */
function LiveCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(() => { try { return localStorage.getItem("sk_visualiser_device") || ""; } catch { return ""; } });
  const [error, setError] = useState("");
  // Don't auto-request unless permission was previously granted; otherwise wait
  // for an explicit tap so the prompt is never a mid-lesson surprise.
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    probeCameraPermission().then((s) => { if (alive) { if (s === "granted") setArmed(true); setReady(true); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!armed) return;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) throw new Error("This browser can't access the camera.");
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        const s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        try { localStorage.setItem(CAM_PERMISSION_KEY, "granted"); } catch {}
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((d) => d.kind === "videoinput"));
      } catch (e) { if (!cancelled) setError(e?.message || "Couldn't access the camera."); }
    })();
    return () => { cancelled = true; if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, [deviceId, armed]);

  const pick = (id) => { setDeviceId(id); try { localStorage.setItem("sk_visualiser_device", id); } catch {} };

  if (error) return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#e88", fontFamily: "system-ui", fontSize: 13, textAlign: "center", padding: 12 }}>📷 {error}</div>;
  // Permission not yet granted — show a clear, calm prompt instead of silently
  // firing the OS dialog. Tapping arms the stream (and triggers the prompt).
  if (ready && !armed) return (
    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#0f0f12", color: "#cfcfd6", fontFamily: "system-ui", textAlign: "center", padding: 16 }}>
      <span style={{ fontSize: 30 }}>📷</span>
      <span style={{ fontSize: 13, opacity: 0.85, maxWidth: 260 }}>The visualiser needs camera access.</span>
      <button onClick={() => setArmed(true)}
        style={{ padding: "8px 18px", fontSize: 14, fontWeight: 600, color: "#1a1714", background: "#ffd166", border: "none", borderRadius: 8, cursor: "pointer" }}>Enable camera</button>
    </div>
  );
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000" }} onClick={(e) => e.stopPropagation()}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
      {devices.length > 1 && (
        <select value={deviceId} onChange={(e) => pick(e.target.value)}
          style={{ position: "absolute", top: 8, right: 8, fontSize: 12, padding: "4px 6px", borderRadius: 6, opacity: 0.85, border: "none" }}>
          <option value="">Default camera</option>
          {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
        </select>
      )}
    </div>
  );
}

/* Window event the present page dispatches when the teacher presses "T" — lets a
   key shortcut pause/resume the countdown that lives inside the slide. */
export const TIMER_TOGGLE_EVENT = "sk-timer-toggle";

/* A countdown that runs while a slide is presented. Restarts on mount (the
   present view keys each slide by index, so entering a slide restarts it).
   Pausable: click the timer (or press "T") to pause/resume — a classroom task
   timer is useless if you can't hold it while the class needs a moment longer.
   A paused timer shows a ⏸ marker and dims slightly so the state is obvious on
   a projector. */
function LiveTimer({ el }) {
  const [rem, setRem] = useState(el.duration ?? 300);
  const [paused, setPaused] = useState(false);

  // reset whenever we (re-)enter the slide / the duration changes
  useEffect(() => { setRem(el.duration ?? 300); setPaused(false); }, [el.duration]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setRem((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [paused]);

  // "T" key toggles all live timers on the slide.
  useEffect(() => {
    const onToggle = () => setPaused((p) => !p);
    window.addEventListener(TIMER_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(TIMER_TOGGLE_EVENT, onToggle);
  }, []);

  const toggle = (e) => { e.stopPropagation(); setPaused((p) => !p); };
  return (
    <div onClick={toggle} onPointerDown={(e) => e.stopPropagation()}
      title={paused ? "Paused — click or press T to resume" : "Click or press T to pause"}
      style={{ ...elStyle(el), cursor: "pointer", position: "relative",
               opacity: paused ? 0.55 : (elStyle(el).opacity ?? 1),
               color: rem <= 10 && !paused ? "#ff5a4a" : (el.color || "#fff") }}>
      {fmtTime(rem)}
      {paused && (
        <span style={{ position: "absolute", top: 6, right: 10, fontSize: Math.max(14, (el.fontSize || 72) * 0.22),
                       lineHeight: 1, opacity: 0.85 }}>⏸</span>
      )}
    </div>
  );
}

/* An arrow, defined by two endpoints. Read-only by default; the editor passes
   `hitProps` to add a fat transparent grab-line and `selected` to highlight. */
export function ArrowSvg({ el, selected, hitProps }: { el: any; selected?: boolean; hitProps?: any }) {
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

/* Whether a slide contains a live visualiser (camera) element — used by Present
   to pre-check camera permission before the teacher reaches the slide. */
export const slideHasVisualiser = (slide) => (slide?.elements || []).some((e) => e.type === "visualiser");
export const deckHasVisualiser = (slides) => (slides || []).some(slideHasVisualiser);

/* Replace brand-frame tokens. index is 0-based; {n} shows it 1-based. */
export function masterToken(str: string, { index = 0, total = 1, title = "" }: { index?: number; total?: number; title?: string } = {}) {
  return String(str || "")
    .replace(/\{n\}/g, String(index + 1))
    .replace(/\{total\}/g, String(total))
    .replace(/\{title\}/g, title)
    .replace(/\{date\}/g, new Date().toLocaleDateString("en-GB"));
}

/* The deck "master": a header/footer brand frame drawn on every slide (unless
   the slide sets hideMaster). Positioned in virtual 960×540 coords so it scales
   with the slide. Non-interactive. */
export function MasterFrame({ master, index = 0, total = 1, title = "" }) {
  if (!master?.enabled) return null;
  const color = master.color || "#6b6256";
  const ctx = { index, total, title };
  const cell = (txt, align) => (
    <div style={{ flex: 1, textAlign: align, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
      {masterToken(txt, ctx)}
    </div>
  );
  const row = (top, l, c, r) => (
    <div style={{ position: "absolute", left: 44, right: 44, top, display: "flex", gap: 16,
                  fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 15, color, lineHeight: 1.2 }}>
      {cell(l, "left")}{cell(c, "center")}{cell(r, "right")}
    </div>
  );
  const hasHeader = master.headerLeft || master.headerCenter || master.headerRight;
  const hasFooter = master.footerLeft || master.footerCenter || master.footerRight;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
      {hasHeader && row(16, master.headerLeft, master.headerCenter, master.headerRight)}
      {master.showRule && <div style={{ position: "absolute", left: 44, right: 44, bottom: 36, height: 2, background: master.accent || color, opacity: 0.5 }} />}
      {hasFooter && row(VH - 32, master.footerLeft, master.footerCenter, master.footerRight)}
    </div>
  );
}

/* A non-interactive slide scaled to `width` px. Used for thumbnails, the
   editor's rail, and present mode. `reveal` caps how many reveal-flagged
   elements are shown (in order) — Infinity shows everything. */
interface StaticSlideProps {
  slide: any;
  width: number;
  style?: CSSProperties;
  reveal?: number;
  live?: boolean;
  master?: any;
  index?: number;
  total?: number;
  title?: string;
}
export function StaticSlide({ slide, width, style, reveal = Infinity, live = false, master, index = 0, total = 1, title = "" }: StaticSlideProps) {
  const scale = width / VW;
  let rIdx = 0;
  return (
    <div style={{ width: VW * scale, height: VH * scale, position: "relative", ...style }}>
      <div style={{ width: VW, height: VH, position: "absolute", top: 0, left: 0,
                    transform: `scale(${scale})`, transformOrigin: "top left",
                    background: slide?.background || "#fff", overflow: "hidden" }}>
        {!slide?.hideMaster && <MasterFrame master={master} index={index} total={total} title={title} />}
        {(slide?.elements || []).map((el) => {
          if (el.reveal) {
            const show = rIdx < reveal;
            rIdx += 1;
            if (!show) return null;
          }
          let node;
          if (el.type === "arrow") node = <ArrowSvg el={el} />;
          else if (el.type === "timer" && live) node = <LiveTimer el={el} />;
          else if (el.type === "video" && live) node = <div style={elStyle(el)}><VideoFrame el={el} /></div>;
          else if (el.type === "visualiser" && live) node = <div style={elStyle(el)}><LiveCamera /></div>;
          else if (el.type === "retrieval" && live) node = <div style={elStyle(el)}><RetrievalFrame el={el} /></div>;
          else if (el.type === "html" && live) node = <div style={elStyle(el)}><HtmlFrame el={el} /></div>;
          else node = <div style={elStyle(el)}><ElInner el={el} /></div>;
          // Isolate each element: one malformed element (bad coords/chart/LaTeX)
          // renders nothing rather than crashing the whole slide and the app. In
          // Present (live) we show a small "couldn't load" card in the element's
          // box so the teacher knows something failed and can move on; in
          // thumbnails/editor-rail we stay silent (null) to avoid clutter.
          return <ErrorBoundary key={el.id} fallback={live ? <ElementErrorCard el={el} /> : null}>{node}</ErrorBoundary>;
        })}
      </div>
    </div>
  );
}
