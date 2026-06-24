"use client";
import type { RoadSign } from "@/lib/driving/types";

/* Draws a simplified but recognisable UK road sign from its id, as inline SVG.
 * Shapes follow the real conventions: red triangle = warning, red circle =
 * prohibition, blue circle = mandatory instruction, octagon = stop, inverted
 * triangle = give way, rectangles = information/direction. */

const RED = "#c1272d";
const BLUE = "#0b4ea2";
const GREEN = "#0b7a3b";
const BLACK = "#1a1714";
const WHITE = "#ffffff";

function Arrow({ dir = "left", color = WHITE }: { dir?: "left" | "right" | "up"; color?: string }) {
  const rot = dir === "left" ? 180 : dir === "up" ? -90 : 0;
  return (
    <g transform={`rotate(${rot} 50 50)`}>
      <path d="M30 50 H62 M52 38 L66 50 L52 62" stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function SignGlyph({ sign, size = 88 }: { sign: RoadSign; size?: number }) {
  const s = { width: size, height: size, display: "block" } as const;
  const vb = "0 0 100 100";
  const id = sign.id;

  // ── Warning triangles ──
  if (sign.kind === "warning") {
    let inner: JSX.Element | null = null;
    if (id.includes("bend")) inner = <path d="M42 72 C42 55 60 52 60 40 C60 32 52 28 46 32" stroke={BLACK} strokeWidth="6" fill="none" strokeLinecap="round" />;
    else if (id.includes("crossroads")) inner = <path d="M50 32 V70 M34 51 H66" stroke={BLACK} strokeWidth="7" strokeLinecap="round" />;
    else if (id.includes("roundabout")) inner = <path d="M50 36 a13 13 0 1 0 0.1 0 M50 30 v8 M62 56 l-7 -4" stroke={BLACK} strokeWidth="5" fill="none" />;
    else if (id.includes("children") || id.includes("pedestrian")) inner = <g><circle cx="50" cy="40" r="5" fill={BLACK} /><path d="M50 45 v16 M50 50 l-8 6 M50 50 l8 6 M50 61 l-6 10 M50 61 l6 10" stroke={BLACK} strokeWidth="4" strokeLinecap="round" /></g>;
    else if (id.includes("traffic-signals")) inner = <g><rect x="42" y="34" width="16" height="34" rx="3" fill={BLACK} /><circle cx="50" cy="41" r="3.5" fill={RED} /><circle cx="50" cy="51" r="3.5" fill="#e8a020" /><circle cx="50" cy="61" r="3.5" fill="#2faa4f" /></g>;
    else if (id.includes("tunnel")) inner = <path d="M36 70 V50 a14 14 0 0 1 28 0 V70" stroke={BLACK} strokeWidth="6" fill="none" />;
    else if (id.includes("two-way")) inner = <g stroke={BLACK} strokeWidth="5" fill="none" strokeLinecap="round"><path d="M44 70 V36 M44 36 l-5 7 M44 36 l5 7" /><path d="M58 36 V70 M58 70 l-5 -7 M58 70 l5 -7" /></g>;
    else inner = <text x="50" y="62" textAnchor="middle" fontSize="34" fill={BLACK} fontWeight="700">!</text>;
    return (
      <svg style={s} viewBox={vb} role="img" aria-label={sign.name}>
        <path d="M50 8 L92 84 H8 Z" fill={WHITE} stroke={RED} strokeWidth="8" strokeLinejoin="round" />
        {inner}
      </svg>
    );
  }

  // ── Regulatory ──
  if (sign.kind === "regulatory") {
    if (id === "reg-stop")
      return (
        <svg style={s} viewBox={vb} role="img" aria-label={sign.name}>
          <polygon points="32,8 68,8 92,32 92,68 68,92 32,92 8,68 8,32" fill={RED} stroke={WHITE} strokeWidth="4" />
          <text x="50" y="60" textAnchor="middle" fontSize="22" fill={WHITE} fontWeight="800" fontFamily="Arial">STOP</text>
        </svg>
      );
    if (id === "reg-give-way" || id === "mand-mini-roundabout")
      return (
        <svg style={s} viewBox={vb} role="img" aria-label={sign.name}>
          <path d="M8 16 H92 L50 90 Z" fill={WHITE} stroke={RED} strokeWidth="8" strokeLinejoin="round" />
          {id === "mand-mini-roundabout" && <text x="50" y="52" textAnchor="middle" fontSize="20" fill={BLACK} fontWeight="700">⟳</text>}
        </svg>
      );
    if (id === "reg-no-entry")
      return (
        <svg style={s} viewBox={vb} role="img" aria-label={sign.name}>
          <circle cx="50" cy="50" r="42" fill={RED} />
          <rect x="24" y="44" width="52" height="12" fill={WHITE} />
        </svg>
      );
    // mandatory (blue circle)
    if (id.startsWith("mand")) {
      let inner: JSX.Element | null = <text x="50" y="60" textAnchor="middle" fontSize="22" fill={WHITE} fontWeight="700">↑</text>;
      if (id.includes("turn-left")) inner = <Arrow dir="left" />;
      else if (id.includes("ahead")) inner = <Arrow dir="up" />;
      else if (id.includes("keep-left")) inner = <path d="M60 26 L36 50 L60 74" stroke={WHITE} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      return (
        <svg style={s} viewBox={vb} role="img" aria-label={sign.name}>
          <circle cx="50" cy="50" r="42" fill={BLUE} />
          {inner}
        </svg>
      );
    }
    // prohibitive (red ring, white centre)
    let inner: JSX.Element | null = null;
    if (id === "reg-30") inner = <text x="50" y="60" textAnchor="middle" fontSize="30" fill={BLACK} fontWeight="800">30</text>;
    else if (id === "reg-national") inner = <path d="M22 78 L78 22" stroke={BLACK} strokeWidth="6" />;
    else if (id === "reg-no-overtaking") inner = <g><rect x="34" y="40" width="14" height="22" rx="2" fill={BLACK} /><rect x="52" y="40" width="14" height="22" rx="2" fill={RED} /></g>;
    else if (id === "reg-no-uturn") inner = <g><path d="M38 64 V46 a12 12 0 0 1 24 0 V64" stroke={BLACK} strokeWidth="6" fill="none" /><path d="M62 64 l-5 -8 M62 64 l5 -8" stroke={BLACK} strokeWidth="6" fill="none" strokeLinecap="round" /></g>;
    else if (id === "reg-no-stopping") inner = <path d="M50 28 a22 22 0 1 0 0.1 0" stroke="#1f49a8" strokeWidth="7" fill="#1f49a8" opacity="0.9" />;
    return (
      <svg style={s} viewBox={vb} role="img" aria-label={sign.name}>
        <circle cx="50" cy="50" r="42" fill={WHITE} stroke={RED} strokeWidth="9" />
        {id === "reg-national" && <path d="M22 78 L78 22" stroke={BLACK} strokeWidth="6" />}
        {id !== "reg-national" && inner}
      </svg>
    );
  }

  // ── Information / direction (rectangles) ──
  const bg = id.includes("primary") ? GREEN : id.includes("local") ? WHITE : BLUE;
  const fg = bg === WHITE ? BLACK : WHITE;
  let label = "i";
  if (id.includes("parking")) label = "P";
  else if (id.includes("hospital")) label = "H";
  else if (id.includes("motorway")) label = "M";
  else if (id.includes("primary")) label = "A road";
  else if (id.includes("local")) label = "B road";
  return (
    <svg style={s} viewBox={vb} role="img" aria-label={sign.name}>
      <rect x="8" y="20" width="84" height="60" rx="6" fill={bg} stroke={fg === WHITE ? WHITE : BLACK} strokeWidth="3" />
      <text x="50" y="62" textAnchor="middle" fontSize={label.length > 1 ? 16 : 34} fill={fg} fontWeight="800">{label}</text>
    </svg>
  );
}
