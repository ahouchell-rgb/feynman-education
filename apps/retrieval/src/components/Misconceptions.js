"use client";
import { useState, useEffect } from "react";
import { sb, SUPA_URL, SUPA_KEY } from "../lib/supabase";
import { C } from "../lib/theme";
import { Card, Badge, Kicker, Headline, Deck, Btn } from "./ui";

/* Misconceptions — the WHY behind the gaps. ClassGaps shows which objectives a
 * class is weakest on (% correct); this clusters their actual WRONG answers into
 * named, specific misconceptions ("confuses displacement with distance") and lets
 * the teacher draft targeted reteach questions in one click. That closes the loop:
 * marking data -> insight -> new practice that re-tests the exact confusion.
 *
 * Reads the latest cached run instantly (class_misconception_runs, RLS-scoped to
 * the teacher's own classes); "Find / Refresh" calls the class-misconceptions edge
 * function to re-mine. The reteach button reuses generate-questions (with a `focus`)
 * and the normal question insert, so plan-gate + shared-guard still govern. */

const WINDOW_DAYS = 28;

const ago = (iso) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export function Misconceptions({ cls, userId }) {
  const [items, setItems] = useState(null);   // null = loading, [] = none
  const [computedAt, setComputedAt] = useState(null);
  const [mining, setMining] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  // Load the latest cached run for this class (instant; no AI call).
  useEffect(() => {
    let live = true;
    if (!cls?.id) { setItems([]); return; }
    setItems(null); setErr(""); setNote(""); setComputedAt(null);
    sb.q("class_misconception_runs", { params: {
      class_id: `eq.${cls.id}`, order: "computed_at.desc", limit: "1",
      select: "result,computed_at",
    } })
      .then((rows) => {
        if (!live) return;
        const run = Array.isArray(rows) && rows[0];
        if (run) { setItems(run.result?.misconceptions || []); setComputedAt(run.computed_at); }
        else setItems([]);
      })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [cls?.id]);

  const mine = async () => {
    if (!cls?.id) return;
    setMining(true); setErr(""); setNote("");
    try {
      const jwt = sb.auth.getToken();
      const r = await fetch(`${SUPA_URL}/functions/v1/class-misconceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${jwt || SUPA_KEY}` },
        body: JSON.stringify({ class_id: cls.id, days: WINDOW_DAYS }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Couldn't analyse answers (${r.status})`);
      setItems(d.misconceptions || []);
      setComputedAt(d.computed_at || new Date().toISOString());
      if (d.note) setNote(d.note);
    } catch (e) { setErr(String(e.message || e)); }
    setMining(false);
  };

  if (items === null) return (
    <Card style={{ padding: 16, marginTop: 18 }}>
      <div style={{ fontSize: 12, color: C.dim }}>Loading misconceptions…</div>
    </Card>
  );

  const hasItems = items.length > 0;

  return (
    <Card style={{ padding: "18px 18px 14px", marginTop: 18, borderLeft: `3px solid ${C.amb}` }}>
      <Kicker color={C.amb}>Misconceptions · the why behind the gaps</Kicker>
      <Headline size={18} style={{ marginBottom: 2 }}>What's tripping them up</Headline>
      <Deck style={{ marginBottom: 12 }}>
        The specific faulty ideas behind this class's wrong answers (last {WINDOW_DAYS} days) — and one-click practice to fix each.
      </Deck>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: hasItems ? 14 : 0, flexWrap: "wrap" }}>
        <Btn onClick={mine} disabled={mining} style={{ fontSize: 12, padding: "7px 12px" }}>
          {mining ? "Analysing answers…" : hasItems ? "↻ Refresh" : "✨ Find misconceptions"}
        </Btn>
        {computedAt && !mining && <span style={{ fontSize: 11, color: C.dim }}>analysed {ago(computedAt)}</span>}
      </div>

      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{err}</div>}
      {note && !hasItems && <div style={{ fontSize: 13, color: C.mid, marginTop: 10 }}>{note}</div>}
      {!hasItems && !note && !err && computedAt && (
        <div style={{ fontSize: 13, color: C.mid, marginTop: 10 }}>No clear shared misconception found — that's good news.</div>
      )}
      {!hasItems && !computedAt && !err && (
        <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
          Once the class has practised, this finds the patterns in their wrong answers.
        </div>
      )}

      {items.map((m, i) => (
        <div key={i} style={{ padding: "14px 0", borderTop: i ? `1px solid ${C.bdrSoft}` : "none" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: C.txt }}>{m.title}</div>
            {m.pupils ? <Badge color={C.red} style={{ flexShrink: 0 }}>{m.pupils} pupil{m.pupils === 1 ? "" : "s"}</Badge> : null}
          </div>
          {m.topic_name && (
            <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 3 }}>{m.topic_name}</div>
          )}
          {m.explanation && <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.5, marginTop: 7 }}>{m.explanation}</div>}
          {m.example_wrong && (
            <div style={{ fontSize: 12, color: C.dim, fontStyle: "italic", margin: "7px 0 0", paddingLeft: 10, borderLeft: `2px solid ${C.bdrSoft}` }}>
              e.g. “{m.example_wrong}”
            </div>
          )}
          {m.fix && (
            <div style={{ fontSize: 13, color: C.grn, lineHeight: 1.5, marginTop: 7 }}>
              <strong style={{ fontWeight: 700 }}>Reteach:</strong> {m.fix}
            </div>
          )}
          <Reteach m={m} userId={userId} />
        </div>
      ))}
    </Card>
  );
}

