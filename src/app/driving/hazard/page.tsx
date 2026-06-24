"use client";
import { useRef, useState } from "react";
import { C } from "@/lib/theme";
import { Shell, TopBar, PageTitle, card, fmtTime } from "@/components/driving/ui";
import { HazardScene } from "@/components/driving/HazardScene";
import {
  HAZARD_CLIPS,
  MAX_PER_HAZARD,
  maxHazardScore,
  hazardPassMark,
  tooManyFalseAlarms,
} from "@/lib/driving/hazardSim";
import type { HazardClip } from "@/lib/driving/types";
import { recordHazardAttempt } from "@/lib/driving/storage";

interface ClipResult {
  clip: HazardClip;
  perHazard: { label: string; band: number }[];
  falseAlarms: number;
  voided: boolean;
  score: number;
}

type Phase = "intro" | "countdown" | "playing" | "review" | "done";

export default function HazardPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [clipIdx, setClipIdx] = useState(0);
  const [count, setCount] = useState(3);
  const [results, setResults] = useState<ClipResult[]>([]);
  const [playKey, setPlayKey] = useState(0);
  const [hud, setHud] = useState({ t: 0, spotted: 0, falseAlarms: 0 });
  const [flash, setFlash] = useState<{ band: number; at: number } | null>(null);

  const scoresRef = useRef<Map<string, number>>(new Map());
  const falseRef = useRef<number[]>([]);

  const clip = HAZARD_CLIPS[clipIdx];
  const maxScore = maxHazardScore();
  const passMark = hazardPassMark();

  const startClip = (idx: number) => {
    setClipIdx(idx);
    setCount(3);
    setPhase("countdown");
    runCountdown(3, idx);
  };

  const runCountdown = (n: number, idx: number) => {
    if (n <= 0) {
      scoresRef.current = new Map();
      falseRef.current = [];
      setHud({ t: 0, spotted: 0, falseAlarms: 0 });
      setFlash(null);
      setPlayKey((k) => k + 1);
      setPhase("playing");
      return;
    }
    setCount(n);
    setTimeout(() => runCountdown(n - 1, idx), 850);
  };

  const begin = () => { setResults([]); startClip(0); };

  const onScore = (hazardId: string, band: number, t: number) => {
    scoresRef.current.set(hazardId, band);
    setHud((h) => ({ ...h, spotted: scoresRef.current.size }));
    setFlash({ band, at: t });
  };
  const onFalseAlarm = (t: number) => {
    falseRef.current.push(t);
    setHud((h) => ({ ...h, falseAlarms: falseRef.current.length }));
  };

  const onEnd = () => {
    const voided = tooManyFalseAlarms(falseRef.current);
    const perHazard = clip.hazards.map((h) => ({ label: h.label, band: voided ? 0 : scoresRef.current.get(h.id) ?? 0 }));
    const score = perHazard.reduce((a, b) => a + b.band, 0);
    setResults((r) => [...r, { clip, perHazard, falseAlarms: falseRef.current.length, voided, score }]);
    setPhase("review");
  };

  const nextClip = () => {
    if (clipIdx + 1 >= HAZARD_CLIPS.length) {
      const total = results.reduce((a, r) => a + r.score, 0);
      recordHazardAttempt({ at: Date.now(), score: total, total: maxScore, passed: total >= passMark });
      setPhase("done");
    } else {
      startClip(clipIdx + 1);
    }
  };

  /* ── intro ── */
  if (phase === "intro")
    return (
      <Shell>
        <TopBar active="/driving/hazard" />
        <PageTitle
          kicker="Driving perception"
          title="Hazard perception test"
          sub={
            <>
              You&apos;re driving. Watch the road and <strong>click directly on a hazard the moment it starts to
              develop</strong> — a pedestrian stepping out, a car pulling from a junction, a cyclist moving into your
              lane. React early to score more (up to 5 per hazard). {HAZARD_CLIPS.length} clips,{" "}
              {maxScore / MAX_PER_HAZARD} hazards to spot.
            </>
          }
        />
        <div style={{ ...card, padding: "22px 24px" }}>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["Click the hazard itself", "Tap or click directly on the developing hazard on screen to react to it."],
              ["React early", "The sooner you click as it develops, the higher you score (5 → 1)."],
              ["Watch for decoys", "Other people and cars are just traffic — only click something that becomes a danger to you."],
              ["Don't click randomly", "Clicking all over the screen counts as false alarms and can void the clip."],
              ["Pass mark", `${passMark} of ${maxScore} here (the real DVSA test is 44 of 75).`],
            ].map(([h, d]) => (
              <li key={h} style={{ display: "flex", gap: 12 }}>
                <span style={{ color: C.grn, fontWeight: 700 }}>›</span>
                <span><strong style={{ fontSize: 15 }}>{h}</strong><span style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 2 }}>{d}</span></span>
              </li>
            ))}
          </ul>
          <button onClick={begin} style={primaryBtn}>Start driving →</button>
        </div>
        <p style={{ fontSize: 12, color: C.dim, marginTop: 16, lineHeight: 1.5 }}>
          These are original animated practice clips for this app, not DVSA footage — they reproduce the timing and
          scoring so you can train your hazard response.
        </p>
      </Shell>
    );

  /* ── done ── */
  if (phase === "done") {
    const total = results.reduce((a, r) => a + r.score, 0);
    const passed = total >= passMark;
    return (
      <Shell>
        <TopBar active="/driving/hazard" />
        <div style={{ ...card, padding: "32px 28px", textAlign: "center", borderColor: passed ? C.grn : C.red }}>
          <div style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.dim }}>Hazard perception · Result</div>
          <div style={{ fontFamily: C.serif, fontSize: 60, lineHeight: 1, margin: "12px 0", color: passed ? C.grn : C.red }}>{total}/{maxScore}</div>
          <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: passed ? C.grn : C.red }}>{passed ? "PASS" : "NOT YET — keep practising"}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Pass mark here is {passMark}/{maxScore}.</div>
        </div>
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          {results.map((r, i) => (
            <div key={i} style={{ ...card, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 15 }}>Clip {i + 1}: {r.clip.title}</strong>
                <span style={{ fontFamily: C.mono, fontSize: 13, color: r.voided ? C.red : C.text }}>{r.voided ? "0 (too many false alarms)" : `${r.score}/${r.clip.hazards.length * MAX_PER_HAZARD}`}</span>
              </div>
              {r.perHazard.map((h, j) => (
                <div key={j} style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                  {h.label} — scored <strong style={{ color: h.band >= 3 ? C.grn : h.band > 0 ? C.amb : C.red }}>{h.band}</strong>/5
                </div>
              ))}
              <div style={{ fontSize: 12, color: C.dim, marginTop: 8, lineHeight: 1.5, borderTop: `1px solid ${C.rule}`, paddingTop: 8 }}>{r.clip.debrief}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={begin} style={primaryBtn}>Try again</button>
          <a href="/driving" style={{ ...primaryBtn, textDecoration: "none", background: C.surface, color: C.text, border: `1px solid ${C.border}` }}>Back to home</a>
        </div>
      </Shell>
    );
  }

  /* ── playing / countdown / review ── */
  const showFlash = flash && hud.t - flash.at < 1.1;
  return (
    <Shell>
      <TopBar active="/driving/hazard" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>Clip {clipIdx + 1} of {HAZARD_CLIPS.length} · {clip.title}</div>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{clip.hazards.length} hazard{clip.hazards.length > 1 ? "s" : ""} to spot</div>
      </div>

      <div style={{ position: "relative" }}>
        <HazardScene
          clip={clip}
          playKey={playKey}
          onTime={(t) => setHud((h) => (Math.abs(t - h.t) > 0.05 ? { ...h, t } : h))}
          onScore={onScore}
          onFalseAlarm={onFalseAlarm}
          onEnd={onEnd}
        />

        {phase === "countdown" && (
          <div style={overlay}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: C.serif, fontSize: 96, color: "#fff", lineHeight: 1 }}>{count > 0 ? count : "GO"}</div>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: "#cfd6dd", marginTop: 8 }}>Get ready — watch for developing hazards</div>
            </div>
          </div>
        )}

        {phase === "playing" && (
          <>
            <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8, alignItems: "center", background: "rgba(0,0,0,0.5)", padding: "5px 11px", borderRadius: 99 }}>
              <span style={{ color: "#fff", fontFamily: C.mono, fontSize: 12 }}>⏱ {fmtTime(Math.floor(hud.t))}</span>
              <span style={{ color: "#7fd49a", fontFamily: C.mono, fontSize: 12 }}>● {hud.spotted}/{clip.hazards.length}</span>
              {hud.falseAlarms > 0 && <span style={{ color: "#e2b33c", fontFamily: C.mono, fontSize: 12 }}>⚑ {hud.falseAlarms}</span>}
            </div>
            {showFlash && (
              <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(46,124,75,0.92)", color: "#fff", fontFamily: C.mono, fontSize: 13, fontWeight: 700, padding: "6px 12px", borderRadius: 8 }}>
                Hazard spotted +{flash!.band}
              </div>
            )}
          </>
        )}
      </div>

      {phase === "playing" && (
        <p style={{ textAlign: "center", fontFamily: C.mono, fontSize: 13, color: C.muted, marginTop: 14 }}>
          👆 Click directly on a hazard the moment it starts to develop
        </p>
      )}

      {phase === "review" && (() => {
        const r = results[results.length - 1];
        if (!r) return null;
        return (
          <div style={{ ...card, padding: "18px 20px", marginTop: 16 }}>
            <strong style={{ fontSize: 15 }}>Clip {clipIdx + 1} complete</strong>
            {r.voided && <div style={{ color: C.red, fontSize: 13, margin: "6px 0" }}>Too many false alarms, so this clip scored 0 — click only on genuine developing hazards.</div>}
            <div style={{ marginTop: 8 }}>
              {r.perHazard.map((h, j) => (
                <div key={j} style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                  {h.label}: <strong style={{ color: h.band >= 3 ? C.grn : h.band > 0 ? C.amb : C.red }}>{h.band}/5</strong>{h.band === 0 ? " — not reacted to in time" : ""}
                </div>
              ))}
              <div style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>{r.clip.debrief}</div>
            </div>
            <button onClick={nextClip} style={{ ...primaryBtn, marginTop: 14 }}>{clipIdx + 1 >= HAZARD_CLIPS.length ? "See results →" : "Next clip →"}</button>
          </div>
        );
      })()}
    </Shell>
  );
}

const primaryBtn = {
  marginTop: 18,
  padding: "13px 26px",
  borderRadius: 8,
  border: "none",
  background: C.accent,
  color: C.accentFg,
  fontFamily: C.mono,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-block",
} as const;

const overlay = {
  position: "absolute" as const,
  inset: 0,
  background: "rgba(10,14,18,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
};
