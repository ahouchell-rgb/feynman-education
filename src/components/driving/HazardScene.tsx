"use client";
import { useEffect, useRef } from "react";
import type { HazardClip, SimHazard, ActorKind } from "@/lib/driving/types";
import { D_FAR, D_GONE, DRIVE_SPEED, scoreHazardClick } from "@/lib/driving/hazardSim";

/* Moving first-person hazard-perception simulation on a <canvas>, drawn to look
 * like driving a car: an in-car cockpit (dashboard, wheel, A-pillars, mirror),
 * an atmospheric scene and shaded actors.
 *
 * The world model is simple: every actor has a distance D ahead (metres) and a
 * lateral position X (metres from road centre, negative = left). We drive forward
 * at DRIVE_SPEED so D shrinks each frame; actors are projected with a pinhole
 * camera. A hazard moves from a safe X into your path during its develop window.
 * The component handles its own clicks: a click is hit-tested against on-screen
 * actors; hitting a developing hazard scores it (and "stops" it), else it is a
 * false alarm. (A small engine "bob" only shifts the visuals — well within the
 * click hit-box tolerance — so hit-testing stays accurate.) */

const VW = 860;
const VH = 500;
const DPR = 2; // render the backing store at 2x for crisp, realistic detail
const HORIZON = VH * 0.42;
const CX = VW / 2;
const FOCAL = 350;
const CAM_X = -1.6; // your lane centre (UK: you drive on the left)
const CAM_H = 1.25;
const DASH_TOP = VH * 0.8; // top of the dashboard

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Geom { cx: number; baseY: number; w: number; h: number; D: number }

