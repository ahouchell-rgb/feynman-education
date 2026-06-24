"use client";
import { useEffect, useRef } from "react";
import type { HazardClip, HazardWindow } from "@/lib/driving/types";

/* A self-contained animated "dashcam" view for one hazard-perception clip,
 * drawn on a <canvas>. It owns its own requestAnimationFrame loop: when
 * `playKey` changes it restarts from t=0, advances to clip.duration, calls
 * onTime(t) each frame and onEnd() when finished. Click markers (red flags the
 * learner placed) are read from a ref so they render without restarting. */

type ActorKind = "pedestrian" | "cyclist" | "car" | "horse";

function actorOf(label: string): ActorKind {
  const l = label.toLowerCase();
  if (l.includes("cyclist") || l.includes("bike")) return "cyclist";
  if (l.includes("horse")) return "horse";
  if (l.includes("car") || l.includes("vehicle") || l.includes("van") || l.includes("brake")) return "car";
  return "pedestrian";
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

export function HazardScene({
  clip,
  playKey,
  onTime,
  onEnd,
  clicksRef,
}: {
  clip: HazardClip;
  playKey: number;
  onTime?: (t: number) => void;
  onEnd?: () => void;
  clicksRef: React.MutableRefObject<number[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const cbRef = useRef({ onTime, onEnd });
  cbRef.current = { onTime, onEnd };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    let raf = 0;
    let start = 0;
    let stopped = false;

    const draw = (t: number) => {
      const c = clipRef.current;
      drawScene(ctx, W, H, c, t, clicksRef.current);
    };

    const loop = (ts: number) => {
      if (stopped) return;
      if (!start) start = ts;
      const t = (ts - start) / 1000;
      if (t >= clipRef.current.duration) {
        draw(clipRef.current.duration);
        cbRef.current.onTime?.(clipRef.current.duration);
        cbRef.current.onEnd?.();
        return;
      }
      draw(t);
      cbRef.current.onTime?.(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  return (
    <canvas
      ref={canvasRef}
      width={680}
      height={400}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: 10, background: "#1d2630" }}
    />
  );
}

/* ── pure renderer ─────────────────────────────────────────────────────── */
function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  clip: HazardClip,
  t: number,
  clicks: number[]
) {
  const scene = clip.scene;
  const horizon = H * 0.42;
  const cx = W / 2;

  // ── sky ──
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  if (scene === "rural") { sky.addColorStop(0, "#7fb3e0"); sky.addColorStop(1, "#cfe6f5"); }
  else if (scene === "town") { sky.addColorStop(0, "#9aa7b2"); sky.addColorStop(1, "#cdd5db"); }
  else if (scene === "dual") { sky.addColorStop(0, "#88a9c9"); sky.addColorStop(1, "#c9dced"); }
  else { sky.addColorStop(0, "#9fb6c6"); sky.addColorStop(1, "#d4ddE2"); }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);

  // ── ground / verge ──
  ctx.fillStyle = scene === "rural" ? "#5f7d3c" : "#76808a";
  ctx.fillRect(0, horizon, W, H - horizon);

  // ── road (trapezoid to vanishing point) ──
  const roadBottom = W * (scene === "dual" ? 0.92 : 0.74);
  const roadTop = W * 0.06;
  ctx.fillStyle = "#3b4148";
  ctx.beginPath();
  ctx.moveTo(cx - roadTop / 2, horizon);
  ctx.lineTo(cx + roadTop / 2, horizon);
  ctx.lineTo(cx + roadBottom / 2, H);
  ctx.lineTo(cx - roadBottom / 2, H);
  ctx.closePath();
  ctx.fill();

  // pavements (residential/town)
  if (scene === "residential" || scene === "town") {
    ctx.fillStyle = "#9298a0";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + (s * roadTop) / 2, horizon);
      ctx.lineTo(cx + (s * (roadTop + 14)) / 2, horizon);
      ctx.lineTo(cx + s * (roadBottom / 2 + 90), H);
      ctx.lineTo(cx + (s * roadBottom) / 2, H);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── centre line (animated dashes for sense of motion) ──
  ctx.strokeStyle = "#e8e2d0";
  ctx.lineWidth = 2;
  const speed = 90;
  const phase = (t * speed) % 40;
  for (let d = -40; d < H; d += 40) {
    const y0 = horizon + d + phase;
    const y1 = y0 + 18;
    if (y1 < horizon) continue;
    const p0 = (Math.max(y0, horizon) - horizon) / (H - horizon);
    const p1 = (Math.min(y1, H) - horizon) / (H - horizon);
    const w0 = lerp(1.5, 7, p0);
    const w1 = lerp(1.5, 7, p1);
    ctx.beginPath();
    ctx.moveTo(cx - w0 / 2, Math.max(y0, horizon));
    ctx.lineTo(cx - w1 / 2, Math.min(y1, H));
    ctx.lineTo(cx + w1 / 2, Math.min(y1, H));
    ctx.lineTo(cx + w0 / 2, Math.max(y0, horizon));
    ctx.closePath();
    ctx.fillStyle = "#e8e2d0";
    ctx.fill();
  }

  // ── roadside scenery ──
  if (scene === "residential") drawParkedCars(ctx, W, H, horizon, cx, t);
  if (scene === "rural") drawTrees(ctx, W, H, horizon, cx, t);
  if (scene === "town") drawBuildings(ctx, W, H, horizon, cx);
  if (scene === "dual") drawSlipRoad(ctx, W, H, horizon, cx);

  // zebra crossing for town
  if (scene === "town") {
    const cy = H * 0.78;
    const halfW = lerp(roadTop, roadBottom, (cy - horizon) / (H - horizon)) / 2;
    ctx.fillStyle = "#eee";
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(cx + i * (halfW / 4) - 6, cy, 12, 16);
    }
  }

  // ── hazard actors ──
  clip.hazards.forEach((h) => drawActor(ctx, W, H, horizon, cx, h, t, scene));

  // ── click flags ──
  clicks.forEach((ct) => {
    const age = t - ct;
    if (age < 0 || age > 1.4) return;
    const alpha = 1 - age / 1.4;
    const fx = 30 + (clicks.indexOf(ct) % 8) * 22;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#d11";
    ctx.fillRect(fx, H - 40, 3, 20);
    ctx.beginPath();
    ctx.moveTo(fx + 3, H - 40);
    ctx.lineTo(fx + 16, H - 35);
    ctx.lineTo(fx + 3, H - 30);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // ── bonnet (first-person) ──
  ctx.fillStyle = "#23292f";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.quadraticCurveTo(cx, H - 46, W, H);
  ctx.closePath();
  ctx.fill();
}

function roadHalfWidth(W: number, scene: string, p: number) {
  const roadBottom = W * (scene === "dual" ? 0.92 : 0.74);
  const roadTop = W * 0.06;
  return lerp(roadTop, roadBottom, p) / 2;
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  horizon: number,
  cx: number,
  h: HazardWindow,
  t: number,
  scene: string
) {
  if (t < h.appearsAt) return;
  const kind = actorOf(h.label);
  // progress: from appearance to end of window the actor moves from the
  // roadside into your path; afterwards it sits in the path.
  const p = (t - h.appearsAt) / Math.max(0.1, h.windowEnd - h.appearsAt);
  // depth grows so the actor appears to come closer
  const depth = lerp(0.45, 0.95, Math.min(1, p + 0.15));
  const y = horizon + (H - horizon) * depth;
  const hw = roadHalfWidth(W, scene, depth);
  const scale = lerp(0.3, 1.25, depth);

  if (kind === "pedestrian" || kind === "horse") {
    // starts at left pavement, walks toward centre
    const x = lerp(cx - hw - 30 * scale, cx - hw * 0.2, Math.min(1, p));
    drawPerson(ctx, x, y, 34 * scale, kind === "horse" ? "#6b4a2a" : "#23507a");
  } else if (kind === "cyclist") {
    const x = lerp(cx - hw - 20 * scale, cx - hw * 0.35, Math.min(1, p));
    drawPerson(ctx, x, y, 30 * scale, "#1f7a4d");
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(x - 6 * scale, y + 4 * scale, 6 * scale, 0, 7);
    ctx.arc(x + 6 * scale, y + 4 * scale, 6 * scale, 0, 7);
    ctx.stroke();
  } else {
    // car: merges from left or is ahead braking
    const ahead = h.label.toLowerCase().includes("brake") || h.label.toLowerCase().includes("ahead");
    const x = ahead ? cx : lerp(cx - hw, cx - hw * 0.25, Math.min(1, p));
    drawCar(ctx, x, y, 54 * scale, ahead, t);
  }
}

function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - s, s * 0.22, 0, 7); // head
  ctx.fill();
  ctx.fillRect(x - s * 0.13, y - s * 0.82, s * 0.26, s * 0.5); // torso
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.34);
  ctx.lineTo(x - s * 0.18, y); // leg
  ctx.moveTo(x, y - s * 0.34);
  ctx.lineTo(x + s * 0.18, y); // leg
  ctx.stroke();
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, ahead: boolean, t: number) {
  const h = w * 0.55;
  ctx.fillStyle = ahead ? "#5a6470" : "#a23b3b";
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = "#2a2f35";
  ctx.fillRect(x - w / 2 + 4, y - h + 3, w - 8, h * 0.45);
  // brake/tail lights
  ctx.fillStyle = ahead && Math.floor(t * 2) % 2 === 0 ? "#ff3b30" : "#7a1f1a";
  ctx.fillRect(x - w / 2 + 2, y - h * 0.4, 6, 6);
  ctx.fillRect(x + w / 2 - 8, y - h * 0.4, 6, 6);
}

