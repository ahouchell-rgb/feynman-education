"use client";
import { useEffect, useMemo, useState } from "react";
import { sk, SK_URL, SK_KEY } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Inp } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

// Assessments & QLA (NOW plan E5). Create a common assessment, define questions
// (max marks + topic), enter marks per pupil, and read question-level analysis
// by question, topic and pupil. Owner-scoped; QLA computed from saved marks.

interface Assessment { id: string; title: string; class_id: string | null; students: string[]; }
interface Question { id: string; q_number: number; topic: string | null; max_marks: number; }
interface Mark { question_id: string; student_ref: string; marks: number; }

function heat(pct: number) { if (pct < 40) return C.red; if (pct < 65) return C.amb; return C.grn; }
const cell = { fontFamily: C.mono, fontSize: 12, padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.border}`, background: C.surface, color: C.text, width: 48, textAlign: "center" as const, outline: "none" };

async function upsertMarks(rows: any[]) {
  if (!rows.length) return;
  await fetch(`${SK_URL}/rest/v1/assessment_marks?on_conflict=question_id,student_ref`, {
    method: "POST",
    headers: { apikey: SK_KEY, Authorization: `Bearer ${sk.auth.getToken() || SK_KEY}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

function AssessmentsContent() {
  const [list, setList] = useState<Assessment[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [active, setActive] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({}); // `${qId}|${student}` → marks
  const [rosterText, setRosterText] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newClass, setNewClass] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const loadList = () => sk.q("assessments", { params: { select: "id,title,class_id,students", order: "created_at.desc" } }).then(setList).catch((e) => setErr(e.message));
  useEffect(() => {
    loadList();
    sk.q("classes", { params: { select: "id,name", archived: "eq.false", order: "name.asc" } }).then(setClasses).catch(() => {});
  }, []);

  const open = async (a: Assessment) => {
    setActive(a); setRosterText((a.students || []).join("\n")); setErr("");
    const [qs, ms] = await Promise.all([
      sk.q("assessment_questions", { params: { assessment_id: `eq.${a.id}`, select: "id,q_number,topic,max_marks", order: "q_number.asc" } }),
      sk.q("assessment_marks", { params: { assessment_id: `eq.${a.id}`, select: "question_id,student_ref,marks" } }),
    ]);
    setQuestions(qs || []);
    const m: Record<string, number> = {};
    (ms || []).forEach((x: Mark) => { m[`${x.question_id}|${x.student_ref}`] = Number(x.marks); });
    setMarks(m);
  };

  const create = async () => {
    if (!newTitle.trim()) return;
    try { const [a] = await sk.q("assessments", { method: "POST", body: { title: newTitle.trim(), class_id: newClass || null } }); setNewTitle(""); setNewClass(""); await loadList(); open(a); }
    catch (e: any) { setErr(e.message); }
  };
  const addQuestion = async () => {
    if (!active) return;
    const n = (questions[questions.length - 1]?.q_number || 0) + 1;
    const [q] = await sk.q("assessment_questions", { method: "POST", body: { assessment_id: active.id, q_number: n, max_marks: 1, topic: "" } });
    setQuestions((qs) => [...qs, q]);
  };
  const patchQuestion = async (id: string, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q) => q.id === id ? { ...q, ...patch } : q));
    await sk.q("assessment_questions", { method: "PATCH", params: { id: `eq.${id}` }, body: patch }).catch((e) => setErr(e.message));
  };
  const removeQuestion = async (id: string) => {
    await sk.del("assessment_questions", { id: `eq.${id}` });
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  };
  const saveRoster = async () => {
    if (!active) return;
    const students = rosterText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    await sk.q("assessments", { method: "PATCH", params: { id: `eq.${active.id}` }, body: { students } });
    setActive({ ...active, students });
  };
  const saveMarks = async () => {
    if (!active) return;
    setSaving(true); setErr("");
    try {
      const rows = Object.entries(marks).map(([k, v]) => { const [question_id, student_ref] = k.split("|"); return { assessment_id: active.id, question_id, student_ref, marks: v }; });
      await upsertMarks(rows);
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  const students = active?.students || [];

  // ── QLA ──
  const qla = useMemo(() => {
    const byQ = questions.map((q) => {
      const vals = students.map((s) => marks[`${q.id}|${s}`]).filter((v) => v != null) as number[];
      const pct = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / (q.max_marks * vals.length)) * 100) : null;
      return { q, pct, n: vals.length };
    });
    const topicMap = new Map<string, { sum: number; max: number }>();
    questions.forEach((q) => {
      const t = (q.topic || "").trim() || "(untagged)";
      const e = topicMap.get(t) || { sum: 0, max: 0 };
      students.forEach((s) => { const v = marks[`${q.id}|${s}`]; if (v != null) { e.sum += v; e.max += q.max_marks; } });
      topicMap.set(t, e);
    });
    const byTopic = [...topicMap.entries()].map(([topic, e]) => ({ topic, pct: e.max ? Math.round((e.sum / e.max) * 100) : null })).filter((t) => t.pct != null).sort((a, b) => (a.pct! - b.pct!));
    const totalMax = questions.reduce((a, q) => a + q.max_marks, 0);
    const byPupil = students.map((s) => {
      const got = questions.reduce((a, q) => a + (marks[`${q.id}|${s}`] || 0), 0);
      const answered = questions.some((q) => marks[`${q.id}|${s}`] != null);
      return { s, pct: answered && totalMax ? Math.round((got / totalMax) * 100) : null };
    });
    return { byQ, byTopic, byPupil };
  }, [questions, students, marks]);

  // ── list view ──
  if (!active) {
    return (
      <div>
        <Hd>Assessments</Hd>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, marginBottom: 8 }}>Mark, then <em style={{ fontStyle: "italic", color: C.grn }}>see</em> the gaps.</h1>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: "52ch", lineHeight: 1.55 }}>Capture marks per question and get instant question-level analysis by topic and pupil.</p>
        {err && <Errb>{err}</Errb>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
          <Inp placeholder="New assessment title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ maxWidth: 280 }} />
          <select value={newClass} onChange={(e) => setNewClass(e.target.value)} style={{ fontFamily: C.mono, fontSize: 13, padding: "9px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text }}>
            <option value="">No class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Btn onClick={create}>+ Create</Btn>
        </div>
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
          {list.length === 0 ? <div style={{ padding: 20, color: C.dim, fontFamily: C.mono, fontSize: 12 }}>No assessments yet.</div> :
            list.map((a, i) => (
              <button key={a.id} onClick={() => open(a)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}`, background: "transparent", border: "none", cursor: "pointer" }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: C.text, flex: 1 }}>{a.title}</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{(a.students || []).length} pupils</span>
                <span style={{ color: C.dim }}>→</span>
              </button>
            ))}
        </div>
      </div>
    );
  }

  // ── editor + QLA ──
  return (
    <div>
      <button onClick={() => { setActive(null); loadList(); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: C.mono, fontSize: 11, marginBottom: 14, padding: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>← Assessments</button>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 34, marginBottom: 16 }}>{active.title}</h1>
      {err && <Errb>{err}</Errb>}

      {/* questions */}
      <Sec>Questions</Sec>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, padding: 12, marginBottom: 24 }}>
        {questions.map((q) => {
          const untagged = !(q.topic || "").trim();
          return (
          <div key={q.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, width: 28 }}>Q{q.q_number}</span>
              <Inp placeholder="Topic / objective" value={q.topic || ""} onChange={(e) => patchQuestion(q.id, { topic: e.target.value })} style={{ flex: 1 }} />
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>max</span>
              <Inp type="number" min={1} value={q.max_marks} onChange={(e) => patchQuestion(q.id, { max_marks: Math.max(1, parseInt(e.target.value) || 1) })} style={{ width: 70 }} />
              <button onClick={() => removeQuestion(q.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 14 }}>×</button>
            </div>
            {/* Data-quality hint: an untagged question is invisible to the topic QLA
                and to the leadership mastery blend (which joins on objective/topic). */}
            {untagged && (
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amb, marginTop: 3, paddingLeft: 36 }}>
                Not linked to a curriculum objective — this won't show in leadership mastery dashboards.
              </div>
            )}
          </div>
          );
        })}
        <Btn v="soft" onClick={addQuestion} style={{ fontSize: 12 }}>+ Question</Btn>
      </div>

      {/* roster */}
      <Sec>Pupils</Sec>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 24 }}>
        <textarea value={rosterText} onChange={(e) => setRosterText(e.target.value)} onBlur={saveRoster} placeholder="One pupil per line" rows={3}
          style={{ flex: 1, fontFamily: C.mono, fontSize: 12, padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface, color: C.text, resize: "vertical" }} />
        <Btn v="soft" onClick={saveRoster}>Save list</Btn>
      </div>

      {/* marks grid */}
      {students.length > 0 && questions.length > 0 && (
        <>
          <Sec>Marks</Sec>
          <div style={{ overflowX: "auto", border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, marginBottom: 12 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 12px", position: "sticky", left: 0, background: C.surface, fontFamily: C.mono, fontSize: 11, color: C.dim }}>Pupil</th>
                  {questions.map((q) => <th key={q.id} style={{ padding: "8px 6px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>Q{q.q_number}<div style={{ color: C.faint }}>/{q.max_marks}</div></th>)}
                  <th style={{ padding: "8px 10px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>%</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const pupil = qla.byPupil.find((p) => p.s === s);
                  return (
                    <tr key={s} style={{ borderTop: `1px solid ${C.rule}` }}>
                      <td style={{ padding: "6px 12px", whiteSpace: "nowrap", position: "sticky", left: 0, background: C.surface }}>{s}</td>
                      {questions.map((q) => (
                        <td key={q.id} style={{ padding: "4px 4px", textAlign: "center" }}>
                          <input type="number" min={0} max={q.max_marks} value={marks[`${q.id}|${s}`] ?? ""}
                            onChange={(e) => { const v = e.target.value === "" ? undefined : Math.max(0, Math.min(q.max_marks, Number(e.target.value))); setMarks((m) => { const n = { ...m }; const k = `${q.id}|${s}`; if (v == null) delete n[k]; else n[k] = v; return n; }); }}
                            style={cell} />
                        </td>
                      ))}
                      <td style={{ padding: "6px 10px", textAlign: "center", fontFamily: C.mono, fontWeight: 600, color: pupil?.pct != null ? heat(pupil.pct) : C.faint }}>{pupil?.pct != null ? `${pupil.pct}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Btn onClick={saveMarks} disabled={saving} style={{ marginBottom: 32 }}>{saving ? "Saving…" : "Save marks"}</Btn>

          {/* QLA */}
          <Sec>Question-level analysis</Sec>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, overflow: "hidden" }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, padding: "10px 14px" }}>By question</div>
              {qla.byQ.map(({ q, pct }) => (
                <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: `1px solid ${C.rule}` }}>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, width: 36 }}>Q{q.q_number}</span>
                  <span style={{ fontSize: 12, color: C.dim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.topic || "—"}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: pct != null ? heat(pct) : C.faint }}>{pct != null ? `${pct}%` : "—"}</span>
                </div>
              ))}
            </div>
            <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, overflow: "hidden" }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, padding: "10px 14px" }}>By topic — weakest first</div>
              {qla.byTopic.length === 0 ? <div style={{ padding: "8px 14px", color: C.dim, fontSize: 12 }}>Tag questions with a topic to see this.</div> :
                qla.byTopic.map((t) => (
                  <div key={t.topic} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: `1px solid ${C.rule}` }}>
                    <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{t.topic}</span>
                    <div style={{ height: 6, width: 80, background: C.bg, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${Math.max(2, t.pct!)}%`, height: "100%", background: heat(t.pct!), opacity: 0.75 }} /></div>
                    <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: heat(t.pct!), width: 36, textAlign: "right" }}>{t.pct}%</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const Hd = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 24, height: 1, background: C.dim }} /><span>{children}</span></div>
);
const Sec = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}><span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} /><span>{children}</span><span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} /></div>
);
const Errb = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "10px 14px", background: C.redS, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 13, marginBottom: 18 }}>{children}</div>
);

export default function AssessmentsPage() {
  return <AppShell><AssessmentsContent /></AppShell>;
}
