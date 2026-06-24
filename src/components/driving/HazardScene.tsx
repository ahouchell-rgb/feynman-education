"use client";
import { useEffect, useRef } from "react";
import type { HazardClip, SimAmbient, SimHazard, ActorKind } from "@/lib/driving/types";
import { D_FAR, D_GONE, DRIVE_SPEED, scoreHazardClick } from "@/lib/driving/hazardSim";

/* Moving first-person hazard-perception simulation on a <canvas>.
 *
 * The world is simple: every actor has a distance D ahead (metres) and a lateral
 * position X (metres from road centre, negative = left). We drive forward at
 * DRIVE_SPEED so D shrinks each frame; actors are projected with a pinhole
 * camera. A hazard moves from a safe X into your path during its develop window.
 * The component handles its own clicks: a click is hit-tested against on-screen
 * actors; hitting a developing hazard scores it (and "stops" it), anything else
 * is a false alarm. */

const VW = 820;
const VH = 470;
const HORIZON = VH * 0.4;
const CX = VW / 2;
const FOCAL = 330;
const CAM_X = -1.6; // your lane centre (UK: you drive on the left)
const CAM_H = 1.25;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Geom { cx: number; baseY: number; w: number; h: number; D: number }

const REAL: Record<ActorKind, { w: number; h: number }> = {
  pedestrian: { w: 0.55, h: 1.75 },
  child: { w: 0.42, h: 1.05 },
  cyclist: { w: 0.7, h: 1.75 },
  car: { w: 1.8, h: 1.5 },
  oncoming: { w: 1.8, h: 1.5 },
  bus: { w: 2.5, h: 3.1 },
  dog: { w: 0.9, h: 0.55 },
};

function distanceOf(appearAt: number, travel: number, t: number): number {
  return D_FAR - (t - appearAt) * ((D_FAR - D_GONE) / travel);
}

function safeX(h: SimHazard): number {
  if (h.kind === "oncoming") return 1.8;
  if (h.fromJunction) return h.side === "left" ? -4.6 : 4.6;
  if (h.kind === "cyclist") return -2.8;
  if (h.kind === "bus") return -3.7;
  return h.side === "left" ? -4.1 : 4.1; // pedestrian / child on pavement
}
function targetX(h: SimHazard): number {
  if (h.kind === "oncoming") return -0.6; // drifts onto your side
  if (h.kind === "cyclist") return -1.4; // into your lane
  return CAM_X; // into your path
}
function hazardWorldX(h: SimHazard, t: number, frozenX: number | null): number {
  if (frozenX != null) return frozenX;
  const p = clamp01((t - h.developStart) / (h.developEnd - h.developStart));
  return lerp(safeX(h), targetX(h), p);
}

function project(X: number, D: number): { x: number; ground: number; scale: number } {
  const scale = FOCAL / D;
  return { x: CX + (X - CAM_X) * scale, ground: HORIZON + (CAM_H * FOCAL) / D, scale };
}

function geomOf(kind: ActorKind, worldX: number, D: number): Geom | null {
  if (D <= D_GONE || D >= D_FAR) return null;
  const { x, ground, scale } = project(worldX, D);
  const r = REAL[kind];
  return { cx: x, baseY: ground, w: r.w * scale, h: r.h * scale, D };
}

export interface HazardSceneHandle {
  reset: () => void;
}

