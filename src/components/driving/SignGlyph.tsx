"use client";
import type { RoadSign } from "@/lib/driving/types";

/* Draws a recognisable UK road sign from its id as inline SVG. Shapes follow the
 * real conventions; symbols are simplified but faithful. viewBox is 0 0 100 100. */

const RED = "#c8102e";
const BLUE = "#0b4ea2";
const GREEN = "#007a33";
const BLACK = "#1b1b1b";
const WHITE = "#ffffff";

function A({ d, c = BLACK, w = 7, fill = "none", cap = "round" as const }: { d: string; c?: string; w?: number; fill?: string; cap?: CanvasLineCap }) {
  return <path d={d} stroke={c} strokeWidth={w} fill={fill} strokeLinecap={cap} strokeLinejoin="round" />;
}

/* ── symbol sets ─────────────────────────────────────────────────────────── */
function warnSymbol(id: string) {
  if (id.includes("crossroads")) return <A d="M50 30 V72 M29 51 H71" w={8} />;
  if (id.includes("tjunction")) return <A d="M29 38 H71 M50 38 V72" w={8} />;
  if (id.includes("roundabout"))
    return (
      <g fill="none" stroke={BLACK} strokeWidth={5}>
        <path d="M40 38 a14 14 0 1 0 14 -6" />
        <path d="M54 26 l6 6 l-8 4 z" fill={BLACK} stroke="none" />
        <path d="M62 58 l-2 8 l-7 -5 z" fill={BLACK} stroke="none" />
        <path d="M34 56 l8 2 l-3 8 z" fill={BLACK} stroke="none" />
      </g>
    );
  if (id.includes("double-bend")) return <A d="M44 72 C44 58 58 58 58 48 C58 40 44 40 44 30" w={7} />;
  if (id.includes("bend")) return <A d="M42 72 C42 54 60 52 60 40 C60 33 53 30 47 33" w={7} />;
  if (id.includes("road-narrows")) return <g><A d="M36 72 L44 30" w={6} /><A d="M64 72 L56 30" w={6} /></g>;
  if (id.includes("children"))
    return (
      <g fill={BLACK}>
        <circle cx="42" cy="40" r="4.5" /><path d="M42 45 v15 l-6 9 M42 60 l6 9 M42 49 l-8 5 M42 49 l8 5" stroke={BLACK} strokeWidth={3.4} fill="none" strokeLinecap="round" />
        <circle cx="58" cy="42" r="4" /><path d="M58 46 v13 l-5 8 M58 59 l5 8 M58 50 l7 4" stroke={BLACK} strokeWidth={3} fill="none" strokeLinecap="round" />
      </g>
    );
  if (id.includes("pedestrians"))
    return <g fill={BLACK}><circle cx="50" cy="38" r="5" /><path d="M50 43 v16 l-7 11 M50 59 l7 11 M50 47 l-9 6 M50 47 l9 6" stroke={BLACK} strokeWidth={3.6} fill="none" strokeLinecap="round" /></g>;
  if (id.includes("cycle"))
    return (
      <g stroke={BLACK} strokeWidth={3.2} fill="none">
        <circle cx="38" cy="60" r="9" /><circle cx="64" cy="60" r="9" />
        <path d="M38 60 L50 44 L64 60 M50 44 L46 60 M44 44 H54" strokeLinecap="round" />
      </g>
    );
  if (id.includes("slippery")) return <g><rect x="40" y="40" width="20" height="13" rx="2" fill={BLACK} /><A d="M30 70 q6 -8 12 0 q6 8 12 0" w={3.5} /><A d="M58 36 l8 -6 M62 40 l8 -4" w={3} /></g>;
  if (id.includes("roadworks")) return <g fill={BLACK}><circle cx="50" cy="34" r="5" /><path d="M50 39 v14 M50 44 h12 l4 -4" stroke={BLACK} strokeWidth={4} fill="none" strokeLinecap="round" /><path d="M40 70 l8 -18 6 3 -7 16 z" /></g>;
  if (id.includes("traffic-signals"))
    return <g><rect x="42" y="30" width="16" height="38" rx="3" fill={BLACK} /><circle cx="50" cy="38" r="4" fill={RED} /><circle cx="50" cy="49" r="4" fill="#f0a500" /><circle cx="50" cy="60" r="4" fill="#2faa4f" /></g>;
  if (id.includes("level-crossing")) return <g stroke={BLACK} strokeWidth={3.5} fill="none"><path d="M30 58 h40 M34 58 v8 M66 58 v8" /><circle cx="44" cy="46" r="5" fill={BLACK} stroke="none" /><path d="M36 52 h28 l-4 -8 h-20 z" fill={BLACK} stroke="none" /></g>;
  if (id.includes("steep-hill")) return <g><A d="M30 44 L70 68" w={6} /><text x="40" y="64" fontSize="13" fontWeight="700" fill={BLACK}>10%</text></g>;
  return <text x="50" y="64" textAnchor="middle" fontSize="40" fontWeight="800" fill={BLACK}>!</text>;
}

