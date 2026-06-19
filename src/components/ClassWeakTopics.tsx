"use client";
import { useEffect, useState } from "react";
import { ret, sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Card } from "@/lib/primitives";

interface Props {
  lessonId: string;
  contextClass?: { name?: string; retrieval_class_ids?: string[] } | null;
  onSaved?: () => void;
}
interface Gap { topic_id: string; topic_name: string; pct_correct: number; marked: number; students: number; }

/**
 * ClassWeakTopics — the class-wide sibling of UnitGaps. Instead of "gaps in THIS unit",
 * it pulls the class's weakest topics across ITS WHOLE retrieval history
 * (ret.weakTopics → class_weak_topics RPC) and builds a reteach feedforward sheet from
 * exactly those — independent of the lesson's unit, so it works for any class that has
 * practised in the retrieval app (including ones whose topics aren't unit-mapped).
 *
 * Renders nothing unless the lesson has a linked retrieval class with weak topics.
 */
export function ClassWeakTopics({ lessonId, contextClass, onSaved }: Props) {
  const retIds = contextClass?.retrieval_class_ids || [];
  const [gaps, setGaps] = useState<Gap[] | null>(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    if (retIds.length === 0) { setGaps([]); return; }
    setGaps(null);
    ret.weakTopics(retIds)
      .then((g) => { if (live) setGaps(g as Gap[]); })
      .catch(() => { if (live) setGaps([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retIds.join(",")]);

  if (retIds.length === 0) return null;        // no linked retrieval class
  if (gaps && gaps.length === 0) return null;  // nothing weak enough to show

  const genFeedforward = async () => {
    if (!gaps) return;
    setBusy(true); setErr("");
    try {
      const token = sk.auth.getSession()?.access_token;
      if (!token) throw new Error("Sign in again to generate.");
      const r = await fetch("/api/feedforward", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lessonId, className: contextClass?.name,
          // no source -> the default reteach prompt (scaffolded practice on each weak topic)
          gaps: gaps.map((g) => ({ topic_name: g.topic_name, pct_correct: g.pct_correct, marked: g.marked })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const w = window.open("", "_blank");
      if (w) { w.document.open(); w.document.write(j.html); w.document.close(); }
      else { setErr("Allow pop-ups to open the printable sheet."); }
      onSaved?.();
    } catch (e: any) {
      setErr(e.message || "Couldn't generate the sheet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ padding: 16, marginBottom: 24, borderLeft: `3px solid ${C.red}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>
          Weak topics{contextClass?.name ? ` · ${contextClass.name}` : ""}
        </div>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>retrieval app · all topics</span>
      </div>

      {gaps === null ? (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading retrieval data…</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {gaps.map((g) => {
              const pct = Math.round(g.pct_correct);
              const col = pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red;
              return (
                <div key={g.topic_id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ fontFamily: C.serif, fontSize: 18, fontWeight: 600, color: col, minWidth: 42, textAlign: "right" }}>{pct}%</span>
                  <span style={{ flex: 1, minWidth: 0, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.topic_name}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, flexShrink: 0 }}>{g.marked} marked</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn onClick={genFeedforward} disabled={busy}>{busy ? "Generating…" : "Generate feedforward sheet"}</Btn>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>Scaffolded reteach practice on the class's weakest retrieval topics · opens to print</span>
          </div>
          {err ? <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>{err}</div> : null}
        </>
      )}
    </Card>
  );
}
