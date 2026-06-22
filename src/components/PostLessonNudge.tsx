"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sk } from "@/lib/sk";

// Post-lesson nudge — shown when the teacher EXITS Present mode. A light, fully
// dismissable prompt that turns "I just taught this" into the next loop step:
//   • Turn the class's gaps into a feedforward sheet (the reteach path), and/or
//   • Generate retrieval questions from this deck (the assess path).
//
// It does NOT change presenting — it only intercepts the terminal EXIT action so
// the teacher gets one calm prompt on the way out. "Exit" / Esc / backdrop all
// dismiss straight through to the original destination (default /slides).
//
// Deck↔class link: decks have lesson_id/unit_id but no class column. If the deck
// is linked to a lesson we send the teacher to that lesson's loop (where the class
// gaps + feedforward live); otherwise we drop them on the lesson list / slides so
// they can pick the class. The reteach + questions tools all live on the lesson
// page, so the nudge's job is just to route there at the right moment.
export function PostLessonNudge({ deck, onExit, onQuestions }: {
  deck: any;
  onExit: () => void;             // perform the original exit (e.g. router.push("/slides"))
  onQuestions?: () => void;       // optional: open deck→questions in place
}) {
  const router = useRouter();
  const [lessonHref, setLessonHref] = useState<string | null>(null);

  // If this deck is tied to a lesson, deep-link to that lesson page (where the
  // feedforward + weak-topics tools already live). Best-effort; never blocks exit.
  useEffect(() => {
    const lessonId = deck?.lesson_id || null;
    const unitId = deck?.unit_id || null;
    if (lessonId && unitId) { setLessonHref(`/unit/${unitId}/lesson/${lessonId}`); return; }
    if (lessonId) {
      // Have a lesson but no unit on the deck row — look up its unit.
      (async () => {
        try {
          const l: any = await sk.q("lessons", { params: { id: `eq.${lessonId}`, select: "unit_id" }, single: true });
          if (l?.unit_id) setLessonHref(`/unit/${l.unit_id}/lesson/${lessonId}`);
        } catch { /* leave null — the reteach button just routes to the lesson list */ }
      })();
    }
  }, [deck?.lesson_id, deck?.unit_id]);

  const goReteach = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    router.push(lessonHref || "/");
  };

  return (
    <div onClick={onExit}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, background: "#faf6ec", borderRadius: 14, padding: "26px 28px", boxShadow: "0 24px 70px rgba(0,0,0,0.4)" }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5e7c4b", marginBottom: 8 }}>
          Lesson done?
        </div>
        <div style={{ fontSize: 21, lineHeight: 1.25, color: "#1a1714", marginBottom: 8, fontFamily: "Georgia, serif" }}>
          Close the loop on this class
        </div>
        <div style={{ fontSize: 13, color: "#4d4940", lineHeight: 1.5, marginBottom: 20 }}>
          Turn what they got wrong into the next step — a feedforward reteach sheet from this class's
          weakest topics, or retrieval questions built from this deck.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={goReteach}
            style={{ width: "100%", padding: "12px 16px", fontSize: 14, fontWeight: 600, color: "#f3eee2", background: "#1a1714", border: "none", borderRadius: 9, cursor: "pointer", textAlign: "left" }}>
            ↻ Turn gaps into a feedforward sheet →
          </button>
          {onQuestions && (
            <button onClick={onQuestions}
              style={{ width: "100%", padding: "12px 16px", fontSize: 14, fontWeight: 600, color: "#1a1714", background: "transparent", border: "1px solid #dcd5c0", borderRadius: 9, cursor: "pointer", textAlign: "left" }}>
              ❓ Generate retrieval questions from this deck
            </button>
          )}
        </div>

        <button onClick={onExit}
          style={{ marginTop: 18, background: "none", border: "none", color: "#8c8678", fontSize: 12, fontFamily: "monospace", cursor: "pointer", padding: 0 }}>
          Just exit · Esc
        </button>
      </div>
    </div>
  );
}