function mandSymbol(id: string) {
  if (id.includes("ahead-only")) return <A d="M50 72 V34 M50 34 l-9 11 M50 34 l9 11" c={WHITE} w={8} />;
  if (id.includes("turn-left")) return <A d="M58 70 V50 a0 0 0 0 0 0 0 Q58 40 48 40 H36 M36 40 l9 -8 M36 40 l9 8" c={WHITE} w={7} />;
  if (id.includes("turn-right")) return <A d="M42 70 V50 Q42 40 52 40 H64 M64 40 l-9 -8 M64 40 l-9 8" c={WHITE} w={7} />;
  if (id.includes("keep-left")) return <A d="M62 30 L40 52 L62 74 M40 52 H66" c={WHITE} w={8} />;
  if (id.includes("pass-either")) return <g>{A({ d: "M40 72 V40 M40 40 l-7 9 M40 40 l7 9", c: WHITE, w: 6 })}{A({ d: "M60 72 V40 M60 40 l-7 9 M60 40 l7 9", c: WHITE, w: 6 })}</g>;
  if (id.includes("mini-roundabout"))
    return (
      <g fill="none" stroke={WHITE} strokeWidth={5}>
        <path d="M40 40 a14 14 0 1 0 16 -4" />
        <path d="M56 36 l1 9 l-9 -3 z" fill={WHITE} stroke="none" />
      </g>
    );
  return <A d="M50 70 V34 M50 34 l-9 11 M50 34 l9 11" c={WHITE} w={8} />;
}

function prohibSymbol(id: string) {
  if (id === "reg-30" || id === "reg-20" || id === "reg-40") return <text x="50" y="64" textAnchor="middle" fontSize="34" fontWeight="800" fill={BLACK}>{id.slice(4)}</text>;
  if (id === "reg-national") return <line x1="26" y1="74" x2="74" y2="26" stroke={BLACK} strokeWidth={7} />;
  if (id === "reg-no-overtaking") return <g><rect x="34" y="40" width="13" height="22" rx="2" fill={RED} /><rect x="53" y="40" width="13" height="22" rx="2" fill={BLACK} /></g>;
  if (id === "reg-no-left") return <A d="M60 66 V52 Q60 44 50 44 H40 M40 44 l9 -7 M40 44 l9 7" c={BLACK} w={7} />;
  if (id === "reg-no-uturn") return <A d="M38 66 V48 a12 12 0 0 1 24 0 V60 M62 60 l-5 -8 M62 60 l5 -8" c={BLACK} w={6} />;
  if (id === "reg-no-vehicles") return null;
  return null;
}