export function HazardScene({
  clip,
  playKey,
  onTime,
  onEnd,
  onScore,
  onFalseAlarm,
}: {
  clip: HazardClip;
  playKey: number;
  onTime?: (t: number) => void;
  onEnd?: () => void;
  onScore?: (hazardId: string, band: number, t: number) => void;
  onFalseAlarm?: (t: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const cbRef = useRef({ onTime, onEnd, onScore, onFalseAlarm });
  cbRef.current = { onTime, onEnd, onScore, onFalseAlarm };

  const tRef = useRef(0);
  const stopped = useRef<Map<string, { band: number; worldX: number; at: number }>>(new Map());
  const occurred = useRef<Map<string, number>>(new Map());
  const blanks = useRef<{ x: number; y: number; t: number }[]>([]);

  // hit-test a click against on-screen actors
  const handleClick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VW;
    const y = ((clientY - rect.top) / rect.height) * VH;
    const t = tRef.current;
    const clip = clipRef.current;

    // build candidate hazards (nearest first), test bbox with padding
    const candidates = clip.hazards
      .map((h) => {
        const D = distanceOf(h.appearAt, h.travel, t);
        const fx = stopped.current.get(h.id)?.worldX ?? null;
        const g = geomOf(h.kind, hazardWorldX(h, t, fx), D);
        return g ? { h, g } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a!.g.D - b!.g.D) as { h: SimHazard; g: Geom }[];

    for (const { h, g } of candidates) {
      const pad = Math.max(22, g.w * 0.6, g.h * 0.3);
      const left = g.cx - g.w / 2 - pad;
      const right = g.cx + g.w / 2 + pad;
      const top = g.baseY - g.h - pad;
      const bottom = g.baseY + pad;
      if (x >= left && x <= right && y >= top && y <= bottom) {
        if (stopped.current.has(h.id) || occurred.current.has(h.id)) return; // already handled
        if (t > h.developEnd) {
          occurred.current.set(h.id, t);
          cbRef.current.onFalseAlarm?.(t);
          return;
        }
        const band = scoreHazardClick(h.developStart, h.developEnd, t);
        stopped.current.set(h.id, { band, worldX: hazardWorldX(h, t, null), at: t });
        cbRef.current.onScore?.(h.id, band, t);
        return;
      }
    }
    // nothing hit → false alarm
    blanks.current.push({ x, y, t });
    cbRef.current.onFalseAlarm?.(t);
  };

  useEffect(() => {
    // reset per-play state
    tRef.current = 0;
    stopped.current = new Map();
    occurred.current = new Map();
    blanks.current = [];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let start = 0;
    let dead = false;

    const frame = (ts: number) => {
      if (dead) return;
      if (!start) start = ts;
      const t = (ts - start) / 1000;
      tRef.current = t;
      const clip = clipRef.current;
      // auto-mark hazards that passed their window unclicked
      for (const h of clip.hazards) {
        if (t > h.developEnd && !stopped.current.has(h.id) && !occurred.current.has(h.id)) {
          occurred.current.set(h.id, t);
        }
      }
      drawScene(ctx, clip, t, stopped.current, occurred.current, blanks.current);
      cbRef.current.onTime?.(t);
      if (t >= clip.duration) {
        cbRef.current.onEnd?.();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  return (
    <canvas
      ref={canvasRef}
      width={VW}
      height={VH}
      onPointerDown={(e) => handleClick(e.clientX, e.clientY)}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: 10, background: "#0e1116", cursor: "crosshair", touchAction: "manipulation" }}
    />
  );
}

/* ── renderer ───────────────────────────────────────────────────────────── */
function drawScene(
  ctx: CanvasRenderingContext2D,
  clip: HazardClip,
  t: number,
  stopped: Map<string, { band: number; worldX: number; at: number }>,
  occurred: Map<string, number>,
  blanks: { x: number; y: number; t: number }[]
) {
  const scene = clip.scene;
  ctx.clearRect(0, 0, VW, VH);

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  if (scene === "rural") { sky.addColorStop(0, "#74add6"); sky.addColorStop(1, "#cfe6f4"); }
  else if (scene === "town") { sky.addColorStop(0, "#90a0ad"); sky.addColorStop(1, "#cfd6db"); }
  else { sky.addColorStop(0, "#8fa9bd"); sky.addColorStop(1, "#d3dde3"); }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VW, HORIZON);

  // ground
  ctx.fillStyle = scene === "rural" ? "#5c7c3a" : "#7b8590";
  ctx.fillRect(0, HORIZON, VW, VH - HORIZON);

  // road + pavements (project edges near & far)
  const near = D_GONE + 0.2;
  const far = D_FAR;
  const lEdgeN = project(-3.3, near), lEdgeF = project(-3.3, far);
  const rEdgeN = project(3.3, near), rEdgeF = project(3.3, far);
  // pavement / verge
  ctx.fillStyle = scene === "rural" ? "#587538" : "#9aa2ab";
  ctx.beginPath();
  ctx.moveTo(0, VH); ctx.lineTo(lEdgeN.x, lEdgeN.ground); ctx.lineTo(lEdgeF.x, lEdgeF.ground); ctx.lineTo(0, HORIZON);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(VW, VH); ctx.lineTo(rEdgeN.x, rEdgeN.ground); ctx.lineTo(rEdgeF.x, rEdgeF.ground); ctx.lineTo(VW, HORIZON);
  ctx.closePath(); ctx.fill();
  // tarmac
  ctx.fillStyle = "#3a4047";
  ctx.beginPath();
  ctx.moveTo(lEdgeN.x, lEdgeN.ground); ctx.lineTo(rEdgeN.x, rEdgeN.ground); ctx.lineTo(rEdgeF.x, rEdgeF.ground); ctx.lineTo(lEdgeF.x, lEdgeF.ground);
  ctx.closePath(); ctx.fill();

  // centre line dashes at X=0 (animated)
  const phase = (t * DRIVE_SPEED) % 6;
  for (let k = 0; k < 12; k++) {
    const dTop = far - k * 6 - phase;
    const dBot = dTop - 3;
    if (dBot <= near || dTop >= far) continue;
    const a = project(0, dTop), b = project(0, Math.max(near, dBot));
    ctx.fillStyle = "#e9e4d2";
    ctx.beginPath();
    ctx.moveTo(a.x - a.scale * 0.07, a.ground);
    ctx.lineTo(a.x + a.scale * 0.07, a.ground);
    ctx.lineTo(b.x + b.scale * 0.07, b.ground);
    ctx.lineTo(b.x - b.scale * 0.07, b.ground);
    ctx.closePath();
    ctx.fill();
  }

  // roadside scenery (moving) — buildings / trees / lampposts both sides
  drawScenery(ctx, scene, t);

  // parked cars on the left for residential clips, plus near the cyclist
  if (scene === "residential") drawParkedCars(ctx, t);

  // junction openings for hazards that come from a side road
  for (const h of clip.hazards) {
    if (!h.fromJunction) continue;
    const D = distanceOf(h.appearAt, h.travel, t);
    if (D > D_GONE && D < D_FAR) drawJunction(ctx, h.side, D);
  }

  // collect actors (ambient + hazards), sort far→near, draw
  type Draw = { kind: ActorKind; worldX: number; D: number; hazard?: SimHazard };
  const draws: Draw[] = [];
  for (const a of clip.ambient) {
    const D = distanceOf(a.appearAt, a.travel, t);
    if (D > D_GONE && D < D_FAR) draws.push({ kind: a.kind, worldX: a.worldX, D });
  }
  for (const h of clip.hazards) {
    const D = distanceOf(h.appearAt, h.travel, t);
    if (D > D_GONE && D < D_FAR) {
      const fx = stopped.get(h.id)?.worldX ?? null;
      draws.push({ kind: h.kind, worldX: hazardWorldX(h, t, fx), D, hazard: h });
    }
  }
  draws.sort((a, b) => b.D - a.D);
  for (const d of draws) {
    const g = geomOf(d.kind, d.worldX, d.D);
    if (!g) continue;
    drawActor(ctx, d.kind, g, t);
    if (d.hazard) {
      const st = stopped.get(d.hazard.id);
      const oc = occurred.get(d.hazard.id);
      if (st) drawStopBadge(ctx, g, st.band);
      else if (oc != null && t - oc < 1.5) drawOccurred(ctx, g, t);
    }
  }

  // false-alarm flag markers (fade)
  for (const b of blanks) {
    const age = t - b.t;
    if (age < 0 || age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = "#e2b33c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 12 + age * 10, 0, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // bonnet (first-person)
  ctx.fillStyle = "#1b2026";
  ctx.beginPath();
  ctx.moveTo(0, VH);
  ctx.quadraticCurveTo(CX, VH - 58, VW, VH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.moveTo(CX - 120, VH); ctx.quadraticCurveTo(CX, VH - 40, CX + 120, VH);
  ctx.closePath(); ctx.fill();
}

function drawScenery(ctx: CanvasRenderingContext2D, scene: string, t: number) {
  const span = 14;
  for (let k = 0; k < 6; k++) {
    const D = D_FAR - ((t * DRIVE_SPEED + k * span) % D_FAR);
    if (D <= D_GONE + 1 || D >= D_FAR) continue;
    for (const side of [-1, 1] as const) {
      const wx = side * 6.2;
      const { x, ground, scale } = project(wx, D);
      if (scene === "town") {
        const h = 7 * scale, w = 3.5 * scale;
        ctx.fillStyle = ["#8a7f70", "#766c5f", "#94897a"][k % 3];
        ctx.fillRect(x - w / 2, ground - h, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        for (let r = 1; r <= 3; r++) for (let c = 0; c < 2; c++) ctx.fillRect(x - w / 2 + w * (0.2 + c * 0.4), ground - h + h * (0.15 * r), w * 0.18, h * 0.08);
      } else if (scene === "rural") {
        ctx.fillStyle = "#6b4a2a";
        ctx.fillRect(x - 0.18 * scale, ground - 2.4 * scale, 0.36 * scale, 2.4 * scale);
        ctx.fillStyle = "#3f6b2e";
        ctx.beginPath(); ctx.arc(x, ground - 2.8 * scale, 1.5 * scale, 0, 7); ctx.fill();
      } else {
        // residential: lamppost + low hedge
        ctx.fillStyle = "#6f7782";
        ctx.fillRect(x - 0.06 * scale, ground - 3.2 * scale, 0.12 * scale, 3.2 * scale);
        ctx.fillStyle = "#4e6b3a";
        ctx.fillRect(x - 1.1 * scale, ground - 0.7 * scale, 2.2 * scale, 0.7 * scale);
      }
    }
  }
}

function drawParkedCars(ctx: CanvasRenderingContext2D, t: number) {
  const span = 9;
  const colors = ["#3d6e8e", "#7d4a4a", "#4a4a52", "#6e5a3d", "#566b4a"];
  for (let k = 0; k < 6; k++) {
    const D = D_FAR - ((t * DRIVE_SPEED + k * span + 4) % D_FAR);
    if (D <= D_GONE + 1 || D >= D_FAR - 4) continue;
    const g = geomOf("car", -2.95, D);
    if (g) drawCar(ctx, g, colors[k % colors.length], "away");
  }
}

function drawJunction(ctx: CanvasRenderingContext2D, side: "left" | "right", D: number) {
  const s = side === "left" ? -1 : 1;
  const inner = project(s * 3.3, D);
  const outer = project(s * 7.5, D);
  const innerB = project(s * 3.3, Math.max(D_GONE + 0.2, D - 5));
  const outerB = project(s * 7.5, Math.max(D_GONE + 0.2, D - 5));
  ctx.fillStyle = "#3a4047";
  ctx.beginPath();
  ctx.moveTo(inner.x, inner.ground);
  ctx.lineTo(outer.x, outer.ground);
  ctx.lineTo(outerB.x, outerB.ground);
  ctx.lineTo(innerB.x, innerB.ground);
  ctx.closePath();
  ctx.fill();
}

function drawActor(ctx: CanvasRenderingContext2D, kind: ActorKind, g: Geom, t: number) {
  if (kind === "car") return drawCar(ctx, g, "#b34", "away");
  if (kind === "oncoming") return drawCar(ctx, g, "#cdd2d6", "toward");
  if (kind === "bus") return drawBus(ctx, g);
  if (kind === "cyclist") return drawCyclist(ctx, g, t);
  return drawPerson(ctx, g, kind === "child", t);
}

function drawPerson(ctx: CanvasRenderingContext2D, g: Geom, child: boolean, t: number) {
  const { cx, baseY, h } = g;
  const swing = Math.sin(t * 7) * h * 0.08;
  const col = child ? "#d3622b" : "#2f4f7a";
  const head = h * 0.18;
  ctx.fillStyle = "#e8c39a";
  ctx.beginPath(); ctx.arc(cx, baseY - h + head, head, 0, 7); ctx.fill();
  ctx.fillStyle = col;
  ctx.fillRect(cx - h * 0.11, baseY - h + head * 1.6, h * 0.22, h * 0.42);
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, h * 0.08); ctx.lineCap = "round";
  ctx.beginPath(); // legs
  ctx.moveTo(cx, baseY - h * 0.42); ctx.lineTo(cx - h * 0.12 - swing, baseY);
  ctx.moveTo(cx, baseY - h * 0.42); ctx.lineTo(cx + h * 0.12 + swing, baseY);
  // arms
  ctx.moveTo(cx, baseY - h * 0.66); ctx.lineTo(cx - h * 0.13 + swing, baseY - h * 0.4);
  ctx.moveTo(cx, baseY - h * 0.66); ctx.lineTo(cx + h * 0.13 - swing, baseY - h * 0.4);
  ctx.stroke();
}

function drawCyclist(ctx: CanvasRenderingContext2D, g: Geom, t: number) {
  const { cx, baseY, h } = g;
  const wheel = h * 0.28;
  ctx.strokeStyle = "#16181b"; ctx.lineWidth = Math.max(1.5, h * 0.05);
  ctx.beginPath(); ctx.arc(cx - h * 0.16, baseY - wheel, wheel, 0, 7); ctx.arc(cx + h * 0.16, baseY - wheel, wheel, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - h * 0.16, baseY - wheel); ctx.lineTo(cx, baseY - h * 0.55); ctx.lineTo(cx + h * 0.16, baseY - wheel); ctx.moveTo(cx, baseY - h * 0.55); ctx.lineTo(cx + h * 0.02, baseY - wheel); ctx.stroke();
  // rider
  ctx.fillStyle = "#1f7a4d";
  ctx.fillRect(cx - h * 0.1, baseY - h * 0.85, h * 0.2, h * 0.32);
  ctx.fillStyle = "#e8c39a"; ctx.beginPath(); ctx.arc(cx, baseY - h * 0.9, h * 0.13, 0, 7); ctx.fill();
}

function drawCar(ctx: CanvasRenderingContext2D, g: Geom, color: string, facing: "away" | "toward") {
  const { cx, baseY, w, h } = g;
  const wheelH = h * 0.2;
  const wheelW = w * 0.2;
  // wheels first, sitting on the ground
  ctx.fillStyle = "#141619";
  ctx.fillRect(cx - w * 0.46, baseY - wheelH, wheelW, wheelH);
  ctx.fillRect(cx + w * 0.26, baseY - wheelH, wheelW, wheelH);
  // lower body resting on the wheels
  ctx.fillStyle = color;
  ctx.fillRect(cx - w / 2, baseY - h * 0.62, w, h * 0.5);
  // cabin / roof (narrower, on top)
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.36, baseY - h * 0.6);
  ctx.lineTo(cx - w * 0.24, baseY - h);
  ctx.lineTo(cx + w * 0.24, baseY - h);
  ctx.lineTo(cx + w * 0.36, baseY - h * 0.6);
  ctx.closePath(); ctx.fill();
  // window
  ctx.fillStyle = facing === "toward" ? "#39414a" : "#1b1f24";
  ctx.fillRect(cx - w * 0.26, baseY - h * 0.96, w * 0.52, h * 0.32);
  // lights along the bottom edge
  if (facing === "toward") {
    ctx.fillStyle = "#fff6cf";
    ctx.fillRect(cx - w * 0.46, baseY - h * 0.5, w * 0.12, h * 0.12);
    ctx.fillRect(cx + w * 0.34, baseY - h * 0.5, w * 0.12, h * 0.12);
  } else {
    ctx.fillStyle = "#c0312a";
    ctx.fillRect(cx - w * 0.46, baseY - h * 0.42, w * 0.12, h * 0.12);
    ctx.fillRect(cx + w * 0.34, baseY - h * 0.42, w * 0.12, h * 0.12);
  }
}

function drawBus(ctx: CanvasRenderingContext2D, g: Geom) {
  const { cx, baseY, w, h } = g;
  ctx.fillStyle = "#c5403a";
  ctx.fillRect(cx - w / 2, baseY - h, w, h * 0.92);
  ctx.fillStyle = "#1b1f24";
  for (let i = 0; i < 4; i++) ctx.fillRect(cx - w * 0.42 + i * w * 0.22, baseY - h * 0.78, w * 0.16, h * 0.26);
  ctx.fillStyle = "#15171a";
  ctx.fillRect(cx - w * 0.34, baseY - h * 0.12, w * 0.16, h * 0.14);
  ctx.fillRect(cx + w * 0.18, baseY - h * 0.12, w * 0.16, h * 0.14);
}

function drawStopBadge(ctx: CanvasRenderingContext2D, g: Geom, band: number) {
  const cx = g.cx, cy = g.baseY - g.h - 18;
  ctx.fillStyle = "rgba(46,124,75,0.92)";
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.fill();
  ctx.strokeStyle = "#2e7c4b"; ctx.lineWidth = 3;
  ctx.strokeRect(g.cx - g.w / 2 - 6, g.baseY - g.h - 6, g.w + 12, g.h + 12);
  ctx.fillStyle = "#fff"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("+" + band, cx, cy + 1);
}

function drawOccurred(ctx: CanvasRenderingContext2D, g: Geom, t: number) {
  const flash = Math.floor(t * 6) % 2 === 0;
  ctx.strokeStyle = flash ? "#e23b2e" : "#a01f17"; ctx.lineWidth = 3;
  ctx.strokeRect(g.cx - g.w / 2 - 6, g.baseY - g.h - 6, g.w + 12, g.h + 12);
  ctx.fillStyle = "#e23b2e";
  const cx = g.cx, cy = g.baseY - g.h - 18;
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("!", cx, cy + 1);
}