/* Per-misconception reteach: draft 3 questions that re-test THIS confusion, review,
 * save to the bank's topic. They then re-surface to pupils through normal retrieval. */
function Reteach({ m, userId }) {
  const [drafts, setDrafts] = useState(null);  // null = none yet
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(0);

  const draft = async () => {
    if (!m.topic_id) { setErr("Couldn't link this to a topic to add questions to."); return; }
    setBusy(true); setErr(""); setSaved(0);
    try {
      const jwt = sb.auth.getToken();
      const r = await fetch(`${SUPA_URL}/functions/v1/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${jwt || SUPA_KEY}` },
        body: JSON.stringify({ topic_name: m.topic_name, count: 3, focus: `${m.title}. ${m.fix}` }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Couldn't draft questions (${r.status})`);
      setDrafts((d.questions || []).map((q) => ({ ...q, _on: true })));
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  };

  const save = async () => {
    const chosen = (drafts || []).filter((q) => q._on && q.question_text.trim() && q.model_answer.trim());
    if (!chosen.length) return;
    setBusy(true); setErr("");
    let n = 0, failed = false;
    for (const q of chosen) {
      try {
        await sb.q("questions", { method: "POST", body: {
          topic_id: m.topic_id, question_text: q.question_text.trim(), model_answer: q.model_answer.trim(),
          marks: q.marks || 1, difficulty: 1, created_by: userId,
        } });
        n++;
      } catch { failed = true; }
    }
    setSaved(n);
    if (failed) setErr("Some couldn't be saved — your plan may not allow custom questions.");
    if (n) setDrafts(null);
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 10 }}>
      {!drafts && (
        <Btn v="ghost" onClick={draft} disabled={busy}
          style={{ fontSize: 11, padding: "5px 10px" }}>
          {busy ? "Drafting…" : saved ? `✓ ${saved} added — draft more` : "✎ Draft reteach questions"}
        </Btn>
      )}
      {saved > 0 && !drafts && <span style={{ fontSize: 11, color: C.grn, marginLeft: 8 }}>{saved} question{saved === 1 ? "" : "s"} added to the bank</span>}
      {err && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{err}</div>}

      {drafts && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: C.bgSoft || "rgba(0,0,0,0.02)", borderRadius: 8, border: `1px solid ${C.bdrSoft}` }}>
          {drafts.length === 0 && <div style={{ fontSize: 12, color: C.dim }}>No questions came back — try again.</div>}
          {drafts.map((q, j) => (
            <label key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", borderTop: j ? `1px solid ${C.bdrSoft}` : "none", cursor: "pointer" }}>
              <input type="checkbox" checked={!!q._on} onChange={(e) => setDrafts((d) => d.map((x, k) => k === j ? { ...x, _on: e.target.checked } : x))} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 12, lineHeight: 1.45 }}>
                <span style={{ color: C.txt, fontWeight: 600 }}>{q.question_text}</span>
                <span style={{ color: C.dim }}> [{q.marks || 1}]</span>
                <span style={{ display: "block", color: C.grn, marginTop: 2 }}>{q.model_answer}</span>
              </span>
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Btn onClick={save} disabled={busy || !drafts.some((q) => q._on)} style={{ fontSize: 11, padding: "5px 10px" }}>
              {busy ? "Saving…" : `Add ${drafts.filter((q) => q._on).length} to bank`}
            </Btn>
            <Btn v="ghost" onClick={() => setDrafts(null)} disabled={busy} style={{ fontSize: 11, padding: "5px 10px" }}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
