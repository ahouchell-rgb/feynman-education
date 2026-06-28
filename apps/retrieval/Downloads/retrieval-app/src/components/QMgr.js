"use client";
import { useState, useEffect, useRef } from "react";
import { SUPA_KEY, SUPA_URL, sb } from "../lib/supabase";
import { C } from "../lib/theme";
import { Badge, Btn, Headline, Inp, Kicker, Pill, TA } from "./ui";

export function QMgr({ subjectId, userId, topics, setTopics, canPublishShared = false }) {
  const [nt, setNt] = useState(""); const [tid, setTid] = useState(""); const [qt, setQt] = useState(""); const [qa, setQa] = useState(""); const [mk, setMk] = useState(1);
  const [added, setAdded] = useState(0); const [mode, setMode] = useState("single"); const [bt, setBt] = useState(""); const [imp, setImp] = useState(false);
  const [csvRows, setCsvRows] = useState(null); const [csvErr, setCsvErr] = useState(""); const [csvProgress, setCsvProgress] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  // Browse/edit state
  const [ql, setQl] = useState([]); const [qlLoading, setQlLoading] = useState(false);
  const [editId, setEditId] = useState(null); const [editQ, setEditQ] = useState(""); const [editA, setEditA] = useState(""); const [editMk, setEditMk] = useState(1);
  const [saving, setSaving] = useState(false); const [confirmArchive, setConfirmArchive] = useState(null);
  // Image attached to the single-add question (before upload) and the stored URL (after upload)
  const [qImageUrl, setQImageUrl] = useState("");
  const [qImageBusy, setQImageBusy] = useState(false);
  const [qImageErr, setQImageErr] = useState("");
  // Image state for the inline editor
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editImageBusy, setEditImageBusy] = useState(false);
  const [editImageErr, setEditImageErr] = useState("");
  // AI question generation (Tier-2: question acquisition)
  const [aiCount, setAiCount] = useState(5);
  const [aiBusy, setAiBusy] = useState(false); const [aiErr, setAiErr] = useState("");
  const [aiDrafts, setAiDrafts] = useState(null); // null | [{question_text, model_answer, marks, _on}]
  const [aiSaved, setAiSaved] = useState(0);
  // Tenant-fillable resource links (Tier-2)
  const [resList, setResList] = useState(null); const [resBusy, setResBusy] = useState(false); const [resErr, setResErr] = useState("");
  const [resUrl, setResUrl] = useState(""); const [resTitle, setResTitle] = useState(""); const [resKind, setResKind] = useState("tool");

  // Upload a File to the question-images bucket and return its public URL.
  // Caller is responsible for size/type validation.
  const uploadQuestionImage = async (file) => {
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
    const safeName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const jwt = sb.auth.getToken();
    const r = await fetch(`${SUPA_URL}/storage/v1/object/question-images/${safeName}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "image/png",
        "Authorization": `Bearer ${jwt || SUPA_KEY}`,
        "apikey": SUPA_KEY,
        "x-upsert": "true",
      },
      body: file,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Upload failed (${r.status}): ${t.slice(0, 200)}`);
    }
    return `${SUPA_URL}/storage/v1/object/public/question-images/${safeName}`;
  };

  const pickImageFor = async (file, setUrl, setBusy, setErr) => {
    setErr("");
    if (!file) return;
    if (!/^image\//.test(file.type)) { setErr("Must be an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("Image too large (5MB max)"); return; }
    setBusy(true);
    try { const url = await uploadQuestionImage(file); setUrl(url); }
    catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  };

  const addT = async () => { if (!nt.trim()) return; const [t] = await sb.q("topics", { method: "POST", body: { subject_id: subjectId, name: nt, sort_order: topics.length } }); setTopics(p => [...p, t]); setNt(""); setTid(t.id); };
  const addQ = async () => {
    if (!qt.trim() || !qa.trim() || !tid) return;
    const body = { topic_id: tid, question_text: qt, model_answer: qa, marks: mk, difficulty: 1, created_by: userId };
    if (qImageUrl) body.image_url = qImageUrl;
    await sb.q("questions", { method: "POST", body });
    setAdded(p => p + 1); setQt(""); setQa(""); setQImageUrl(""); setQImageErr("");
  };
  const bulkAdd = async () => {
    if (!bt.trim() || !tid) return; setImp(true);
    const lines = bt.split("\n").filter(l => l.includes("|")); let n = 0;
    for (const line of lines) { const [q, a] = line.split("|").map(s => s.trim()); if (q && a) { try { await sb.q("questions", { method: "POST", body: { topic_id: tid, question_text: q, model_answer: a, marks: 1, difficulty: 1, created_by: userId } }); n++; } catch {} } }
    setAdded(p => p + n); setBt(""); setImp(false);
  };

  const loadQl = async (topicId) => {
    if (!topicId) { setQl([]); return; }
    setQlLoading(true); setEditId(null); setConfirmArchive(null);
    try {
      const qs = await sb.q("questions", { params: { topic_id: `eq.${topicId}`, archived: "eq.false", select: "*", order: "created_at.asc" } });
      setQl(qs);
    } catch { setQl([]); }
    setQlLoading(false);
  };

  const startEdit = (q) => { setEditId(q.id); setEditQ(q.question_text); setEditA(q.model_answer); setEditMk(q.marks || 1); setEditImageUrl(q.image_url || ""); setEditImageErr(""); setConfirmArchive(null); };

  const saveEdit = async (id) => {
    if (!editQ.trim() || !editA.trim()) return;
    setSaving(true);
    try {
      const patch = { question_text: editQ.trim(), model_answer: editA.trim(), marks: editMk, image_url: editImageUrl || null };
      await sb.q("questions", { method: "PATCH", params: { id: `eq.${id}` }, body: patch });
      setQl(prev => prev.map(q => q.id === id ? { ...q, question_text: editQ.trim(), model_answer: editA.trim(), marks: editMk, image_url: editImageUrl || null } : q));
      setEditId(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const archiveQ = async (id) => {
    try {
      await sb.q("questions", { method: "PATCH", params: { id: `eq.${id}` }, body: { archived: true } });
      setQl(prev => prev.filter(q => q.id !== id));
      setConfirmArchive(null); setEditId(null);
    } catch (e) { console.error(e); }
  };

  // Publish / unpublish a question to the cross-school shared bank. The DB trigger
  // only honours this for moderators/HoDs; canPublishShared gates the UI to match.
  const setShared = async (id, shared) => {
    try {
      await sb.q("questions", { method: "PATCH", params: { id: `eq.${id}` }, body: { shared } });
      setQl(prev => prev.map(q => q.id === id ? { ...q, shared } : q));
    } catch (e) { console.error(e); }
  };

  // ── AI question generation ──
  const topicName = () => (topics.find(t => t.id === tid)?.name || "");
  const updDraft = (i, patch) => setAiDrafts(d => d.map((q, j) => j === i ? { ...q, ...patch } : q));
  const generateAI = async () => {
    if (!tid) return;
    setAiBusy(true); setAiErr(""); setAiSaved(0);
    try {
      // Give the model the topic's existing questions so it doesn't duplicate them.
      let existing = ql.map(q => q.question_text);
      if (!existing.length) {
        try { const qs = await sb.q("questions", { params: { topic_id: `eq.${tid}`, archived: "eq.false", select: "question_text", limit: "40" } }); existing = (qs || []).map(q => q.question_text); } catch { /* best effort */ }
      }
      const jwt = sb.auth.getToken();
      const r = await fetch(`${SUPA_URL}/functions/v1/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${jwt || SUPA_KEY}` },
        body: JSON.stringify({ topic_name: topicName(), count: aiCount, existing }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Generation failed (${r.status})`);
      setAiDrafts((d.questions || []).map(q => ({ ...q, _on: true })));
    } catch (e) { setAiErr(String(e.message || e)); }
    setAiBusy(false);
  };
  const saveAIDrafts = async () => {
    if (!aiDrafts || !tid) return;
    setAiBusy(true); setAiErr("");
    const chosen = aiDrafts.filter(q => q._on && q.question_text.trim() && q.model_answer.trim());
    let n = 0, failed = false;
    for (const q of chosen) {
      try {
        await sb.q("questions", { method: "POST", body: { topic_id: tid, question_text: q.question_text.trim(), model_answer: q.model_answer.trim(), marks: q.marks || 1, difficulty: 1, created_by: userId } });
        n++;
      } catch { failed = true; }
    }
    if (n) { setAdded(p => p + n); setAiSaved(n); }
    if (failed) setAiErr("Some couldn't be saved — your plan may not allow custom questions, or you lack permission.");
    if (n) setAiDrafts(null);
    setAiBusy(false);
  };

  // ── Tenant resource links ──
  const loadResources = async (topicId) => {
    if (!topicId) { setResList([]); return; }
    setResList(null); setResErr("");
    try {
      const rs = await sb.q("topic_resources", { params: { retrieval_topic_id: `eq.${topicId}`, select: "id,url,title,kind,school_id,created_by", order: "sort_order.asc" } });
      setResList(Array.isArray(rs) ? rs : []);
    } catch (e) { setResErr(e.message || "Could not load resources"); setResList([]); }
  };
  const addResource = async () => {
    if (!tid || !resUrl.trim() || !resTitle.trim()) return;
    setResBusy(true); setResErr("");
    try {
      await sb.rpc("upsert_topic_resource", { p_topic_id: tid, p_url: resUrl.trim(), p_title: resTitle.trim(), p_kind: resKind });
      setResUrl(""); setResTitle(""); setResKind("tool");
      await loadResources(tid);
    } catch (e) { setResErr(e.message || "Could not add link"); }
    setResBusy(false);
  };
  const removeResource = async (id) => {
    try { await sb.rpc("delete_topic_resource", { p_id: id }); setResList(prev => (prev || []).filter(r => r.id !== id)); }
    catch (e) { setResErr(e.message || "Could not remove"); }
  };

  useEffect(() => { if (mode === "browse" && tid) loadQl(tid); }, [mode, tid]);
  useEffect(() => { if (mode === "resources" && tid) loadResources(tid); if (mode === "ai") { setAiDrafts(null); setAiErr(""); } }, [mode, tid]);

  // ── CSV parsing ──
  const parseCSVLine = (line) => {
    const result = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    result.push(cur.trim()); return result;
  };

  const parseCSV = (text) => {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean);
    if (lines.length < 2) return { err: "CSV needs a header row and at least one data row." };
    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
    const need = ['question', 'answer', 'topic'];
    const missing = need.filter(k => !header.includes(k));
    if (missing.length) return { err: `Missing required columns: ${missing.join(', ')}. Found: ${header.join(', ')}` };
    const idx = { q: header.indexOf('question'), a: header.indexOf('answer'), t: header.indexOf('topic'), st: header.indexOf('subtopic') };
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const q = cols[idx.q] || ""; const a = cols[idx.a] || ""; const t = cols[idx.t] || "";
      const st = idx.st >= 0 ? (cols[idx.st] || "") : "";
      if (!q || !a || !t) continue;
      rows.push({ question: q, answer: a, topic: t, subtopic: st });
    }
    if (!rows.length) return { err: "No valid rows found. Check your data has question, answer, and topic values." };
    return { rows };
  };

  const handleFile = (file) => {
    if (!file || !file.name.endsWith('.csv')) { setCsvErr("Please upload a .csv file."); return; }
    setCsvErr(""); setCsvRows(null);
    const reader = new FileReader();
    reader.onload = (e) => { const { rows, err } = parseCSV(e.target.result); if (err) setCsvErr(err); else setCsvRows(rows); };
    reader.readAsText(file);
  };

  const importCSV = async () => {
    if (!csvRows || !subjectId) return;
    setImp(true); setCsvProgress({ done: 0, total: csvRows.length });
    const tMap = {}; topics.forEach(t => { tMap[t.name.toLowerCase()] = t.id; });
    let done = 0;
    for (const row of csvRows) {
      const tName = (row.subtopic || row.topic).trim();
      const key = tName.toLowerCase();
      let topicId = tMap[key];
      if (!topicId) {
        try {
          const [newT] = await sb.q("topics", { method: "POST", body: { subject_id: subjectId, name: tName, sort_order: Object.keys(tMap).length } });
          topicId = newT.id; tMap[key] = topicId; setTopics(p => [...p, newT]);
        } catch { done++; setCsvProgress({ done, total: csvRows.length }); continue; }
      }
      try {
        await sb.q("questions", { method: "POST", body: { topic_id: topicId, question_text: row.question, model_answer: row.answer, marks: 1, difficulty: 1, created_by: userId } });
        setAdded(p => p + 1);
      } catch {}
      done++; setCsvProgress({ done, total: csvRows.length });
    }
    setImp(false); setCsvRows(null); setCsvProgress(null);
  };

  const csvTopicCount = csvRows ? new Set(csvRows.map(r => (r.subtopic || r.topic).toLowerCase())).size : 0;
  const existingNames = new Set(topics.map(t => t.name.toLowerCase()));
  const newTopics = csvRows ? [...new Set(csvRows.map(r => r.subtopic || r.topic))].filter(n => !existingNames.has(n.toLowerCase())) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.bdr}` }}>
        <div>
          <Kicker>Question bank</Kicker>
          <Headline size={22}>Questions</Headline>
        </div>
        {added > 0 && <Badge color={C.grn}>+{added} added</Badge>}
      </div>

      {/* Topic selector */}
      {mode !== "csv" && <>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Inp placeholder="New topic..." value={nt} onChange={e => setNt(e.target.value)} onKeyDown={e => e.key === "Enter" && addT()} />
          <Btn onClick={addT} style={{ whiteSpace: "nowrap", fontSize: 13 }}>+ Topic</Btn>
        </div>
        <select value={tid} onChange={e => setTid(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 3, color: C.txt, fontSize: 14, marginBottom: 12, outline: "none" }}>
          <option value="">Select topic...</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </>}

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <Pill on={mode === "single"} onClick={() => setMode("single")}>Single</Pill>
        <Pill on={mode === "bulk"} onClick={() => setMode("bulk")}>Bulk</Pill>
        <Pill on={mode === "csv"} onClick={() => { setMode("csv"); setCsvRows(null); setCsvErr(""); }}>CSV import</Pill>
        <Pill on={mode === "browse"} onClick={() => setMode("browse")}>Browse & edit</Pill>
        <Pill on={mode === "ai"} onClick={() => setMode("ai")}>✦ AI generate</Pill>
        <Pill on={mode === "resources"} onClick={() => setMode("resources")}>Resources</Pill>
      </div>

      {mode === "single" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Inp placeholder="Question" value={qt} onChange={e => setQt(e.target.value)} />
          <Inp placeholder="Model answer" value={qa} onChange={e => setQa(e.target.value)} onKeyDown={e => e.key === "Enter" && addQ()} />
          <Inp type="number" min={1} max={6} value={mk} onChange={e => setMk(parseInt(e.target.value) || 1)} style={{ width: 80 }} />
          {/* Optional image */}
          <div style={{ padding: 10, border: `1px dashed ${C.bdr}`, borderRadius: 8, background: C.card2 }}>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 600 }}>Image (optional)</div>
            {qImageUrl ? (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <img src={qImageUrl} alt="question" style={{ maxWidth: 140, maxHeight: 100, borderRadius: 6, border: `1px solid ${C.bdr}`, objectFit: "contain", background: "#fff" }} />
                <Btn v="ghost" onClick={() => setQImageUrl("")} style={{ fontSize: 11, padding: "6px 10px", color: C.red, borderColor: "rgba(239,68,68,.3)" }}>Remove</Btn>
              </div>
            ) : (
              <label style={{ display: "inline-block", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.bdr}`, background: C.card, fontSize: 12, cursor: qImageBusy ? "wait" : "pointer", fontWeight: 500 }}>
                {qImageBusy ? "Uploading…" : "+ Add image"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={qImageBusy} onChange={e => pickImageFor(e.target.files?.[0], setQImageUrl, setQImageBusy, setQImageErr)} style={{ display: "none" }} />
              </label>
            )}
            {qImageErr && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{qImageErr}</div>}
            <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>PNG / JPEG / WebP / GIF · max 5MB. Shown above the question text to students.</div>
          </div>
          <Btn onClick={addQ} disabled={!qt || !qa || !tid}>Add question</Btn>
        </div>
      )}

      {mode === "bulk" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: C.dim }}>Format: <code style={{ background: C.card2, padding: "1px 6px", borderRadius: 4 }}>question | answer</code></div>
          <TA value={bt} onChange={e => setBt(e.target.value)} rows={8} placeholder="What is the powerhouse of the cell? | The mitochondria" style={{ fontSize: 13, fontFamily: "monospace" }} />
          <Btn onClick={bulkAdd} disabled={!bt.trim() || !tid || imp}>{imp ? "Importing..." : "Import all"}</Btn>
        </div>
      )}

      {mode === "browse" && (
        <div>
          {!tid ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>Select a topic above to browse its questions</div>
          ) : qlLoading ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>Loading...</div>
          ) : ql.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>No questions in this topic yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{ql.length} question{ql.length !== 1 ? "s" : ""}</div>
              {ql.map((q, i) => (
                <div key={q.id} style={{ borderRadius: 10, border: `1px solid ${editId === q.id ? C.pri : C.bdr}`, overflow: "hidden" }}>
                  {editId === q.id ? (
                    /* ── Inline editor ── */
                    <div style={{ padding: 12, background: C.card2 }}>
                      <div style={{ fontSize: 11, color: C.pri, fontWeight: 600, marginBottom: 8 }}>Editing question {i + 1}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Question</div>
                          <TA value={editQ} onChange={e => setEditQ(e.target.value)} rows={2} style={{ fontSize: 13 }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Model answer</div>
                          <TA value={editA} onChange={e => setEditA(e.target.value)} rows={2} style={{ fontSize: 13 }} />
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ fontSize: 11, color: C.dim }}>Marks:</div>
                          <Inp type="number" min={1} max={6} value={editMk} onChange={e => setEditMk(parseInt(e.target.value) || 1)} style={{ width: 70, fontSize: 13, padding: "6px 10px" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Image</div>
                          {editImageUrl ? (
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <img src={editImageUrl} alt="question" style={{ maxWidth: 120, maxHeight: 90, borderRadius: 6, border: `1px solid ${C.bdr}`, objectFit: "contain", background: "#fff" }} />
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <label style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.bdr}`, background: C.card, fontSize: 11, cursor: editImageBusy ? "wait" : "pointer", fontWeight: 500, textAlign: "center" }}>
                                  {editImageBusy ? "Uploading…" : "Replace"}
                                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={editImageBusy} onChange={e => pickImageFor(e.target.files?.[0], setEditImageUrl, setEditImageBusy, setEditImageErr)} style={{ display: "none" }} />
                                </label>
                                <Btn v="ghost" onClick={() => setEditImageUrl("")} style={{ fontSize: 11, padding: "6px 10px", color: C.red, borderColor: "rgba(239,68,68,.3)" }}>Remove</Btn>
                              </div>
                            </div>
                          ) : (
                            <label style={{ display: "inline-block", padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.bdr}`, background: C.card, fontSize: 12, cursor: editImageBusy ? "wait" : "pointer", fontWeight: 500 }}>
                              {editImageBusy ? "Uploading…" : "+ Add image"}
                              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={editImageBusy} onChange={e => pickImageFor(e.target.files?.[0], setEditImageUrl, setEditImageBusy, setEditImageErr)} style={{ display: "none" }} />
                            </label>
                          )}
                          {editImageErr && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{editImageErr}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn onClick={() => saveEdit(q.id)} disabled={saving || !editQ.trim() || !editA.trim()} style={{ flex: 1, padding: "10px 16px", fontSize: 13 }}>{saving ? "Saving..." : "Save changes"}</Btn>
                          <Btn v="ghost" onClick={() => setEditId(null)} style={{ fontSize: 13, padding: "10px 14px" }}>Cancel</Btn>
                          {confirmArchive === q.id ? (
                            <Btn v="ghost" onClick={() => archiveQ(q.id)} style={{ fontSize: 12, padding: "10px 12px", color: C.red, borderColor: "rgba(239,68,68,.3)", background: C.redS }}>Confirm archive</Btn>
                          ) : (
                            <Btn v="ghost" onClick={() => setConfirmArchive(q.id)} style={{ fontSize: 12, padding: "10px 12px", color: C.red, borderColor: "rgba(239,68,68,.2)" }}>Archive</Btn>
                          )}
                        </div>
                        {confirmArchive === q.id && <div style={{ fontSize: 11, color: C.red }}>Archiving hides this question from students but keeps all response history.</div>}
                      </div>
                    </div>
                  ) : (
                    /* ── Read view ── */
                    <div style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      {q.image_url && (
                        <img src={q.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", border: `1px solid ${C.bdr}`, flexShrink: 0, background: "#fff" }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.txt, lineHeight: 1.4, marginBottom: 4 }}>{q.question_text}</div>
                        <div style={{ fontSize: 11, color: C.dim }}>{q.model_answer}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                        {q.shared && !canPublishShared && <Badge color={C.grn}>Shared</Badge>}
                        {canPublishShared && (
                          <button onClick={() => setShared(q.id, !q.shared)}
                            title={q.shared ? "In the shared bank — click to make it private" : "Publish to the cross-school shared question bank"}
                            style={{ background: q.shared ? C.grnS : C.card2, border: `1px solid ${q.shared ? "rgba(22,165,88,.4)" : C.bdr}`, borderRadius: 6, color: q.shared ? C.grn : C.mid, fontSize: 11, cursor: "pointer", padding: "4px 9px", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" }}>
                            {q.shared ? "✓ Shared" : "Publish"}
                          </button>
                        )}
                        <span style={{ fontSize: 10, color: C.dim, whiteSpace: "nowrap" }}>{q.marks}mk</span>
                        <button onClick={() => startEdit(q)} style={{ background: C.priSoft, border: "none", borderRadius: 6, color: C.pri, fontSize: 12, cursor: "pointer", padding: "4px 10px", fontFamily: "inherit", fontWeight: 600 }}>Edit</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "csv" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: C.dim, padding: "8px 12px", background: C.card2, borderRadius: 8, lineHeight: 1.7 }}>
            Required columns: <code style={{ color: C.acc }}>question</code>, <code style={{ color: C.acc }}>answer</code>, <code style={{ color: C.acc }}>topic</code> · Optional: <code style={{ color: C.mid }}>subtopic</code><br />
            Topics are matched by name — new ones are created automatically. If subtopic is present, it's used as the topic name.
          </div>
          {!csvRows && !csvProgress && (
            <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? C.pri : C.bdr}`, borderRadius: 10, padding: "32px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? C.priSoft : "transparent", transition: "all .15s" }}>
              <div style={{ marginBottom: 8, opacity: 0.5, display: "flex", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div>
              <div style={{ fontSize: 13, color: C.mid, fontWeight: 600 }}>Drop CSV here or tap to browse</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>question, answer, topic, subtopic</div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>
          )}
          {csvErr && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redS, color: C.red, fontSize: 12, fontFamily: "monospace" }}>{csvErr}</div>}
          {csvRows && !csvProgress && (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ padding: "8px 14px", borderRadius: 8, background: C.grnS, color: C.grn, fontSize: 12, fontWeight: 600 }}>{csvRows.length} questions</div>
                <div style={{ padding: "8px 14px", borderRadius: 8, background: C.priSoft, color: C.pri, fontSize: 12, fontWeight: 600 }}>{csvTopicCount} topics</div>
                {newTopics.length > 0 && <div style={{ padding: "8px 14px", borderRadius: 8, background: C.ambS, color: C.amb, fontSize: 12, fontWeight: 600 }}>{newTopics.length} new topic{newTopics.length !== 1 ? "s" : ""} will be created</div>}
              </div>
              {newTopics.length > 0 && <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: C.card2, fontSize: 11, color: C.dim }}>New: {newTopics.slice(0, 5).join(', ')}{newTopics.length > 5 ? ` +${newTopics.length - 5} more` : ''}</div>}
              <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", background: C.card2, padding: "7px 12px", fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                  <span>Question</span><span>Answer</span><span>Topic</span>
                </div>
                {csvRows.slice(0, 5).map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", padding: "8px 12px", fontSize: 12, borderTop: `1px solid ${C.bdr}`, color: C.mid, gap: 8 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.question}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.answer}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.acc }}>{r.subtopic || r.topic}</span>
                  </div>
                ))}
                {csvRows.length > 5 && <div style={{ padding: "6px 12px", fontSize: 11, color: C.dim, borderTop: `1px solid ${C.bdr}`, textAlign: "center" }}>+{csvRows.length - 5} more rows</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={importCSV} disabled={imp} style={{ flex: 1 }}>Import {csvRows.length} questions →</Btn>
                <Btn v="ghost" onClick={() => { setCsvRows(null); setCsvErr(""); }} style={{ fontSize: 12 }}>Cancel</Btn>
              </div>
            </div>
          )}
          {csvProgress && (
            <div style={{ padding: 16, background: C.card2, borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: C.mid }}>
                <span>Importing...</span>
                <span style={{ fontFamily: "monospace" }}>{csvProgress.done}/{csvProgress.total}</span>
              </div>
              <div style={{ height: 6, background: C.bdr, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", background: C.pri, borderRadius: 99, width: `${(csvProgress.done / csvProgress.total) * 100}%`, transition: "width .2s" }} />
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "ai" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!tid ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>Select a topic above to generate questions for it</div>
          ) : (
            <>
              {!aiDrafts && (
                <div style={{ padding: 12, border: `1px dashed ${C.bdr}`, borderRadius: 10, background: C.card2, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, color: C.txt }}>Generate exam-style questions for <b>{topicName()}</b> with AI, then review and save the ones you want.</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.dim }}>How many:</span>
                    <Inp type="number" min={1} max={10} value={aiCount} onChange={e => setAiCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))} style={{ width: 70 }} />
                    <Btn onClick={generateAI} disabled={aiBusy}>{aiBusy ? "Generating…" : "✦ Generate"}</Btn>
                  </div>
                  <div style={{ fontSize: 10, color: C.dim }}>Drafts are always reviewed before saving. Saved questions are private to you until published to the shared bank.</div>
                </div>
              )}
              {aiErr && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redS, color: C.red, fontSize: 12 }}>{aiErr}</div>}
              {aiSaved > 0 && !aiDrafts && <div style={{ fontSize: 12, color: C.grn, fontWeight: 600 }}>✓ {aiSaved} saved to the bank</div>}
              {aiDrafts && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, color: C.dim }}>{aiDrafts.length} draft{aiDrafts.length !== 1 ? "s" : ""} — edit, untick any you don't want, then save.</div>
                  {aiDrafts.map((q, i) => (
                    <div key={i} style={{ border: `1px solid ${C.bdr}`, borderRadius: 10, padding: 10, background: q._on ? C.card2 : "transparent", opacity: q._on ? 1 : 0.55, display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.mid, cursor: "pointer" }}>
                        <input type="checkbox" checked={q._on} onChange={e => updDraft(i, { _on: e.target.checked })} /> include
                      </label>
                      <TA value={q.question_text} onChange={e => updDraft(i, { question_text: e.target.value })} rows={2} style={{ fontSize: 13 }} />
                      <TA value={q.model_answer} onChange={e => updDraft(i, { model_answer: e.target.value })} rows={2} style={{ fontSize: 13, color: C.mid }} />
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: C.dim }}>Marks:</span>
                        <Inp type="number" min={1} max={6} value={q.marks} onChange={e => updDraft(i, { marks: Math.max(1, Math.min(6, parseInt(e.target.value) || 1)) })} style={{ width: 64, fontSize: 13, padding: "6px 10px" }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn onClick={saveAIDrafts} disabled={aiBusy || !aiDrafts.some(q => q._on)} style={{ flex: 1 }}>{aiBusy ? "Saving…" : `Save ${aiDrafts.filter(q => q._on).length} to bank`}</Btn>
                    <Btn v="ghost" onClick={() => setAiDrafts(null)} style={{ fontSize: 12 }}>Discard</Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {mode === "resources" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!tid ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>Select a topic above to manage its revision resources</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.dim }}>Links shown to pupils on their “revise your weak spots” panel for this topic. Your school’s links sit alongside the built-in ones.</div>
              <div style={{ padding: 12, border: `1px dashed ${C.bdr}`, borderRadius: 10, background: C.card2, display: "flex", flexDirection: "column", gap: 8 }}>
                <Inp placeholder="Title (e.g. Cells — revision booklet)" value={resTitle} onChange={e => setResTitle(e.target.value)} />
                <Inp placeholder="https://…" value={resUrl} onChange={e => setResUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && addResource()} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={resKind} onChange={e => setResKind(e.target.value)} style={{ padding: "8px 10px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.txt, fontSize: 13 }}>
                    <option value="tool">Tool</option><option value="widget">Widget</option><option value="booklet">Booklet</option><option value="pdf">PDF</option>
                  </select>
                  <Btn onClick={addResource} disabled={resBusy || !resUrl.trim() || !resTitle.trim()}>{resBusy ? "Adding…" : "+ Add link"}</Btn>
                </div>
              </div>
              {resErr && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redS, color: C.red, fontSize: 12 }}>{resErr}</div>}
              {resList === null ? (
                <div style={{ padding: "16px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>Loading…</div>
              ) : resList.length === 0 ? (
                <div style={{ padding: "16px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>No resources for this topic yet.</div>
              ) : (
                resList.map(r => (
                  <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.pri, fontWeight: 600, textDecoration: "none" }}>{r.title}</a>
                      <div style={{ fontSize: 10, color: C.dim, textTransform: "capitalize" }}>{r.kind} · {r.school_id ? "your school" : "built-in"}</div>
                    </div>
                    {r.school_id && r.created_by === userId
                      ? <button onClick={() => removeResource(r.id)} style={{ background: "none", border: "1px solid rgba(239,68,68,.3)", borderRadius: 6, color: C.red, fontSize: 11, cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}>Remove</button>
                      : <Badge color={C.acc}>{r.school_id ? "school" : "built-in"}</Badge>}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── APP ─── */
