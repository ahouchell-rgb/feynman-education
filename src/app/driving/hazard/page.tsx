"use client";
import { useEffect, useRef, useState } from "react";
import { C } from "@/lib/theme";
import { Shell, TopBar, PageTitle, card, fmtTime } from "@/components/driving/ui";
import { HazardScene } from "@/components/driving/HazardScene";
import { HAZARD_CLIPS, HAZARD_PASS_MARK, MAX_PER_HAZARD } from "@/lib/driving/hazardClips";
import { scoreHazard, detectCheat } from "@/lib/driving/hazardScore";
import type { HazardClip } from "@/lib/driving/types";
import { recordHazardAttempt } from "@/lib/driving/storage";

interface ClipResult {
  clip: HazardClip;
  perHazard: number[];
  cheated: boolean;
  score: number;
}

type Phase = "intro" | "countdown" | "playing" | "review" | "done";

export default function HazardPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [clipIdx, setClipIdx] = useState(0);
  const [count, setCount] = useState(3);
  const [clicks, setClicks] = useState<number[]>([]);
  const [results, setResults] = useState<ClipResult[]>([]);
  const [playKey, setPlayKey] = useState(0);
  const [now, setNow] = useState(0);
  const clicksRef = useRef<number[]>([]);
  const timeRef = useRef(0);

  const clip = HAZARD_CLIPS[clipIdx];
  const maxScore = HAZARD_CLIPS.reduce((s, c) => s + c.hazards.length * MAX_PER_HAZARD, 0);
  const passMark = Math.round((HAZARD_PASS_MARK / 75) * maxScore);

  // countdown before each clip
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count <= 0) {
      clicksRef.current = [];
      setClicks([]);
      setPlayKey((k) => k + 1);
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, count]);

  const begin = () => { setClipIdx(0); setResults([]); setCount(3); setPhase("countdown"); };

  const handleClick = () => {
    if (phase !== "playing") return;
    const ct = timeRef.current;
    clicksRef.current = [...clicksRef.current, ct];
    setClicks((c) => [...c, ct]);
  };

  const onEnd = () => {
    const cheated = detectCheat(clicksRef.current);
    const perHazard = clip.hazards.map((h) =>
      cheated ? 0 : scoreHazard(h.windowStart, h.windowEnd, clicksRef.current)
    );
    const score = perHazard.reduce((a, b) => a + b, 0);
    const res: ClipResult = { clip, perHazard, cheated, score };
    setResults((r) => [...r, res]);
    setPhase("review");
  };

  const nextClip = () => {
    if (clipIdx + 1 >= HAZARD_CLIPS.length) {
      const total = [...results].reduce((a, r) => a + r.score, 0);
      recordHazardAttempt({ at: Date.now(), score: total, total: maxScore, passed: total >= passMark });
      setPhase("done");
    } else {
      setClipIdx((i) => i + 1);
      setCount(3);
      setPhase("countdown");
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
              Watch each dashcam clip and <strong>click the moment a hazard starts developing</strong> — something that
              would make you slow down, change direction or stop. Click early as it develops to score more (up to 5 per
              hazard). There are {HAZARD_CLIPS.length} clips and {maxScore / MAX_PER_HAZARD} scoring hazards.
            </>
          }
        />
        <div style={{ ...card, padding: "22px 24px" }}>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["Click as a hazard develops", "Earlier clicks (as the hazard begins) score more — 5 down to 1."],
              ["One clip has two hazards", "Just like the real test — stay alert right to the end of each clip."],
              ["Don't click continuously", "Mashing the button or clicking in a steady rhythm scores 0 for that clip."],
              ["Pass mark", `${passMark} out of ${maxScore} here (the real DVSA test is 44 out of 75).`],
            ].map(([h, d]) => (
              <li key={h} style={{ display: "flex", gap: 12 }}>
                <span style={{ color: C.grn, fontWeight: 700 }}>›</span>
                <span>
                  <strong style={{ fontSize: 15 }}>{h}</strong>
                  <span style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 2 }}>{d}</span>
                </span>
              </li>
            ))}
          </ul>
          <button onClick={begin} style={primaryBtn}>Start hazard perception →</button>
        </div>
        <p style={{ fontSize: 12, color: C.dim, marginTop: 16, lineHeight: 1.5 }}>
          These are original animated practice clips for this app, not DVSA footage — they reproduce the timing and
          scoring mechanic so you can train your hazard response.
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
          <div style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.dim }}>
            Hazard perception · Result
          </div>
          <div style={{ fontFamily: C.serif, fontSize: 60, lineHeight: 1, margin: "12px 0", color: passed ? C.grn : C.red }}>
            {total}/{maxScore}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: passed ? C.grn : C.red }}>
            {passed ? "PASS" : "NOT YET — keep practising"}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Pass mark here is {passMark}/{maxScore}.</div>
        </div>
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          {results.map((r, i) => (
            <div key={i} style={{ ...card, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 15 }}>Clip {i + 1}: {r.clip.title}</strong>
                <span style={{ fontFamily: C.mono, fontSize: 13, color: r.cheated ? C.red : C.text }}>
                  {r.cheated ? "0 (clicked too much)" : `${r.score}/${r.clip.hazards.length * MAX_PER_HAZARD}`}
                </span>
              </div>
              {r.clip.hazards.map((h, j) => (
                <div key={j} style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                  {h.label} — scored <strong style={{ color: r.perHazard[j] >= 3 ? C.grn : r.perHazard[j] > 0 ? C.amb : C.red }}>{r.cheated ? 0 : r.perHazard[j]}</strong>/5
                </div>
              ))}
              <div style={{ fontSize: 12, color: C.dim, marginTop: 8, lineHeight: 1.5, borderTop: `1px solid ${C.rule}`, paddingTop: 8 }}>
                {r.clip.debrief}
              </div>
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
  return (
    <Shell>
      <TopBar active="/driving/hazard" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>
          Clip {clipIdx + 1} of {HAZARD_CLIPS.length} · {clip.title}
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{clip.hazards.length} hazard{clip.hazards.length > 1 ? "s" : ""} to spot</div>
      </div>

      <div
        onClick={handleClick}
        style={{ position: "relative", cursor: phase === "playing" ? "pointer" : "default", userSelect: "none" }}
        role="button"
        aria-label="Click when you see a developing hazard"
      >
        <HazardScene
          clip={clip}
          playKey={playKey}
          clicksRef={clicksRef}
          onTime={(t) => { timeRef.current = t; if (Math.abs(t - now) > 0.05) setNow(t); }}
          onEnd={onEnd}
        />

        {/* countdown overlay */}
        {phase === "countdown" && (
          <div style={overlay}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: C.serif, fontSize: 90, color: "#fff", lineHeight: 1 }}>{count > 0 ? count : "GO"}</div>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: "#cfd6dd", marginTop: 8 }}>Get ready — watch for hazards</div>
            </div>
          </div>
        )}

        {/* flag feedback pill */}
        {phase === "playing" && (
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, alignItems: "center", background: "rgba(0,0,0,0.45)", padding: "5px 10px", borderRadius: 99 }}>
            <span style={{ color: "#fff", fontFamily: C.mono, fontSize: 12 }}>⏱ {fmtTime(Math.floor(timeRef.current))} · {clicks.length} flag{clicks.length === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      {phase === "playing" && (
        <p style={{ textAlign: "center", fontFamily: C.mono, fontSize: 13, color: C.muted, marginTop: 14 }}>
          👆 Click anywhere on the clip the moment a hazard starts developing
        </p>
      )}

      {phase === "review" && (
        <div style={{ ...card, padding: "18px 20px", marginTop: 16 }}>
          <strong style={{ fontSize: 15 }}>Clip {clipIdx + 1} complete</strong>
          {(() => {
            const r = results[results.length - 1];
            if (!r) return null;
            return (
              <div style={{ marginTop: 8 }}>
                {r.cheated && <div style={{ color: C.red, fontSize: 13, marginBottom: 6 }}>You clicked too often / too rhythmically, so this clip scored 0 — in the real test, click only as each hazard develops.</div>}
                {r.clip.hazards.map((h, j) => (
                  <div key={j} style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                    {h.label}: <strong style={{ color: (r.cheated ? 0 : r.perHazard[j]) >= 3 ? C.grn : (r.cheated ? 0 : r.perHazard[j]) > 0 ? C.amb : C.red }}>{r.cheated ? 0 : r.perHazard[j]}/5</strong>
                  </div>
                ))}
                <div style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>{r.clip.debrief}</div>
              </div>
            );
          })()}
          <button onClick={nextClip} style={{ ...primaryBtn, marginTop: 14 }}>
            {clipIdx + 1 >= HAZARD_CLIPS.length ? "See results →" : "Next clip →"}
          </button>
        </div>
      )}
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
  background: "rgba(10,14,18,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
};