const REAL: Record<ActorKind, { w: number; h: number }> = {
  pedestrian: { w: 0.55, h: 1.75 },
  child: { w: 0.42, h: 1.1 },
  cyclist: { w: 0.7, h: 1.75 },
  car: { w: 1.8, h: 1.5 },
  oncoming: { w: 1.8, h: 1.5 },
  bus: { w: 2.55, h: 3.1 },
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
  return h.side === "left" ? -4.1 : 4.1;
}
function targetX(h: SimHazard): number {
  if (h.kind === "oncoming") return -0.6;
  if (h.kind === "cyclist") return -1.4;
  return CAM_X;
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

  const handleClick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VW;
    const y = ((clientY - rect.top) / rect.height) * VH;
    const t = tRef.current;
    const clip = clipRef.current;

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
        if (stopped.current.has(h.id) || occurred.current.has(h.id)) return;
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
    blanks.current.push({ x, y, t });
    cbRef.current.onFalseAlarm?.(t);
  };

  useEffect(() => {
    tRef.current = 0;
    stopped.current = new Map();
    occurred.current = new Map();
    blanks.current = [];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // high-DPI backing store for crisp rendering
    canvas.width = VW * DPR;
    canvas.height = VH * DPR;

    let raf = 0;
    let start = 0;
    let dead = false;

    const frame = (ts: number) => {
      if (dead) return;
      if (!start) start = ts;
      const t = (ts - start) / 1000;
      tRef.current = t;
      const clip = clipRef.current;
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

/* ════════════════════════════ renderer ════════════════════════════════════ */
function drawScene(
  ctx: CanvasRenderingContext2D,
  clip: HazardClip,
  t: number,
  stopped: Map<string, { band: number; worldX: number; at: number }>,
  occurred: Map<string, number>,
  blanks: { x: number; y: number; t: number }[]
) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);

  // subtle engine bob + sway (visual only; within hit-box tolerance)
  const bobY = Math.sin(t * 4.6) * 1.5 + Math.sin(t * 9.1) * 0.7;
  const swayX = Math.sin(t * 1.2) * 1.1;

  ctx.save();
  ctx.translate(swayX, bobY);

  drawSky(ctx, clip.scene, t);
  drawGround(ctx, clip.scene);
  drawRoad(ctx, clip.scene, t);
  drawScenery(ctx, clip.scene, t);
  drawAmbientTraffic(ctx, clip.scene, t);
  if (clip.scene === "residential" || clip.scene === "town") drawParkedCars(ctx, t);

  for (const h of clip.hazards) {
    if (!h.fromJunction) continue;
    const D = distanceOf(h.appearAt, h.travel, t);
    if (D > D_GONE && D < D_FAR) drawJunction(ctx, h.side, D);
  }

  // collect actors, far→near
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
    drawShadow(ctx, g);
    drawActor(ctx, d.kind, g, t);
    if (d.hazard) {
      const st = stopped.get(d.hazard.id);
      const oc = occurred.get(d.hazard.id);
      if (st) drawStopBadge(ctx, g, st.band);
      else if (oc != null && t - oc < 1.6) drawOccurred(ctx, g, t);
    }
  }

  // aerial perspective: soften distance toward the haze (depth realism)
  const fog = ctx.createLinearGradient(0, HORIZON - 8, 0, HORIZON + 120);
  const hz = clip.scene === "rural" ? "222,235,243" : "216,224,230";
  fog.addColorStop(0, `rgba(${hz},0.55)`);
  fog.addColorStop(1, `rgba(${hz},0)`);
  ctx.fillStyle = fog;
  ctx.fillRect(-30, HORIZON - 8, VW + 60, 130);

  // false-alarm flag markers
  for (const b of blanks) {
    const age = t - b.t;
    if (age < 0 || age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = "#e2b33c";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 12 + age * 12, 0, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // cockpit + vignette are fixed to the screen
  drawCockpit(ctx, clip.scene);
  drawVignette(ctx);
}

/* ── sky, ground ─────────────────────────────────────────────────────────── */
function drawSky(ctx: CanvasRenderingContext2D, scene: string, t: number) {
  const sky = ctx.createLinearGradient(0, -4, 0, HORIZON);
  if (scene === "rural") { sky.addColorStop(0, "#4f93cf"); sky.addColorStop(0.7, "#9fc8e8"); sky.addColorStop(1, "#dcebf5"); }
  else if (scene === "town") { sky.addColorStop(0, "#7d93a6"); sky.addColorStop(0.7, "#b3c2cd"); sky.addColorStop(1, "#dfe6ea"); }
  else { sky.addColorStop(0, "#6f96bc"); sky.addColorStop(0.7, "#a9c6dd"); sky.addColorStop(1, "#dde8ef"); }
  ctx.fillStyle = sky;
  ctx.fillRect(-30, -30, VW + 60, HORIZON + 30);

  // soft sun glow
  const sunX = CX + 150, sunY = HORIZON * 0.32;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 150);
  glow.addColorStop(0, "rgba(255,250,230,0.85)");
  glow.addColorStop(0.3, "rgba(255,245,215,0.35)");
  glow.addColorStop(1, "rgba(255,245,215,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-30, -30, VW + 60, HORIZON + 30);

  // drifting clouds
  for (let i = 0; i < 4; i++) {
    const cxp = ((i * 260 + 40 - t * 6) % (VW + 200)) - 100;
    const cyp = 24 + (i % 2) * 26;
    cloud(ctx, cxp, cyp, 46 + i * 7);
  }

  // distant haze + tree/roof line at the horizon
  ctx.fillStyle = scene === "rural" ? "#7e9a6b" : "#9aa6b0";
  ctx.beginPath();
  ctx.moveTo(-30, HORIZON);
  for (let x = -30; x <= VW + 30; x += 24) {
    ctx.lineTo(x, HORIZON - 6 - (Math.sin(x * 0.07) + 1) * (scene === "town" ? 9 : 5));
  }
  ctx.lineTo(VW + 30, HORIZON);
  ctx.closePath();
  ctx.fill();
  const haze = ctx.createLinearGradient(0, HORIZON - 30, 0, HORIZON + 10);
  haze.addColorStop(0, "rgba(223,232,238,0)");
  haze.addColorStop(1, "rgba(223,232,238,0.85)");
  ctx.fillStyle = haze;
  ctx.fillRect(-30, HORIZON - 30, VW + 60, 40);
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, 7);
  ctx.arc(x + r * 0.45, y + 3, r * 0.38, 0, 7);
  ctx.arc(x - r * 0.45, y + 4, r * 0.34, 0, 7);
  ctx.arc(x + r * 0.1, y - r * 0.18, r * 0.4, 0, 7);
  ctx.fill();
}

function drawGround(ctx: CanvasRenderingContext2D, scene: string) {
  const g = ctx.createLinearGradient(0, HORIZON, 0, VH);
  if (scene === "rural") { g.addColorStop(0, "#6f8f44"); g.addColorStop(1, "#52732f"); }
  else { g.addColorStop(0, "#8b949d"); g.addColorStop(1, "#6c757e"); }
  ctx.fillStyle = g;
  ctx.fillRect(-30, HORIZON, VW + 60, VH - HORIZON + 30);
}

/* ── road ────────────────────────────────────────────────────────────────── */
function drawRoad(ctx: CanvasRenderingContext2D, scene: string, t: number) {
  const near = D_GONE + 0.2;
  const far = D_FAR;
  const lN = project(-3.3, near), lF = project(-3.3, far);
  const rN = project(3.3, near), rF = project(3.3, far);

  // pavement / verge bands with kerb
  ctx.fillStyle = scene === "rural" ? "#5f7d38" : "#aab1b9";
  poly(ctx, [[-30, VH + 30], [lN.x, lN.ground], [lF.x, lF.ground], [-30, HORIZON]]);
  poly(ctx, [[VW + 30, VH + 30], [rN.x, rN.ground], [rF.x, rF.ground], [VW + 30, HORIZON]]);

  // tarmac with depth gradient
  const tar = ctx.createLinearGradient(0, HORIZON, 0, VH);
  tar.addColorStop(0, "#4a5158");
  tar.addColorStop(1, "#33383e");
  ctx.fillStyle = tar;
  poly(ctx, [[lN.x, lN.ground], [rN.x, rN.ground], [rF.x, rF.ground], [lF.x, lF.ground]]);

  // kerb stones along both edges
  drawKerb(ctx, -3.3, t);
  drawKerb(ctx, 3.3, t);

  // subtle tar seams running across (motion cue)
  const seamPhase = (t * DRIVE_SPEED) % 7;
  for (let k = 0; k < 14; k++) {
    const D = far - k * 7 - seamPhase;
    if (D <= near || D >= far) continue;
    const a = project(-3.3, D), b = project(3.3, D);
    ctx.strokeStyle = "rgba(0,0,0,0.13)";
    ctx.lineWidth = Math.max(0.5, a.scale * 0.03);
    ctx.beginPath(); ctx.moveTo(a.x, a.ground); ctx.lineTo(b.x, b.ground); ctx.stroke();
  }

  // solid edge lines
  edgeLine(ctx, -3.0); edgeLine(ctx, 3.0);

  // centre dashes (animated) + reflective cat's-eyes
  const phase = (t * DRIVE_SPEED) % 6;
  for (let k = 0; k < 14; k++) {
    const dTop = far - k * 6 - phase;
    const dBot = dTop - 3;
    if (dBot <= near || dTop >= far) continue;
    const a = project(0, dTop), b = project(0, Math.max(near, dBot));
    ctx.fillStyle = "#ece6d4";
    poly(ctx, [[a.x - a.scale * 0.08, a.ground], [a.x + a.scale * 0.08, a.ground], [b.x + b.scale * 0.08, b.ground], [b.x - b.scale * 0.08, b.ground]]);
  }
  const cphase = (t * DRIVE_SPEED) % 12;
  for (let k = 0; k < 8; k++) {
    const D = far - k * 12 - cphase;
    if (D <= near + 2 || D >= far) continue;
    const a = project(0, D);
    ctx.fillStyle = "rgba(240,240,210,0.9)";
    ctx.beginPath(); ctx.arc(a.x, a.ground, Math.max(0.8, a.scale * 0.05), 0, 7); ctx.fill();
  }

  // an approaching zebra crossing on town high streets
  if (scene === "town") {
    const zD = D_FAR - ((t * DRIVE_SPEED + 18) % (D_FAR * 1.6));
    if (zD > near + 1 && zD < far - 6) drawZebra(ctx, zD);
  }
}

function drawZebra(ctx: CanvasRenderingContext2D, D: number) {
  for (let i = -3; i <= 3; i++) {
    const X = i * 0.85;
    const a = project(X - 0.32, D), b = project(X + 0.32, D);
    const aB = project(X - 0.32, Math.max(D_GONE + 0.2, D - 3.2)), bB = project(X + 0.32, Math.max(D_GONE + 0.2, D - 3.2));
    ctx.fillStyle = "rgba(236,232,218,0.92)";
    poly(ctx, [[a.x, a.ground], [b.x, b.ground], [bB.x, bB.ground], [aB.x, aB.ground]]);
  }
}

function drawKerb(ctx: CanvasRenderingContext2D, X: number, t: number) {
  const phase = (t * DRIVE_SPEED) % 4;
  for (let k = 0; k < 18; k++) {
    const D = D_FAR - k * 4 - phase;
    if (D <= D_GONE + 0.2 || D >= D_FAR) continue;
    const a = project(X, D), b = project(X, Math.max(D_GONE + 0.2, D - 2));
    ctx.fillStyle = k % 2 ? "#c7ccd2" : "#9aa1a8";
    poly(ctx, [[a.x, a.ground], [a.x + a.scale * 0.18, a.ground], [b.x + b.scale * 0.18, b.ground], [b.x, b.ground]]);
  }
}

function edgeLine(ctx: CanvasRenderingContext2D, X: number) {
  const a = project(X, D_GONE + 0.3), b = project(X, D_FAR);
  ctx.fillStyle = "rgba(236,230,212,0.9)";
  poly(ctx, [[a.x - a.scale * 0.05, a.ground], [a.x + a.scale * 0.05, a.ground], [b.x + b.scale * 0.05, b.ground], [b.x - b.scale * 0.05, b.ground]]);
}

/* ── scenery ─────────────────────────────────────────────────────────────── */
function drawScenery(ctx: CanvasRenderingContext2D, scene: string, t: number) {
  const span = 13;
  for (let k = 0; k < 7; k++) {
    const D = D_FAR - ((t * DRIVE_SPEED + k * span) % D_FAR);
    if (D <= D_GONE + 1 || D >= D_FAR) continue;
    for (const side of [-1, 1] as const) {
      const { x, ground, scale } = project(side * 6.4, D);
      if (scene === "town") building(ctx, x, ground, scale, k);
      else if (scene === "rural") tree(ctx, x, ground, scale);
      else { tree(ctx, x + side * 0.6 * scale, ground, scale * 0.8); lamppost(ctx, x, ground, scale); }
      if (scene !== "rural" && k % 2 === 0) lamppost(ctx, project(side * 3.7, D).x, project(side * 3.7, D).ground, scale);
      // occasional roadside signs / traffic lights at the kerb
      if (scene !== "rural" && side === 1 && k % 3 === 1) {
        const p = project(3.6, D);
        drawSignpost(ctx, p.x, p.ground, p.scale, k % 3);
      } else if (scene === "rural" && k % 4 === 2) {
        const p = project(side * 3.8, D);
        drawSignpost(ctx, p.x, p.ground, p.scale, 2);
      }
    }
  }
}

function building(ctx: CanvasRenderingContext2D, x: number, ground: number, scale: number, k: number) {
  const h = (6 + (k % 3)) * scale, w = 3.6 * scale;
  ctx.fillStyle = ["#9b8f7d", "#82776a", "#a8967f", "#6f6557"][k % 4];
  ctx.fillRect(x - w / 2, ground - h, w, h);
  // roof
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x - w / 2, ground - h, w, h * 0.06);
  // windows (lit / dark)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    ctx.fillStyle = (r + c + k) % 4 === 0 ? "rgba(255,240,190,0.85)" : "rgba(40,52,66,0.7)";
    ctx.fillRect(x - w * 0.36 + c * w * 0.28, ground - h + h * 0.12 + r * h * 0.2, w * 0.17, h * 0.12);
  }
  // shopfront
  ctx.fillStyle = "rgba(30,40,52,0.8)";
  ctx.fillRect(x - w * 0.4, ground - h * 0.18, w * 0.8, h * 0.18);
}

