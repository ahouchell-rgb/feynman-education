"use client";
import { useEffect, useState } from "react";
import { ret, sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { DeckQuestionsModal } from "@/components/DeckQuestionsModal";

// Placeholder shown in the freshly-opened print tab while the sheet loads.
// (Same string the other feedforward surfaces use — keeps the loading screen consistent.)
const SHEET_LOADING_HTML = "<!doctype html><meta charset=utf-8><title>Feedforward</title><body style='margin:0;font:16px/1.5 system-ui,sans-serif;color:#555;display:flex;align-items:center;justify-content:center;height:100vh'>Generating your sheet…</body>";

interface Cls { id: string; name: string; retrieval_class_ids?: string[] | null; }
interface Gap { topic_id: string; topic_name: string; pct_correct: number; marked: number; }

interface Props {
  // The lesson this loop belongs to. /api/feedforward requires a lessonId, so the
  // feedforward action is only offered when we have one (e.g. a deck linked to a
  // lesson, or the home page's current lesson).
  lessonId?: string | null;
  // Pre-select this class if it's known (e.g. the home card's next-lesson class).
  defaultClassId?: string | null;
  // When given, the "Set retrieval questions" action opens DeckQuestionsModal on
  // these slides (the deck → questions path). Omit to hide that action.
  slides?: any[] | null;
  lessonTitle?: string;
  // Compact heading copy.
  heading?: string;
}

/**
 * CloseLoopCard — the one-click "teach → assess → reteach" bridge. Given a class
 * (picked, or pre-selected), it surfaces that class's weakest retrieval topics and
 * offers, in one place:
 *   • "Make a feedforward sheet"   → /api/feedforward (the existing reteach flow,
 *                                     same payload as ClassWeakTopics/UnitGaps)
 *   • "Set retrieval questions"    → DeckQuestionsModal → /api/deck-to-questions
 *
 * The deck↔class link: decks carry lesson_id/unit_id but no class column, so we
 * associate by the teacher's own retrieval-linked classes (classes.retrieval_class_ids)
 * and ask which class when there's more than one. Weak-topic data is read server-side
 * under the teacher's JWT (ret.weakTopics → class_weak_topics RPC), never the secret.
 */
export function CloseLoopCard({ lessonId, defaultClassId, slides, lessonTitle = "", heading = "Close the loop" }: Props) {
  const [classes, setClasses] = useState<Cls[] | null>(null); // null = loading
  const [classId, setClassId] = useState("");
  const [gaps, setGaps] = useState<Gap[] | null>(null);       // null = loading / not yet fetched
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showQuestions, setShowQuestions] = useState(false);

  // Load the teacher's classes that are linked to a retrieval class.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const rows: Cls[] = await sk.q("classes", { params: { select: "id,name,retrieval_class_ids,archived", order: "name.asc" } });
        if (!live) return;
        const usable = (rows || []).filter((c: any) => (c.retrieval_class_ids || []).length && !c.archived);
        setClasses(usable);
        const preferred = usable.find((c) => c.id === defaultClassId) || usable[0];
        if (preferred) setClassId(preferred.id);
      } catch {
        if (live) setClasses([]);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultClassId]);

  const selected = classes?.find((c) => c.id === classId) || null;
  const retIds = selected?.retrieval_class_ids || [];

  // Pull the selected class's weakest topics whenever it changes.
  useEffect(() => {
    let live = true;
    if (!retIds.length) { setGaps([]); return; }
    setGaps(null);
    ret.weakTopics(retIds)
      .then((g) => { if (live) setGaps(g as Gap[]); })
      .catch(() => { if (live) setGaps([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retIds.join(",")]);

  const genFeedforward = async () => {
    if (!gaps?.length || !lessonId) return;
    // Open the print window now, inside the click — window.open after an await is
    // blocked by browsers (notably iPad Safari), so the sheet would never appear.
    const w = window.open("", "_blank");
    if (w) w.document.write(SHEET_LOADING_HTML);
    setBusy(true); setErr("");
    try {
      const token = sk.auth.getSession()?.access_token;
      if (!token) throw new Error("Sign in again to generate.");
      const r = await fetch("/api/feedforward", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lessonId, className: selected?.name,
          gaps: gaps.map((g) => ({ topic_name: g.topic_name, pct_correct: g.pct_correct, marked: g.marked })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (w) { w.document.open(); w.document.write(j.html); w.document.close(); }
      else setErr("Allow pop-ups to open the printable sheet.");
    } catch (e: any) {
      w?.close();
      setErr(e.message || "Couldn't generate the sheet.");
    } finally {
      setBusy(false);
    }
  };

  if (classes === null) return null; // stay quiet until we know whether to render

  const hasQuestions = Array.isArray(slides) && slides.length > 0;
  // Nothing actionable to show: no linked class AND no deck-questions path.
  if (classes.length === 0 && !hasQuestions) {
    return (
      <div style={cardStyle}>
        <Head heading={heading} />
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          Link a class to its retrieval data on the{" "}
          <a href="/manage" style={{ color: C.grn, fontWeight: 600 }}>Manage classes</a>{" "}
          page to turn this lesson's gaps into a feedforward sheet.
        </div>
      </div>
    );
  }

  const topGap = gaps?.[0];
  const pct = topGap ? Math.round(topGap.pct_correct) : null;
  const col = pct == null ? C.dim : pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red;

  return (
    <div style={cardStyle}>
      <Head heading={heading} />

      {classes.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: ".06em" }}>Class</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}
            style={{ padding: "6px 9px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface, color: C.text, outline: "none" }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Top gap line — the single most actionable thing for the chosen class. */}
      {classes.length > 0 && (
        gaps === null ? (
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginBottom: 12 }}>Loading retrieval data…</div>
        ) : topGap ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 12 }}>
            <span style={{ fontFamily: C.serif, fontSize: 20, fontWeight: 600, color: col, minWidth: 46, textAlign: "right" }}>{pct}%</span>
            <span style={{ flex: 1, minWidth: 0, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Weakest: {topGap.topic_name}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, flexShrink: 0 }}>{topGap.marked} marked</span>
          </div>
        ) : (
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginBottom: 12 }}>
            No retrieval gaps yet for {selected?.name || "this class"}.
          </div>
        )
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {lessonId && (
          <Btn onClick={genFeedforward} disabled={busy || !topGap}
            title={topGap ? "" : "No retrieval gaps to build from yet"}>
            {busy ? "Generating…" : "Make a feedforward sheet"}
          </Btn>
        )}
        {hasQuestions && (
          <Btn v="soft" onClick={() => setShowQuestions(true)}>❓ Set retrieval questions</Btn>
        )}
      </div>
      {err ? <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>{err}</div> : null}

      {showQuestions && hasQuestions && (
        <DeckQuestionsModal slides={slides!} lessonTitle={lessonTitle} onClose={() => setShowQuestions(false)} />
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
  borderLeft: `3px solid ${C.grn}`, padding: 16,
};

function Head({ heading }: { heading: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>
        {heading}
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>teach → assess → reteach</span>
    </div>
  );
}
