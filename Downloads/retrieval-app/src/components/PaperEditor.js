"use client";
import { useState, useEffect } from "react";
import { sb, SUPA_URL } from "../lib/supabase";
import { C } from "../lib/theme";
import { PaperResults } from "./PaperResults";
import { Btn, Card, Inp, Pill, TA } from "./ui";

export function PaperEditor({ user, paperId, classes, topics, onBack, onResults }) {
  const [paper, setPaper] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [section, setSection] = useState("questions"); // 'questions' | 'assign'
  const [loading, setLoading] = useState(true);
  const [editingQ, setEditingQ] = useState(null); // null | 'new' | <id>
  const [qDraft, setQDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  // Feedforward (upload-docx → feedforward) state.
  const [sheets, setSheets] = useState([]);
  const [ffStruggled, setFfStruggled] = useState([]); // selected paper_question ids
  const [ffNotes, setFfNotes] = useState("");
  const [ffFile, setFfFile] = useState(null);
  const [ffBusy, setFfBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, qs, ass, fs] = await Promise.all([
        sb.q("papers", { params: { id: `eq.${paperId}`, select: "*" } }),
        sb.q("paper_questions", { params: { paper_id: `eq.${paperId}`, select: "*", order: "sort_order.asc" } }),
        sb.q("paper_class_assignments", { params: { paper_id: `eq.${paperId}`, select: "*" } }),
        // Resilient: an older deploy without the table shouldn't break the editor.
        sb.q("paper_feedforward_sheets", { params: { paper_id: `eq.${paperId}`, select: "*", order: "created_at.desc" } }).catch(() => []),
      ]);
      setPaper(p[0]);
      setQuestions(qs || []);
      setAssignments(ass || []);
      setSheets(fs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const toggleStruggled = (id) => setFfStruggled(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const generateFeedforward = async () => {
    if (ffStruggled.length === 0 && !ffNotes.trim()) { alert("Tick the questions your class struggled with, or add a note."); return; }
    setFfBusy(true);
    try {
      let source_upload_path = null;
      if (ffFile) {
        const safe = ffFile.name.replace(/[^\w.\-]+/g, "_");
        source_upload_path = await sb.uploadToBucket("paper-uploads", `${user.id}/source/${crypto.randomUUID()}-${safe}`, ffFile);
      }
      const res = await sb.callPaperFeedforward({ paper_id: paperId, source_upload_path, struggled: { question_ids: ffStruggled, notes: ffNotes.trim() } });
      setFfNotes(""); setFfStruggled([]); setFfFile(null);
      await load();
      if (res?.url) window.open(res.url, "_blank");
    } catch (e) { alert("Generation failed: " + e.message); }
    setFfBusy(false);
  };

  const deleteSheet = async (sheet) => {
    if (!confirm("Delete this feedforward sheet?")) return;
    try { await sb.del("paper_feedforward_sheets", { id: `eq.${sheet.id}` }); await load(); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  useEffect(() => { load(); }, [paperId]);

  const startNewQuestion = () => {
    setQDraft({
      question_label: "", question_text: "", command_word: "Explain", marks: 2,
      topic_id: "", image_url: "",
      marking_points: [{ text: "", marks: 1 }, { text: "", marks: 1 }],
    });
    setEditingQ("new");
  };

  const startEditQuestion = (q) => {
    setQDraft({
      question_label: q.question_label || "",
      question_text: q.question_text,
      command_word: q.command_word || "Explain",
      marks: q.marks || 1,
      topic_id: q.topic_id || "",
      image_url: q.image_url || "",
      marking_points: Array.isArray(q.marking_points) && q.marking_points.length > 0 ? q.marking_points : [{ text: "", marks: 1 }],
    });
    setEditingQ(q.id);
  };

  const updateMarkingPointsForMarks = (n) => {
    setQDraft(d => {
      const cur = d.marking_points || [];
      const next = [...cur];
      while (next.length < n) next.push({ text: "", marks: 1 });
      while (next.length > n) next.pop();
      return { ...d, marks: n, marking_points: next };
    });
  };

  const saveQuestion = async () => {
    if (!qDraft.question_text.trim()) return;
    // Filter out empty marking points; warn if all empty
    const cleanPoints = (qDraft.marking_points || []).filter(p => p.text && p.text.trim()).map(p => ({ text: p.text.trim(), marks: p.marks || 1 }));
    if (cleanPoints.length === 0) {
      if (!confirm("This question has no marking points. The AI marker won't be able to score it. Save anyway?")) return;
    }
    setBusy(true);
    try {
      const body = {
        question_label: qDraft.question_label.trim() || null,
        question_text: qDraft.question_text.trim(),
        command_word: qDraft.command_word || null,
        marks: qDraft.marks || 1,
        topic_id: qDraft.topic_id || null,
        image_url: qDraft.image_url || null,
        marking_points: cleanPoints,
      };
      if (editingQ === "new") {
        body.paper_id = paperId;
        body.sort_order = questions.length;
        await sb.q("paper_questions", { method: "POST", body });
      } else {
        await sb.q("paper_questions", { method: "PATCH", params: { id: `eq.${editingQ}` }, body });
      }
      setEditingQ(null);
      setQDraft(null);
      await load();
    } catch (e) { console.error(e); alert("Save failed: " + e.message); }
    setBusy(false);
  };

  const deleteQuestion = async (id) => {
    if (!confirm("Delete this question? Any responses students have already given to it will be removed.")) return;
    await sb.q("paper_questions", { method: "DELETE", params: { id: `eq.${id}` } });
    await load();
  };

  const toggleAssignment = async (classId) => {
    const isAssigned = assignments.some(a => a.class_id === classId);
    if (isAssigned) {
      await sb.q("paper_class_assignments", { method: "DELETE", params: { paper_id: `eq.${paperId}`, class_id: `eq.${classId}` } });
    } else {
      await sb.q("paper_class_assignments", { method: "POST", body: { paper_id: paperId, class_id: classId } });
    }
    await load();
  };

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: C.dim, fontSize: 12 }}>Loading…</div>;
  if (!paper) return <div style={{ padding: 20, textAlign: "center", color: C.red }}>Paper not found.</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={{ padding: "6px 10px", fontSize: 11, borderRadius: 6, border: `1px solid ${C.bdr}`, background: "transparent", color: C.mid, cursor: "pointer", fontFamily: "inherit" }}>
          ← Papers
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{paper.name}</div>
          <div style={{ fontSize: 11, color: C.dim }}>{questions.length} question{questions.length === 1 ? "" : "s"} · {paper.total_marks} marks</div>
        </div>
        <button onClick={onResults} style={{ padding: "6px 10px", fontSize: 11, borderRadius: 6, border: `1px solid ${C.bdr}`, background: C.card, color: C.mid, cursor: "pointer", fontFamily: "inherit" }}>
          Results
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Pill on={section === "questions"} onClick={() => setSection("questions")}>Questions</Pill>
        <Pill on={section === "assign"} onClick={() => setSection("assign")}>Assign to classes ({assignments.length})</Pill>
        <Pill on={section === "feedforward"} onClick={() => setSection("feedforward")}>Feedforward ({sheets.length})</Pill>
      </div>

      {section === "questions" && (
        <>
          {editingQ ? (
            <Card style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.txt, marginBottom: 10 }}>{editingQ === "new" ? "New question" : "Edit question"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Inp placeholder="Label e.g. 1(a)" value={qDraft.question_label} onChange={e => setQDraft(d => ({ ...d, question_label: e.target.value }))} style={{ width: 100 }} />
                  <select value={qDraft.command_word} onChange={e => setQDraft(d => ({ ...d, command_word: e.target.value }))}
                    style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, color: C.txt, fontSize: 13, flex: 1 }}>
                    {["State","Define","Describe","Explain","Calculate","Suggest","Evaluate","Compare"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Inp type="number" min={1} max={10} value={qDraft.marks} onChange={e => updateMarkingPointsForMarks(parseInt(e.target.value) || 1)} style={{ width: 70 }} />
                </div>
                <TA placeholder="Question text" value={qDraft.question_text} onChange={e => setQDraft(d => ({ ...d, question_text: e.target.value }))} rows={3} />
                <select value={qDraft.topic_id} onChange={e => setQDraft(d => ({ ...d, topic_id: e.target.value }))}
                  style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, color: C.txt, fontSize: 13 }}>
                  <option value="">No topic (paper-only)</option>
                  {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 6 }}>Marking points (one per mark — what earns each mark)</div>
                  {qDraft.marking_points.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 22, height: 22, marginTop: 8, borderRadius: 99, background: C.card2, color: C.mid, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                      <TA placeholder={`Marking point ${i + 1} — what earns this mark?`} value={p.text} rows={2}
                        onChange={e => setQDraft(d => ({ ...d, marking_points: d.marking_points.map((mp, j) => j === i ? { ...mp, text: e.target.value } : mp) }))} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Btn onClick={saveQuestion} disabled={!qDraft.question_text.trim() || busy} style={{ flex: 1 }}>{editingQ === "new" ? "Add question" : "Save"}</Btn>
                  <Btn v="ghost" onClick={() => { setEditingQ(null); setQDraft(null); }} style={{ fontSize: 12 }}>Cancel</Btn>
                </div>
              </div>
            </Card>
          ) : (
            <Btn onClick={startNewQuestion} style={{ marginBottom: 12, padding: "8px 14px", fontSize: 12 }}>+ Add question</Btn>
          )}

          {questions.length === 0 ? (
            <Card style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: C.dim }}>No questions yet. Add the first one above.</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {questions.map((q, i) => (
                <Card key={q.id} style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 28, fontSize: 11, color: C.mid, fontWeight: 700, marginTop: 2 }}>{q.question_label || `Q${i + 1}`}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: C.txt, lineHeight: 1.4 }}>{q.question_text}</div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {q.command_word && <span>{q.command_word}</span>}
                        <span>·</span>
                        <span>{q.marks} mark{q.marks === 1 ? "" : "s"}</span>
                        <span>·</span>
                        <span>{(q.marking_points || []).length} marking point{(q.marking_points || []).length === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => startEditQuestion(q)} style={{ padding: "4px 8px", fontSize: 10, borderRadius: 6, border: `1px solid ${C.bdr}`, background: "transparent", color: C.mid, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                      <button onClick={() => deleteQuestion(q.id)} style={{ padding: "4px 8px", fontSize: 10, borderRadius: 6, border: `1px solid ${C.red}55`, background: "transparent", color: C.red, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {section === "assign" && (
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 10, lineHeight: 1.5 }}>Tick the classes that should see this paper. Students in those classes will be able to take it from their dashboard.</div>
          {classes.length === 0 ? <div style={{ fontSize: 12, color: C.dim }}>You don't have any classes yet.</div> :
            classes.map(c => {
              const isAssigned = assignments.some(a => a.class_id === c.id);
              return (
                <div key={c.id} onClick={() => toggleAssignment(c.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: isAssigned ? C.priSoft : C.card2, border: `1px solid ${isAssigned ? C.pri + "55" : C.bdr}`, marginBottom: 6, cursor: "pointer" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isAssigned ? C.pri : C.bdr}`, background: isAssigned ? C.pri : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{isAssigned ? "✓" : ""}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: C.txt, fontWeight: 500 }}>{c.name}{c.year_group ? ` (Y${c.year_group})` : ""}</div>
                  </div>
                </div>
              );
            })}
        </Card>
      )}

      {section === "feedforward" && (
        <>
          <Card style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.txt, marginBottom: 6 }}>Generate a feedforward sheet</div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
              Tick the questions your class struggled with (and/or add a note). I&apos;ll build a one-page practice
              sheet in the standard style — fresh parallel questions scaffolded down from those topics — as a Word document.
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 6 }}>Exam paper (optional — for your records)</div>
              <input type="file" accept=".docx,.doc,application/pdf,image/*" onChange={e => setFfFile(e.target.files?.[0] || null)} style={{ fontSize: 12, color: C.mid }} />
              {ffFile && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{ffFile.name}</div>}
            </div>

            {questions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 6 }}>Questions the class struggled with</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {questions.map((q, i) => {
                    const on = ffStruggled.includes(q.id);
                    return (
                      <div key={q.id} onClick={() => toggleStruggled(q.id)}
                        style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: on ? C.priSoft : C.card2, border: `1px solid ${on ? C.pri + "55" : C.bdr}`, cursor: "pointer" }}>
                        <div style={{ width: 16, height: 16, marginTop: 2, borderRadius: 4, border: `2px solid ${on ? C.pri : C.bdr}`, background: on ? C.pri : "transparent", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? "✓" : ""}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 11, color: C.mid, fontWeight: 700, marginRight: 6 }}>{q.question_label || `Q${i + 1}`}</span>
                          <span style={{ fontSize: 11, color: C.txt }}>{q.question_text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <TA placeholder="Notes — what did they get wrong? e.g. 'muddled osmosis and diffusion; couldn't link enzyme shape to temperature'" value={ffNotes} onChange={e => setFfNotes(e.target.value)} rows={3} />

            <Btn onClick={generateFeedforward} disabled={ffBusy} style={{ marginTop: 10, padding: "8px 14px", fontSize: 12 }}>{ffBusy ? "Generating…" : "Generate feedforward sheet"}</Btn>
          </Card>

          {sheets.length === 0 ? (
            <Card style={{ padding: 24, textAlign: "center" }}><div style={{ fontSize: 12, color: C.dim }}>No feedforward sheets yet.</div></Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sheets.map(s => (
                <Card key={s.id} style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: C.txt, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || "Feedforward sheet"}</div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : ""}</div>
                    </div>
                    <a href={`${SUPA_URL}/storage/v1/object/public/paper-uploads/${s.docx_path}`} target="_blank" rel="noreferrer"
                      style={{ padding: "4px 10px", fontSize: 10, borderRadius: 6, border: `1px solid ${C.bdr}`, background: C.card, color: C.mid, textDecoration: "none" }}>Download</a>
                    <button onClick={() => deleteSheet(s)} style={{ padding: "4px 8px", fontSize: 10, borderRadius: 6, border: `1px solid ${C.red}55`, background: "transparent", color: C.red, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── PaperResults — per-student results table for a paper ─── */