function tree(ctx: CanvasRenderingContext2D, x: number, ground: number, scale: number) {
  ctx.fillStyle = "#5b4128";
  ctx.fillRect(x - 0.14 * scale, ground - 2.2 * scale, 0.28 * scale, 2.2 * scale);
  const r = 1.5 * scale;
  for (const [dx, dy, rr, col] of [[0, -2.9, 1, "#3f6b2e"], [-0.6, -2.5, 0.75, "#4d7d39"], [0.6, -2.5, 0.75, "#356024"], [0, -3.5, 0.7, "#4d7d39"]] as const) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + dx * scale, ground + dy * scale, r * rr, 0, 7); ctx.fill();
  }
}

function lamppost(ctx: CanvasRenderingContext2D, x: number, ground: number, scale: number) {
  ctx.strokeStyle = "#5a626b"; ctx.lineWidth = Math.max(1, 0.1 * scale);
  ctx.beginPath(); ctx.moveTo(x, ground); ctx.lineTo(x, ground - 3.4 * scale); ctx.lineTo(x + 0.5 * scale, ground - 3.4 * scale); ctx.stroke();
  ctx.fillStyle = "#cfd6dd"; ctx.fillRect(x + 0.4 * scale, ground - 3.5 * scale, 0.3 * scale, 0.18 * scale);
}