export function SignGlyph({ sign, size = 96 }: { sign: RoadSign; size?: number }) {
  const st = { width: size, height: size, display: "block" } as const;
  const vb = "0 0 100 100";
  const id = sign.id;

  // ── STOP ──
  if (id === "reg-stop")
    return (
      <svg style={st} viewBox={vb} role="img" aria-label={sign.name}>
        <polygon points="33,6 67,6 94,33 94,67 67,94 33,94 6,67 6,33" fill={RED} stroke={WHITE} strokeWidth="5" />
        <text x="50" y="59" textAnchor="middle" fontSize="22" fontWeight="800" fill={WHITE} fontFamily="Arial, sans-serif">STOP</text>
      </svg>
    );

  // ── Give way ──
  if (id === "reg-give-way")
    return (
      <svg style={st} viewBox={vb} role="img" aria-label={sign.name}>
        <path d="M8 16 H92 L50 90 Z" fill={WHITE} stroke={RED} strokeWidth="9" strokeLinejoin="round" />
      </svg>
    );

  // ── No entry ──
  if (id === "reg-no-entry")
    return (
      <svg style={st} viewBox={vb} role="img" aria-label={sign.name}>
        <circle cx="50" cy="50" r="44" fill={RED} />
        <rect x="22" y="43" width="56" height="14" rx="2" fill={WHITE} />
      </svg>
    );

  // ── Warning triangle ──
  if (sign.kind === "warning")
    return (
      <svg style={st} viewBox={vb} role="img" aria-label={sign.name}>
        <path d="M50 7 L93 84 Q95 90 88 90 H12 Q5 90 7 84 Z" fill={WHITE} stroke={RED} strokeWidth="7" strokeLinejoin="round" />
        {warnSymbol(id)}
      </svg>
    );

  // ── Mandatory (blue circle) ──
  if (id.startsWith("mand"))
    return (
      <svg style={st} viewBox={vb} role="img" aria-label={sign.name}>
        <circle cx="50" cy="50" r="44" fill={BLUE} />
        {mandSymbol(id)}
      </svg>
    );

  // ── No waiting / no stopping (blue disc, red ring + diagonals) ──
  if (id === "reg-no-waiting" || id === "reg-no-stopping")
    return (
      <svg style={st} viewBox={vb} role="img" aria-label={sign.name}>
        <circle cx="50" cy="50" r="44" fill="#1761b0" />
        <circle cx="50" cy="50" r="44" fill="none" stroke={RED} strokeWidth="8" />
        {id === "reg-no-stopping" ? (
          <>
            <line x1="22" y1="22" x2="78" y2="78" stroke={RED} strokeWidth="8" />
            <line x1="78" y1="22" x2="22" y2="78" stroke={RED} strokeWidth="8" />
          </>
        ) : (
          <line x1="26" y1="26" x2="74" y2="74" stroke={RED} strokeWidth="8" />
        )}
      </svg>
    );

  // ── Prohibitive (white circle, red ring) ──
  if (sign.kind === "regulatory")
    return (
      <svg style={st} viewBox={vb} role="img" aria-label={sign.name}>
        <circle cx="50" cy="50" r="44" fill={WHITE} stroke={RED} strokeWidth="9" />
        {prohibSymbol(id)}
        {(id === "reg-no-left" || id === "reg-no-uturn" || id === "reg-no-vehicles") && (
          <line x1="24" y1="76" x2="76" y2="24" stroke={RED} strokeWidth="7" />
        )}
      </svg>
    );

  // ── Information / direction (rectangles) ──
  const bg = id.includes("primary") ? GREEN : id.includes("local") ? WHITE : BLUE;
  const fg = bg === WHITE ? BLACK : WHITE;
  let label = "i";
  if (id.includes("parking")) label = "P";
  else if (id.includes("hospital")) label = "H";
  else if (id.includes("motorway")) label = "M";
  else if (id.includes("primary")) label = "A1";
  else if (id.includes("local")) label = "B12";
  else if (id.includes("pedestrian")) label = "";
  return (
    <svg style={st} viewBox={vb} role="img" aria-label={sign.name}>
      <rect x="8" y="22" width="84" height="56" rx="6" fill={bg} stroke={bg === WHITE ? BLACK : "#ffffff55"} strokeWidth={bg === WHITE ? 3 : 2} />
      {id.includes("pedestrian") ? (
        <g fill={WHITE}>
          <circle cx="42" cy="40" r="5" /><path d="M42 45 v13 l-6 9 M42 58 l6 9 M42 48 l-7 5 M42 48 l7 5" stroke={WHITE} strokeWidth={3.2} fill="none" strokeLinecap="round" />
          <circle cx="58" cy="42" r="4" /><path d="M58 46 v11 l5 8 M58 57 l-5 8 M58 49 l6 4" stroke={WHITE} strokeWidth={2.8} fill="none" strokeLinecap="round" />
        </g>
      ) : (
        <text x="50" y={fg === BLACK ? 60 : 62} textAnchor="middle" fontSize={label.length > 1 ? 26 : 36} fontWeight="800" fill={fg} fontFamily="Arial, sans-serif">{label}</text>
      )}
    </svg>
  );
}
