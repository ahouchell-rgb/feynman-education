"use client";
// Deck → retrieval questions: review & save modal.
//
// Generates DRAFT retrieval-practice questions from the open deck (via
// /api/deck-to-questions), lets the teacher review/edit them, pick the target
// class + topic, and saves the chosen ones into the student question bank.
//
// The save writes to the SAME anchor `questions` table the retrieval-app's QMgr
// uses, with the identical row shape — so RLS, the plan-gate and the shared-guard
// trigger govern it exactly as they do an in-app insert. Targeting is
// class.subject_id → topics → questions (verified against the live schema).
import { useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { Btn, Inp, Badge } from "@/lib/primitives";
import { sk } from "@/lib/sk";
import { bookletForTopic } from "@/lib/publicBooklets";

interface Draft { question_text: string; model_answer: string; marks: number; _on: boolean; }
interface Cls { id: string; name: string; subject_id?: string | null; }
interface Topic { id: string; name: string; }

const taStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6,
  fontFamily: C.sans, fontSize: 13, background: C.surface, color: C.text, outline: "none", resize: "vertical",
};
const selStyle: React.CSSProperties = {
  padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6,
  fontFamily: C.mono, fontSize: 12, background: C.surface, color: C.text, outline: "none",
};
const label: React.CSSProperties = { fontSize: 11, fontFamily: C.mono, color: C.dim, fontWeight: 600, letterSpacing: "0.04em" };