function drawParkedCars(ctx: CanvasRenderingContext2D, t: number) {
  const span = 10;
  const colors = ["#3d6e8e", "#7d4a4a", "#43454c", "#6e5a3d", "#4f6b46", "#8a8f96"];
  for (let k = 0; k < 6; k++) {
    const D = D_FAR - ((t * DRIVE_SPEED + k * span + 5) % D_FAR);
    if (D <= D_GONE + 1 || D >= D_FAR - 4) continue;
    const g = geomOf("car", -2.92, D);
    if (g) { drawShadow(ctx, g); drawCar(ctx, g, colors[k % colors.length], "away"); }
  }
}

function drawAmbientTraffic(ctx: CanvasRenderingContext2D, scene: string, t: number) {
  if (scene === "rural") return; // keep rural clear so the oncoming hazard reads
  // a steady stream of oncoming cars in the opposite lane
  const colors = ["#34506e", "#6e3a3a", "#3a3d44", "#566b46", "#7a7f86"];
  const span = 26;
  for (let k = 0; k < 3; k++) {
    const D = D_FAR - ((t * (DRIVE_SPEED + 8) + k * span) % D_FAR);
    if (D <= D_GONE + 1 || D >= D_FAR - 3) continue;
    const g = geomOf("oncoming", 1.75, D);
    if (g) { drawShadow(ctx, g); drawCar(ctx, g, colors[k % colors.length], "toward"); }
  }
  // a lead vehicle ahead in your lane on busier roads
  if (scene === "town" || scene === "dual") {
    const D = D_FAR - ((t * (DRIVE_SPEED - 1.5) + 14) % D_FAR);
    if (D > 14 && D < D_FAR - 3) {
      const g = geomOf("car", CAM_X, D);
      if (g) { drawShadow(ctx, g); drawCar(ctx, g, "#46566b", "away"); }
    }
  }
}