function drawParkedCars(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number, cx: number, t: number) {
  for (let i = 0; i < 4; i++) {
    const depth = 0.5 + i * 0.13;
    const y = horizon + (H - horizon) * depth;
    const hw = roadHalfWidth(W, "residential", depth);
    const s = lerp(0.4, 1, depth);
    const colors = ["#3d6e8e", "#8e6f3d", "#4a4a52", "#6e3d56"];
    drawCar(ctx, cx - hw - 18 * s, y, 50 * s, false, t);
    ctx.fillStyle = colors[i];
    ctx.fillRect(cx - hw - 18 * s - 25 * s, y - 27 * s, 50 * s, 14 * s);
  }
}

function drawTrees(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number, cx: number, t: number) {
  for (let i = 0; i < 5; i++) {
    const depth = 0.5 + i * 0.1;
    const y = horizon + (H - horizon) * depth;
    const hw = roadHalfWidth(W, "rural", depth);
    const s = lerp(0.5, 1.4, depth);
    for (const side of [-1, 1]) {
      const x = cx + side * (hw + 36 * s);
      ctx.fillStyle = "#6b4a2a";
      ctx.fillRect(x - 3 * s, y - 30 * s, 6 * s, 30 * s);
      ctx.fillStyle = "#3f6b2e";
      ctx.beginPath();
      ctx.arc(x, y - 36 * s, 18 * s, 0, 7);
      ctx.fill();
    }
  }
}

function drawBuildings(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number, cx: number) {
  for (let i = 0; i < 4; i++) {
    const depth = 0.45 + i * 0.12;
    const y = horizon + (H - horizon) * depth;
    const hw = roadHalfWidth(W, "town", depth);
    const s = lerp(0.5, 1.3, depth);
    for (const side of [-1, 1]) {
      const x = cx + side * (hw + 50 * s);
      ctx.fillStyle = ["#7a6f63", "#8a7d6e", "#6e6457"][i % 3];
      ctx.fillRect(x - 30 * s, y - 70 * s, 60 * s, 70 * s);
    }
  }
}

function drawSlipRoad(ctx: CanvasRenderingContext2D, W: number, H: number, horizon: number, cx: number) {
  ctx.fillStyle = "#3b4148";
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.03, horizon);
  ctx.lineTo(cx - W * 0.01, horizon);
  ctx.lineTo(cx - W * 0.2, H);
  ctx.lineTo(cx - W * 0.42, H);
  ctx.closePath();
  ctx.fill();
}