export function DeckQuestionsModal({ slides, lessonTitle = "", onClose }: { slides: any[]; lessonTitle?: string; onClose: () => void; }) {
  const userId = sk.auth.user()?.id || null;

  const [classes, setClasses] = useState<Cls[] | null>(null);
  const [classId, setClassId] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);

  const [count, setCount] = useState(6);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);      // generating
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(0);

  const subjectId = classes?.find(c => c.id === classId)?.subject_id || "";

  // Load the teacher's classes (only those linked to a retrieval subject).
  useEffect(() => {
    (async () => {
      try {
        const rows: Cls[] = await sk.q("classes", { params: { select: "id,name,subject_id,archived", order: "name.asc" } });
        const usable = (rows || []).filter((c: any) => c.subject_id && !c.archived);
        setClasses(usable);
        if (usable.length) setClassId(usable[0].id);
      } catch (e: any) {
        setClasses([]);
        setErr(e?.message || "Couldn't load your classes.");
      }
    })();
  }, []);

  // Load topics whenever the chosen class (subject) changes.
  useEffect(() => {
    setTopicId(""); setTopics([]);
    if (!subjectId) return;
    (async () => {
      try {
        const rows: Topic[] = await sk.q("topics", { params: { subject_id: `eq.${subjectId}`, select: "id,name", order: "sort_order.asc" } });
        setTopics(rows || []);
        if (rows?.length) setTopicId(rows[0].id);
      } catch { setTopics([]); }
    })();
  }, [subjectId]);

  const createTopic = async () => {
    const name = newTopic.trim();
    if (!name || !subjectId) return;
    setCreatingTopic(true); setErr("");
    try {
      const [t]: Topic[] = await sk.q("topics", { method: "POST", body: { subject_id: subjectId, name, sort_order: topics.length } });
      setTopics(p => [...p, t]); setTopicId(t.id); setNewTopic("");
    } catch (e: any) {
      setErr(e?.message || "Couldn't create the topic — your plan may not allow custom topics.");
    }
    setCreatingTopic(false);
  };

  const generate = async () => {
    setBusy(true); setErr(""); setSaved(0);
    try {
      // Give the model the topic's existing questions (if a topic is chosen) so it doesn't repeat them.
      let existing: string[] = [];
      if (topicId) {
        try {
          const qs = await sk.q("questions", { params: { topic_id: `eq.${topicId}`, archived: "eq.false", select: "question_text", limit: "40" } });
          existing = (qs || []).map((q: any) => q.question_text);
        } catch { /* best effort */ }
      }
      const token = sk.auth.getToken();
      const r = await fetch("/api/deck-to-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slides, lessonTitle, count, existing }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Generation failed (${r.status})`);
      setDrafts((d.questions || []).map((q: any) => ({ ...q, _on: true })));
    } catch (e: any) {
      setErr(e?.message || "Generation failed.");
    }
    setBusy(false);
  };

  const updDraft = (i: number, patch: Partial<Draft>) => setDrafts(d => d!.map((q, j) => j === i ? { ...q, ...patch } : q));

  const save = async () => {
    if (!drafts || !topicId || !userId) return;
    const chosen = drafts.filter(q => q._on && q.question_text.trim() && q.model_answer.trim());
    if (!chosen.length) return;
    setSaving(true); setErr("");
    let n = 0, failed = false;
    for (const q of chosen) {
      try {
        await sk.q("questions", { method: "POST", body: {
          topic_id: topicId,
          question_text: q.question_text.trim(),
          model_answer: q.model_answer.trim(),
          marks: q.marks || 1,
          difficulty: 1,
          created_by: userId,
        } });
        n++;
      } catch { failed = true; }
    }
    setSaved(n);
    if (failed && !n) setErr("Couldn't save — your plan may not allow custom questions, or you lack permission for this class.");
    else if (failed) setErr("Some questions couldn't be saved.");
    else setDrafts(null);
    setSaving(false);
  };

  const chosenCount = drafts ? drafts.filter(q => q._on).length : 0;
  const topicName = topics.find(t => t.id === topicId)?.name || "";
  // If this topic also has a public revision booklet, shared questions go live there too.
  const booklet = bookletForTopic(topicId);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(26,23,20,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ ...label, color: C.grn }}>✦ Retrieval questions</div>
            <div style={{ fontFamily: C.serif, fontSize: 22, color: C.text, lineHeight: 1.2 }}>Generate from this deck</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Drafts are grounded in your slides. Review, then save the keepers to a topic in your class's question bank.</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {classes === null ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>Loading your classes…</div>
        ) : classes.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: 13, background: C.bg, borderRadius: 8 }}>
            No class is linked to a retrieval subject yet. Set up a class in the retrieval app first, then questions can be saved to its bank.
          </div>
        ) : (
          <>
            {/* Target: class + topic */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={label}>Class</span>
                <select value={classId} onChange={e => setClassId(e.target.value)} style={selStyle}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 160 }}>
                <span style={label}>Topic</span>
                <select value={topicId} onChange={e => setTopicId(e.target.value)} style={{ ...selStyle, width: "100%" }}>
                  {!topics.length && <option value="">No topics yet — create one →</option>}
                  {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: booklet ? 10 : 16 }}>
              <Inp placeholder="…or a new topic (e.g. lesson title)" value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && createTopic()} style={{ fontFamily: C.sans }} />
              <Btn v="soft" onClick={createTopic} disabled={creatingTopic || !newTopic.trim()} style={{ whiteSpace: "nowrap" }}>{creatingTopic ? "Adding…" : "＋ Topic"}</Btn>
            </div>

            {/* One pipeline, two surfaces: this topic also has a public revision booklet,
                so questions published to the shared bank go live there too. */}
            {booklet && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 16, padding: "9px 11px", background: C.grnS, border: `1px solid ${C.grn}33`, borderRadius: 8 }}>
                <span style={{ fontSize: 13, lineHeight: 1.4 }}>📖</span>
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.45 }}>
                  <strong style={{ fontWeight: 600 }}>Also feeds the public revision booklet.</strong> Once shared to the central bank, these questions appear in the live practice on{" "}
                  <a href={booklet.url} target="_blank" rel="noreferrer" style={{ color: C.grn, fontWeight: 600 }}>{booklet.slug}</a> — no login needed for pupils.
                </div>
              </div>
            )}

            {/* Generate */}
            {!drafts && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, border: `1px dashed ${C.border}`, borderRadius: 8, background: C.bg }}>
                <span style={{ fontSize: 12, color: C.muted }}>How many:</span>
                <Inp type="number" min={1} max={12} value={count} onChange={e => setCount(Math.max(1, Math.min(12, parseInt(e.target.value) || 6)))} style={{ width: 70 }} />
                <Btn onClick={generate} disabled={busy} style={{ marginLeft: "auto" }}>{busy ? "Reading your slides…" : "✦ Generate from deck"}</Btn>
              </div>
            )}

            {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.redS, color: C.red, fontSize: 12 }}>{err}</div>}
            {saved > 0 && !drafts && <div style={{ marginTop: 12, fontSize: 13, color: C.grn, fontWeight: 600 }}>✓ {saved} question{saved !== 1 ? "s" : ""} saved to {topicName || "the bank"} — your pupils will see them in retrieval practice{booklet ? ", and once shared they go live on the public revision booklet too" : ""}.</div>}

            {/* Drafts review */}
            {drafts && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: C.dim }}>{drafts.length} draft{drafts.length !== 1 ? "s" : ""} — edit, untick any you don't want, then save.</div>
                {drafts.map((q, i) => (
                  <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, background: q._on ? C.bg : "transparent", opacity: q._on ? 1 : 0.5, display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted, cursor: "pointer", fontFamily: C.mono }}>
                      <input type="checkbox" checked={q._on} onChange={e => updDraft(i, { _on: e.target.checked })} /> include
                    </label>
                    <textarea value={q.question_text} onChange={e => updDraft(i, { question_text: e.target.value })} rows={2} style={taStyle} />
                    <textarea value={q.model_answer} onChange={e => updDraft(i, { model_answer: e.target.value })} rows={2} style={{ ...taStyle, color: C.muted }} />
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: C.dim }}>Marks:</span>
                      <Inp type="number" min={1} max={6} value={q.marks} onChange={e => updDraft(i, { marks: Math.max(1, Math.min(6, parseInt(e.target.value) || 1)) })} style={{ width: 64 }} />
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  {!topicId && <Badge color={C.red} bg={C.redS}>Pick or create a topic first</Badge>}
                  <Btn onClick={save} disabled={saving || !chosenCount || !topicId} style={{ flex: 1 }}>
                    {saving ? "Saving…" : `Save ${chosenCount} to ${topicName ? `“${topicName}”` : "bank"}`}
                  </Btn>
                  <Btn v="ghost" onClick={() => { setDrafts(null); setErr(""); }}>Discard</Btn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