function drawSignpost(ctx: CanvasRenderingContext2D, x: number, ground: number, scale: number, kind: number) {
  ctx.fillStyle = "#6b7178";
  ctx.fillRect(x - 0.05 * scale, ground - 2.6 * scale, 0.1 * scale, 2.6 * scale);
  if (kind === 0) {
    // traffic light head
    ctx.fillStyle = "#1c1f24"; roundRect(ctx, x - 0.18 * scale, ground - 3.3 * scale, 0.36 * scale, 0.8 * scale, 0.08 * scale); ctx.fill();
    for (const [i, c] of [[0, "#c0312a"], [1, "#d8a52a"], [2, "#2faa4f"]] as const) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, ground - 3.15 * scale + i * 0.27 * scale, 0.1 * scale, 0, 7); ctx.fill();
    }
  } else if (kind === 1) {
    // round speed-limit sign
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, ground - 2.9 * scale, 0.34 * scale, 0, 7); ctx.fill();
    ctx.strokeStyle = "#c1272d"; ctx.lineWidth = Math.max(1, 0.08 * scale); ctx.beginPath(); ctx.arc(x, ground - 2.9 * scale, 0.34 * scale, 0, 7); ctx.stroke();
    ctx.fillStyle = "#1a1714"; ctx.font = `bold ${Math.max(5, 0.34 * scale)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("30", x, ground - 2.86 * scale);
  } else {
    // warning triangle
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#c1272d"; ctx.lineWidth = Math.max(1, 0.07 * scale);
    ctx.beginPath(); ctx.moveTo(x, ground - 3.3 * scale); ctx.lineTo(x + 0.34 * scale, ground - 2.7 * scale); ctx.lineTo(x - 0.34 * scale, ground - 2.7 * scale); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function drawJunction(ctx: CanvasRenderingContext2D, side: "left" | "right", D: number) {
  const s = side === "left" ? -1 : 1;
  const inner = project(s * 3.3, D), outer = project(s * 7.8, D);
  const innerB = project(s * 3.3, Math.max(D_GONE + 0.2, D - 5.5)), outerB = project(s * 7.8, Math.max(D_GONE + 0.2, D - 5.5));
  const g = ctx.createLinearGradient(0, inner.ground - 30, 0, inner.ground);
  g.addColorStop(0, "#4a5158"); g.addColorStop(1, "#33383e");
  ctx.fillStyle = g;
  poly(ctx, [[inner.x, inner.ground], [outer.x, outer.ground], [outerB.x, outerB.ground], [innerB.x, innerB.ground]]);
}

/* ── actors ──────────────────────────────────────────────────────────────── */
function drawShadow(ctx: CanvasRenderingContext2D, g: Geom) {
  // sun is upper-right, so shadows fall to the lower-left
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.ellipse(g.cx - g.w * 0.18, g.baseY + 1.5, Math.max(7, g.w * 0.66), Math.max(2, g.h * 0.07), 0, 0, 7);
  ctx.fill();
}

function drawActor(ctx: CanvasRenderingContext2D, kind: ActorKind, g: Geom, t: number) {
  if (kind === "car") return drawCar(ctx, g, "#b23b3b", "away");
  if (kind === "oncoming") return drawCar(ctx, g, "#d3d7db", "toward");
  if (kind === "bus") return drawBus(ctx, g);
  if (kind === "cyclist") return drawCyclist(ctx, g, t);
  return drawPerson(ctx, g, kind === "child", t);
}

function drawPerson(ctx: CanvasRenderingContext2D, g: Geom, child: boolean, t: number) {
  const { cx, baseY, h } = g;
  const swing = Math.sin(t * 7.5) * h * 0.1;
  const top = baseY - h;
  const headR = h * 0.13;
  const jacket = child ? "#e05a2b" : "#34547e";
  const trouser = child ? "#2f6f8e" : "#2c3038";
  // legs
  ctx.strokeStyle = trouser; ctx.lineWidth = Math.max(1.6, h * 0.1); ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, baseY - h * 0.45); ctx.lineTo(cx - swing, baseY);
  ctx.moveTo(cx, baseY - h * 0.45); ctx.lineTo(cx + swing, baseY);
  ctx.stroke();
  // torso
  ctx.fillStyle = jacket;
  roundRect(ctx, cx - h * 0.12, baseY - h * 0.62, h * 0.24, h * 0.32, h * 0.05);
  ctx.fill();
  // arms
  ctx.strokeStyle = jacket; ctx.lineWidth = Math.max(1.4, h * 0.075);
  ctx.beginPath();
  ctx.moveTo(cx - h * 0.1, baseY - h * 0.58); ctx.lineTo(cx - h * 0.14 + swing * 0.8, baseY - h * 0.32);
  ctx.moveTo(cx + h * 0.1, baseY - h * 0.58); ctx.lineTo(cx + h * 0.14 - swing * 0.8, baseY - h * 0.32);
  ctx.stroke();
  // head + hair
  ctx.fillStyle = "#e8b98f";
  ctx.beginPath(); ctx.arc(cx, top + headR, headR, 0, 7); ctx.fill();
  ctx.fillStyle = child ? "#6b3f1d" : "#33291f";
  ctx.beginPath(); ctx.arc(cx, top + headR * 0.85, headR, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
}

function drawCyclist(ctx: CanvasRenderingContext2D, g: Geom, t: number) {
  const { cx, baseY, h } = g;
  const wheel = h * 0.26;
  ctx.strokeStyle = "#16181b"; ctx.lineWidth = Math.max(1.6, h * 0.045);
  // wheels
  for (const dx of [-0.17, 0.17]) { ctx.beginPath(); ctx.arc(cx + dx * h, baseY - wheel, wheel, 0, 7); ctx.stroke(); }
  // frame
  ctx.strokeStyle = "#9a2a2a"; ctx.lineWidth = Math.max(1.6, h * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx - 0.17 * h, baseY - wheel); ctx.lineTo(cx, baseY - h * 0.5); ctx.lineTo(cx + 0.17 * h, baseY - wheel);
  ctx.moveTo(cx, baseY - h * 0.5); ctx.lineTo(cx + 0.05 * h, baseY - wheel); ctx.stroke();
  // rider
  ctx.fillStyle = "#1f7a4d";
  roundRect(ctx, cx - h * 0.1, baseY - h * 0.86, h * 0.2, h * 0.3, h * 0.05); ctx.fill();
  ctx.strokeStyle = "#1f7a4d"; ctx.lineWidth = Math.max(1.3, h * 0.06);
  ctx.beginPath(); ctx.moveTo(cx, baseY - h * 0.8); ctx.lineTo(cx + 0.13 * h, baseY - h * 0.55); ctx.stroke();
  // helmet head
  ctx.fillStyle = "#e8b98f"; ctx.beginPath(); ctx.arc(cx + 0.02 * h, baseY - h * 0.92, h * 0.1, 0, 7); ctx.fill();
  ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(cx + 0.02 * h, baseY - h * 0.96, h * 0.1, Math.PI, 0); ctx.fill();
}

function drawCar(ctx: CanvasRenderingContext2D, g: Geom, color: string, facing: "away" | "toward") {
  const { cx, baseY, w, h } = g;
  const wheelH = h * 0.2, wheelW = w * 0.2;
  const dark = shade(color, -28);
  const light = shade(color, 22);
  // wheels + arches
  ctx.fillStyle = "#0e0f11";
  ctx.fillRect(cx - w * 0.46, baseY - wheelH, wheelW, wheelH);
  ctx.fillRect(cx + w * 0.26, baseY - wheelH, wheelW, wheelH);
  // lower body (gradient)
  const bg = ctx.createLinearGradient(0, baseY - h * 0.62, 0, baseY - wheelH * 0.4);
  bg.addColorStop(0, light); bg.addColorStop(1, dark);
  ctx.fillStyle = bg;
  roundRect(ctx, cx - w / 2, baseY - h * 0.62, w, h * 0.52, w * 0.07); ctx.fill();
  // cabin
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.37, baseY - h * 0.58);
  ctx.quadraticCurveTo(cx - w * 0.3, baseY - h * 1.02, cx - w * 0.18, baseY - h * 1.02);
  ctx.lineTo(cx + w * 0.18, baseY - h * 1.02);
  ctx.quadraticCurveTo(cx + w * 0.3, baseY - h * 1.02, cx + w * 0.37, baseY - h * 0.58);
  ctx.closePath(); ctx.fill();
  // glass with sky reflection
  const glass = ctx.createLinearGradient(0, baseY - h, 0, baseY - h * 0.6);
  glass.addColorStop(0, facing === "toward" ? "#3a444e" : "#243038");
  glass.addColorStop(1, facing === "toward" ? "#566570" : "#10161b");
  ctx.fillStyle = glass;
  roundRect(ctx, cx - w * 0.27, baseY - h * 0.98, w * 0.54, h * 0.34, w * 0.04); ctx.fill();
  // roof highlight
  ctx.strokeStyle = light; ctx.lineWidth = Math.max(1, w * 0.03);
  ctx.beginPath(); ctx.moveTo(cx - w * 0.16, baseY - h * 1.0); ctx.lineTo(cx + w * 0.16, baseY - h * 1.0); ctx.stroke();
  // bumper
  ctx.fillStyle = dark;
  ctx.fillRect(cx - w / 2, baseY - h * 0.16, w, h * 0.06);
  // lights
  if (facing === "toward") {
    ctx.fillStyle = "#fff7d6";
    glowRect(ctx, cx - w * 0.44, baseY - h * 0.5, w * 0.13, h * 0.12, "rgba(255,247,214,0.7)");
    glowRect(ctx, cx + w * 0.31, baseY - h * 0.5, w * 0.13, h * 0.12, "rgba(255,247,214,0.7)");
    // number plate
    ctx.fillStyle = "#e9e4cf"; ctx.fillRect(cx - w * 0.1, baseY - h * 0.36, w * 0.2, h * 0.1);
  } else {
    ctx.fillStyle = "#d23b30";
    glowRect(ctx, cx - w * 0.44, baseY - h * 0.46, w * 0.12, h * 0.12, "rgba(210,59,48,0.6)");
    glowRect(ctx, cx + w * 0.32, baseY - h * 0.46, w * 0.12, h * 0.12, "rgba(210,59,48,0.6)");
    ctx.fillStyle = "#f5ca3a"; ctx.fillRect(cx - w * 0.1, baseY - h * 0.34, w * 0.2, h * 0.1);
  }
}

function drawBus(ctx: CanvasRenderingContext2D, g: Geom) {
  const { cx, baseY, w, h } = g;
  const dark = "#9c322d";
  ctx.fillStyle = "#0e0f11";
  ctx.fillRect(cx - w * 0.34, baseY - h * 0.16, w * 0.16, h * 0.16);
  ctx.fillRect(cx + w * 0.18, baseY - h * 0.16, w * 0.16, h * 0.16);
  const bg = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  bg.addColorStop(0, dark); bg.addColorStop(0.5, "#c5403a"); bg.addColorStop(1, dark);
  ctx.fillStyle = bg;
  roundRect(ctx, cx - w / 2, baseY - h, w, h * 0.9, w * 0.05); ctx.fill();
  // windows
  for (let i = 0; i < 4; i++) {
    const gl = ctx.createLinearGradient(0, baseY - h * 0.82, 0, baseY - h * 0.5);
    gl.addColorStop(0, "#3a4650"); gl.addColorStop(1, "#10161b");
    ctx.fillStyle = gl;
    ctx.fillRect(cx - w * 0.42 + i * w * 0.22, baseY - h * 0.82, w * 0.17, h * 0.28);
  }
  ctx.fillStyle = "#1b1f24"; ctx.fillRect(cx - w * 0.46, baseY - h * 0.4, w * 0.92, h * 0.04);
  ctx.fillStyle = "#f3d23a"; ctx.fillRect(cx - w * 0.46, baseY - h * 0.3, w * 0.1, h * 0.1);
}

/* ── badges ──────────────────────────────────────────────────────────────── */
function drawStopBadge(ctx: CanvasRenderingContext2D, g: Geom, band: number) {
  ctx.strokeStyle = "#2fae5e"; ctx.lineWidth = 3;
  roundRect(ctx, g.cx - g.w / 2 - 7, g.baseY - g.h - 7, g.w + 14, g.h + 14, 6); ctx.stroke();
  const cx = g.cx, cy = g.baseY - g.h - 20;
  ctx.fillStyle = "rgba(34,124,75,0.95)";
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("+" + band, cx, cy + 1);
}

function drawOccurred(ctx: CanvasRenderingContext2D, g: Geom, t: number) {
  const flash = Math.floor(t * 6) % 2 === 0;
  ctx.strokeStyle = flash ? "#e23b2e" : "#a01f17"; ctx.lineWidth = 3;
  roundRect(ctx, g.cx - g.w / 2 - 7, g.baseY - g.h - 7, g.w + 14, g.h + 14, 6); ctx.stroke();
  const cx = g.cx, cy = g.baseY - g.h - 20;
  ctx.fillStyle = "#e23b2e"; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("!", cx, cy + 1);
}

/* ── cockpit (you're in the car) ─────────────────────────────────────────── */
function drawCockpit(ctx: CanvasRenderingContext2D, scene: string) {
  // A-pillars (angled, dark) framing the windscreen
  ctx.fillStyle = "#1b1e23";
  poly(ctx, [[-30, -30], [-30, VH], [86, DASH_TOP], [150, -30]]);
  poly(ctx, [[VW + 30, -30], [VW + 30, VH], [VW - 86, DASH_TOP], [VW - 150, -30]]);

  // rear-view mirror
  const mw = 150, mh = 30, mx = CX - mw / 2, my = 8;
  ctx.fillStyle = "#15171b";
  roundRect(ctx, mx - 6, my - 4, mw + 12, mh + 10, 8); ctx.fill();
  const mg = ctx.createLinearGradient(0, my, 0, my + mh);
  mg.addColorStop(0, scene === "rural" ? "#9fc1da" : "#aeb8c0"); mg.addColorStop(1, "#5d6770");
  ctx.fillStyle = mg;
  roundRect(ctx, mx, my, mw, mh, 5); ctx.fill();

  // dashboard
  const dash = ctx.createLinearGradient(0, DASH_TOP - 6, 0, VH);
  dash.addColorStop(0, "#23262b"); dash.addColorStop(0.5, "#16181c"); dash.addColorStop(1, "#0c0d10");
  ctx.fillStyle = dash;
  ctx.beginPath();
  ctx.moveTo(-30, VH + 30);
  ctx.lineTo(-30, DASH_TOP + 18);
  ctx.quadraticCurveTo(CX, DASH_TOP - 26, VW + 30, DASH_TOP + 18);
  ctx.lineTo(VW + 30, VH + 30);
  ctx.closePath(); ctx.fill();
  // dash top highlight
  ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-30, DASH_TOP + 18); ctx.quadraticCurveTo(CX, DASH_TOP - 26, VW + 30, DASH_TOP + 18); ctx.stroke();

  // instrument cluster glow (left of wheel)
  const icx = CX - 150;
  const ig = ctx.createRadialGradient(icx, VH - 36, 4, icx, VH - 36, 70);
  ig.addColorStop(0, "rgba(120,180,255,0.18)"); ig.addColorStop(1, "rgba(120,180,255,0)");
  ctx.fillStyle = ig; ctx.fillRect(icx - 70, VH - 90, 140, 90);

  // steering wheel
  const wx = CX - 70, wy = VH + 64, wr = 118;
  ctx.lineWidth = 16; ctx.strokeStyle = "#0a0b0d";
  ctx.beginPath(); ctx.arc(wx, wy, wr, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.lineWidth = 6; ctx.strokeStyle = "#2b2f35";
  ctx.beginPath(); ctx.arc(wx, wy, wr, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  // spokes + hub
  ctx.strokeStyle = "#15181c"; ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(wx, wy); ctx.lineTo(wx - wr * 0.86, wy - wr * 0.18);
  ctx.moveTo(wx, wy); ctx.lineTo(wx + wr * 0.86, wy - wr * 0.18);
  ctx.moveTo(wx, wy); ctx.lineTo(wx, wy - wr * 0.9);
  ctx.stroke();
  ctx.fillStyle = "#202329"; ctx.beginPath(); ctx.arc(wx, wy, 24, 0, 7); ctx.fill();
  ctx.fillStyle = "#3a3f47"; ctx.beginPath(); ctx.arc(wx, wy, 9, 0, 7); ctx.fill();
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const v = ctx.createRadialGradient(CX, HORIZON + 40, 120, CX, HORIZON + 40, VW * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, VW, DASH_TOP);
}

/* ── small canvas helpers ────────────────────────────────────────────────── */
function poly(ctx: CanvasRenderingContext2D, pts: number[][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function glowRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glow: string) {
  ctx.save();
  ctx.shadowColor = glow; ctx.shadowBlur = 10;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
function shade(hex: string, amt: number): string {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  let r = parseInt(n.slice(0, 2), 16) + amt;
  let g = parseInt(n.slice(2, 4), 16) + amt;
  let b = parseInt(n.slice(4, 6), 16) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}
