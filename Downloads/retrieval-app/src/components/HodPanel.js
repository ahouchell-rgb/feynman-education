"use client";
import { useState, useEffect } from "react";
import { detectFakeAnswer } from "../lib/marking";
import { sb } from "../lib/supabase";
import { C } from "../lib/theme";
import { Card, Dateline, Deck, Headline, Kicker, Pill } from "./ui";

export function HodPanel({ user }) {
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classMembers, setClassMembers] = useState([]);
  const [responses, setResponses] = useState([]);
  const [topics, setTopics] = useState({}); // id -> name
  const [view, setView] = useState("overview"); // overview | teachers | topics | atrisk
  const [error, setError] = useState("");

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true); setError("");
    try {
      const deptTeachers = await sb.q("profiles", { params: { hod_id: `eq.${user.id}`, select: "id,display_name,email,role", order: "display_name.asc" } });
      setTeachers(deptTeachers);
      if (deptTeachers.length === 0) { setClasses([]); setClassMembers([]); setResponses([]); setLoading(false); return; }
      const teacherIds = deptTeachers.map(t => t.id);
      const cls = await sb.q("classes", { params: { teacher_id: `in.(${teacherIds.join(",")})`, select: "id,name,teacher_id,subject_id" } });
      setClasses(cls);
      if (cls.length === 0) { setClassMembers([]); setResponses([]); setLoading(false); return; }
      const classIds = cls.map(c => c.id);
      const [mems, resps, tps] = await Promise.all([
        sb.q("class_members", { params: { class_id: `in.(${classIds.join(",")})`, select: "class_id,student_id,profiles(display_name,email)" } }),
        sb.q("responses", { params: { class_id: `in.(${classIds.join(",")})`, select: "question_id,student_id,class_id,is_correct,answered_at,student_answer,questions(topic_id,topics(name))", order: "answered_at.desc", limit: "5000" } }),
        sb.q("topics", { params: { select: "id,name" } }),
      ]);
      setClassMembers(mems);
      setResponses(resps);
      const topicMap = {}; tps.forEach(t => { topicMap[t.id] = t.name; });
      setTopics(topicMap);
    } catch (e) { console.error(e); setError(e.message); }
    setLoading(false);
  };

  // Analysis
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7*86400000);
  const validResps = responses.filter(r => !detectFakeAnswer(r.student_answer));
  const weekResps = validResps.filter(r => new Date(r.answered_at) >= weekAgo);

  const perTeacher = teachers.map(t => {
    const tClasses = classes.filter(c => c.teacher_id === t.id);
    const tClassIds = new Set(tClasses.map(c => c.id));
    const tMems = classMembers.filter(m => tClassIds.has(m.class_id));
    const studentSet = new Set(tMems.map(m => m.student_id));
    const tResps = validResps.filter(r => tClassIds.has(r.class_id));
    const tWeekResps = weekResps.filter(r => tClassIds.has(r.class_id));
    const activeThisWeek = new Set(tWeekResps.map(r => r.student_id)).size;
    const correct = tResps.filter(r => r.is_correct).length;
    const acc = tResps.length > 0 ? Math.round((correct / tResps.length) * 100) : 0;
    return { teacher: t, classes: tClasses, studentCount: studentSet.size, activeThisWeek, totalAnswered: tResps.length, weekAnswered: tWeekResps.length, acc };
  }).sort((a, b) => b.weekAnswered - a.weekAnswered);

  // Department-wide weak topics
  const topicAgg = {};
  validResps.forEach(r => {
    const tid = r.questions?.topic_id;
    const tname = r.questions?.topics?.name;
    if (!tid) return;
    if (!topicAgg[tid]) topicAgg[tid] = { name: tname || "Unknown", t: 0, c: 0 };
    topicAgg[tid].t++;
    if (r.is_correct) topicAgg[tid].c++;
  });
  const weakTopics = Object.values(topicAgg).filter(t => t.t >= 5).map(t => ({ ...t, pct: Math.round((t.c/t.t)*100) })).sort((a, b) => a.pct - b.pct).slice(0, 8);

  // Two at-risk lists, tracked separately:
  //   lowAccuracyStudents — have 10+ answers and <50% accuracy
  //   inactiveStudents    — have 5+ answers and haven't practised in 7+ days
  const studentAgg = {};
  classMembers.forEach(m => {
    if (!studentAgg[m.student_id]) {
      const cls_ = classes.find(c => c.id === m.class_id);
      studentAgg[m.student_id] = {
        id: m.student_id,
        name: m.profiles?.display_name || "?",
        email: m.profiles?.email || "",
        className: cls_?.name || "",
        teacherId: cls_?.teacher_id,
        t: 0, c: 0, weekT: 0, lastAnswered: null,
      };
    }
  });
  validResps.forEach(r => {
    const s = studentAgg[r.student_id];
    if (!s) return;
    s.t++;
    if (r.is_correct) s.c++;
    const d = new Date(r.answered_at);
    if (!s.lastAnswered || d > s.lastAnswered) s.lastAnswered = d;
    if (d >= weekAgo) s.weekT++;
  });
  const enrich = s => ({
    ...s,
    acc: s.t > 0 ? Math.round((s.c / s.t) * 100) : 0,
    daysSince: s.lastAnswered ? Math.floor((now - s.lastAnswered) / 86400000) : null,
    teacherName: teachers.find(t => t.id === s.teacherId)?.display_name || "—",
  });
  const lowAccuracyStudents = Object.values(studentAgg)
    .filter(s => s.t >= 10 && (s.c / s.t) * 100 < 50)
    .map(enrich)
    .sort((a, b) => a.acc - b.acc);
  const inactiveStudents = Object.values(studentAgg)
    .filter(s => {
      const daysSince = s.lastAnswered ? Math.floor((now - s.lastAnswered) / 86400000) : 999;
      return s.t >= 5 && daysSince >= 7;
    })
    .map(enrich)
    .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999));

  // Topic × teacher heatmap (top 8 most-answered topics × teachers)
  const topicTotals = {};
  validResps.forEach(r => { const tid = r.questions?.topic_id; if (tid) topicTotals[tid] = (topicTotals[tid] || 0) + 1; });
  const topTopicIds = Object.entries(topicTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  const heatmap = topTopicIds.map(tid => {
    const row = { tid, name: topics[tid] || "Unknown", cells: [] };
    teachers.forEach(t => {
      const tClassIds = new Set(classes.filter(c => c.teacher_id === t.id).map(c => c.id));
      const cellResps = validResps.filter(r => r.questions?.topic_id === tid && tClassIds.has(r.class_id));
      const c = cellResps.filter(r => r.is_correct).length;
      const total = cellResps.length;
      row.cells.push({ teacherId: t.id, total, correct: c, pct: total > 0 ? Math.round((c/total)*100) : null });
    });
    return row;
  });

  const totalStudents = Object.keys(studentAgg).length;
  const totalActiveThisWeek = new Set(weekResps.map(r => r.student_id)).size;
  const deptAccuracy = validResps.length > 0 ? Math.round((validResps.filter(r => r.is_correct).length / validResps.length) * 100) : 0;

  if (loading) return <div style={{ maxWidth: 700, margin: "0 auto", padding: 40, textAlign: "center", color: C.mid }}>Loading department data…</div>;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px" }}>
      {/* Dateline + editorial standfirst */}
      <Dateline left="Department Report" right={new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} style={{ marginBottom: 16 }} />

      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.bdr}` }}>
        <Kicker>Head of Department</Kicker>
        <Headline size={22} style={{ marginBottom: 6 }}>Department overview</Headline>
        <Deck>Oversight of your department — {teachers.length} teacher{teachers.length === 1 ? "" : "s"}, {totalStudents} student{totalStudents === 1 ? "" : "s"}.</Deck>
      </div>

      {error && <div style={{ padding: "8px 12px", borderRadius: 3, background: C.redS, color: C.red, fontSize: 12, marginBottom: 12 }}>Error: {error}</div>}

      {teachers.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.txt, marginBottom: 6 }}>No teachers in your department yet</div>
          <div style={{ fontSize: 13, color: C.mid }}>Ask your admin to add teachers to your department.</div>
        </Card>
      ) : (
        <>
          {/* ACTION HERO — the single most urgent action leads the view (v4 hierarchy) */}
          {(() => {
            const inact = inactiveStudents.length, low = lowAccuracyStudents.length;
            const Triangle = (col) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" /></svg>;
            const inkBtn = (label, onClick) => <button onClick={onClick} style={{ width: "100%", marginTop: 14, padding: "13px", background: C.txt, color: C.bg, border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: ".02em" }}>{label}</button>;
            if (inact > 0) return (
              <div style={{ background: C.redS, border: `1px solid ${C.red}33`, borderLeft: `4px solid ${C.red}`, borderRadius: "0 6px 6px 0", padding: "16px 18px", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{Triangle(C.red)}<span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: C.red }}>Needs your attention</span></div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 10 }}>
                  <span style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 600, lineHeight: .9, color: C.red, fontVariantNumeric: "tabular-nums" }}>{inact}</span>
                  <span style={{ fontFamily: C.serif, fontSize: 16, lineHeight: 1.25, color: C.txt }}>{inact === 1 ? "student hasn't" : "students haven't"} practised in 7+ days</span>
                </div>
                {inkBtn(`Review ${inact === 1 ? "student" : "students"} →`, () => setView("inactive"))}
              </div>
            );
            if (low > 0) return (
              <div style={{ background: C.ambS, border: `1px solid ${C.amb}33`, borderLeft: `4px solid ${C.amb}`, borderRadius: "0 6px 6px 0", padding: "16px 18px", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{Triangle(C.amb)}<span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: C.amb }}>Needs your attention</span></div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 10 }}>
                  <span style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 600, lineHeight: .9, color: C.amb, fontVariantNumeric: "tabular-nums" }}>{low}</span>
                  <span style={{ fontFamily: C.serif, fontSize: 16, lineHeight: 1.25, color: C.txt }}>{low === 1 ? "student is" : "students are"} below 50% accuracy</span>
                </div>
                {inkBtn(`Review ${low === 1 ? "student" : "students"} →`, () => setView("lowacc"))}
              </div>
            );
            return (
              <div style={{ background: C.grnS, border: `1px solid ${C.grn}33`, borderLeft: `4px solid ${C.grn}`, borderRadius: "0 6px 6px 0", padding: "16px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.grn} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                <div><div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: C.grn }}>All clear</div><div style={{ fontFamily: C.serif, fontSize: 16, color: C.txt, marginTop: 4 }}>No students need chasing this week</div></div>
              </div>
            );
          })()}
          {/* Metric tiles — FT-style serif numbers, status colour only on numbers that have status */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", marginBottom: 20, borderTop: `1px solid ${C.bdr}` }}>
            <div style={{ padding: "14px 14px 14px 0", borderBottom: `1px solid ${C.bdr}`, borderRight: `1px solid ${C.bdr}`, paddingRight: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: C.mid, marginBottom: 8 }}>Teachers</div>
              <div style={{ fontFamily: C.serif, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: C.txt }}>{teachers.length}</div>
            </div>
            <div style={{ padding: "14px 0 14px 16px", borderBottom: `1px solid ${C.bdr}` }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: C.mid, marginBottom: 8 }}>Students</div>
              <div style={{ fontFamily: C.serif, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: C.txt }}>{totalStudents}</div>
            </div>
            <div style={{ padding: "14px 14px 14px 0", borderBottom: `1px solid ${C.bdr}`, borderRight: `1px solid ${C.bdr}`, paddingRight: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: C.mid, marginBottom: 8 }}>Active · 7 days</div>
              <div style={{ fontFamily: C.serif, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: totalActiveThisWeek === 0 ? C.red : totalActiveThisWeek < totalStudents * 0.4 ? C.amb : C.grn }}>{totalActiveThisWeek}<span style={{ fontSize: 16, color: C.dim }}>/{totalStudents}</span></div>
            </div>
            <div style={{ padding: "14px 0 14px 16px", borderBottom: `1px solid ${C.bdr}` }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: C.mid, marginBottom: 8 }}>Accuracy</div>
              <div style={{ fontFamily: C.serif, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1, color: deptAccuracy >= 70 ? C.grn : deptAccuracy >= 50 ? C.amb : C.red }}>{deptAccuracy}<span style={{ fontSize: 16, color: C.dim }}>%</span></div>
            </div>
          </div>

          {/* View tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
            {[{ k: "overview", l: "Overview" }, { k: "teachers", l: "Teachers" }, { k: "topics", l: "Weak topics" }, { k: "lowacc", l: `Low accuracy${lowAccuracyStudents.length > 0 ? ` (${lowAccuracyStudents.length})` : ""}` }, { k: "inactive", l: `Inactive${inactiveStudents.length > 0 ? ` (${inactiveStudents.length})` : ""}` }].map(t => (
              <Pill key={t.k} on={view === t.k} onClick={() => setView(t.k)} style={{ fontSize: 12, padding: "6px 12px" }}>{t.l}</Pill>
            ))}
          </div>

          {/* OVERVIEW: teacher summary + weak topics snapshot */}
          {view === "overview" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Teachers this week</div>
              {perTeacher.map(pt => (
                <div key={pt.teacher.id} style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{pt.teacher.display_name || "—"}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>{pt.classes.length} class{pt.classes.length === 1 ? "" : "es"} · {pt.studentCount} student{pt.studentCount === 1 ? "" : "s"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: pt.activeThisWeek > 0 ? C.grn : C.dim }}>{pt.activeThisWeek}/{pt.studentCount}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>active 7d</div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 48 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: pt.acc >= 70 ? C.grn : pt.acc >= 50 ? C.amb : pt.totalAnswered > 0 ? C.red : C.dim }}>{pt.totalAnswered > 0 ? pt.acc + "%" : "—"}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>accuracy</div>
                  </div>
                </div>
              ))}

              {weakTopics.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Weakest topics across department</div>
                  {weakTopics.slice(0, 5).map(t => (
                    <div key={t.name} style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, fontSize: 12, color: C.txt }}>{t.name}</div>
                      <div style={{ width: 80, height: 4, background: C.bdr, borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ width: `${t.pct}%`, height: "100%", background: t.pct < 50 ? C.red : t.pct < 70 ? C.amb : C.grn }} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.pct < 50 ? C.red : t.pct < 70 ? C.amb : C.grn, minWidth: 40, textAlign: "right" }}>{t.pct}%</div>
                      <div style={{ fontSize: 10, color: C.dim, minWidth: 40, textAlign: "right" }}>{t.t} ans</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TEACHERS: full table + topic x teacher heatmap */}
          {view === "teachers" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Full breakdown</div>
              {perTeacher.map(pt => (
                <div key={pt.teacher.id} style={{ padding: "14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{pt.teacher.display_name || "—"}</div>
                      <div style={{ fontSize: 11, color: C.dim, fontFamily: "monospace" }}>{pt.teacher.email}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 8 }}>
                    <div style={{ padding: "8px", background: C.bg, borderRadius: 6, textAlign: "center" }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{pt.classes.length}</div>
                      <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3 }}>Classes</div>
                    </div>
                    <div style={{ padding: "8px", background: C.bg, borderRadius: 6, textAlign: "center" }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{pt.studentCount}</div>
                      <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3 }}>Students</div>
                    </div>
                    <div style={{ padding: "8px", background: C.bg, borderRadius: 6, textAlign: "center" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: pt.weekAnswered > 0 ? C.grn : C.dim }}>{pt.weekAnswered}</div>
                      <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3 }}>Answers 7d</div>
                    </div>
                    <div style={{ padding: "8px", background: C.bg, borderRadius: 6, textAlign: "center" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: pt.acc >= 70 ? C.grn : pt.acc >= 50 ? C.amb : pt.totalAnswered > 0 ? C.red : C.dim }}>{pt.totalAnswered > 0 ? pt.acc + "%" : "—"}</div>
                      <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3 }}>Accuracy</div>
                    </div>
                  </div>
                  {pt.classes.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {pt.classes.map(c => <span key={c.id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: C.priSoft, color: C.pri, fontFamily: "monospace" }}>{c.name}</span>)}
                    </div>
                  )}
                </div>
              ))}

              {heatmap.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Topic strength by teacher</div>
                  <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: 10 }}>
                    <table style={{ fontSize: 11, borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr><th style={{ textAlign: "left", padding: "6px 8px", color: C.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, fontSize: 10 }}>Topic</th>
                          {teachers.map(t => <th key={t.id} style={{ padding: "6px 4px", color: C.dim, fontWeight: 600, fontSize: 10, minWidth: 50, textAlign: "center" }}>{(t.display_name || "?").split(" ")[0].slice(0, 8)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmap.map(row => (
                          <tr key={row.tid}>
                            <td style={{ padding: "5px 8px", color: C.txt, fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</td>
                            {row.cells.map((cell, i) => {
                              const bg = cell.pct === null ? C.bdr : cell.pct >= 70 ? C.grn : cell.pct >= 50 ? C.amb : C.red;
                              const fg = cell.pct === null ? C.dim : "#fff";
                              return (
                                <td key={i} style={{ padding: 2 }}>
                                  <div title={cell.total > 0 ? `${cell.correct}/${cell.total} correct` : "No data"} style={{ background: bg, color: fg, padding: "4px 6px", borderRadius: 4, textAlign: "center", fontSize: 10, fontWeight: 600, opacity: cell.pct === null ? 0.3 : 1 }}>
                                    {cell.pct === null ? "—" : `${cell.pct}%`}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* WEAK TOPICS */}
          {view === "topics" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Department-wide (topics with 5+ answers)</div>
              {weakTopics.length === 0 ? (
                <Card style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="13" y="7" width="3" height="10" /></svg></div>
                  <div style={{ fontSize: 13, color: C.mid }}>Not enough data yet. Topics appear here once they have 5+ answers.</div>
                </Card>
              ) : weakTopics.map(t => (
                <div key={t.name} style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.pct < 50 ? C.red : t.pct < 70 ? C.amb : C.grn }}>{t.pct}%</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: C.bdr, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${t.pct}%`, height: "100%", background: t.pct < 50 ? C.red : t.pct < 70 ? C.amb : C.grn, borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.dim, minWidth: 80, textAlign: "right" }}>{t.c}/{t.t} correct</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* LOW ACCURACY */}
          {view === "lowacc" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Students with 10+ answers and {"<"}50% accuracy
              </div>
              {lowAccuracyStudents.length === 0 ? (
                <Card style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.grn} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg></div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.txt, marginBottom: 4 }}>No students flagged for accuracy</div>
                  <div style={{ fontSize: 12, color: C.mid }}>Everyone with enough answers is above 50%.</div>
                </Card>
              ) : lowAccuracyStudents.map(s => (
                <div key={s.id} style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.red}44`, borderRadius: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{s.teacherName} · {s.className}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.red }}>{s.acc}%</div>
                      <div style={{ fontSize: 10, color: C.dim }}>{s.t} answers</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* INACTIVE */}
          {view === "inactive" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Students with 5+ answers who haven't practised in 7+ days
              </div>
              {inactiveStudents.length === 0 ? (
                <Card style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.grn} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg></div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.txt, marginBottom: 4 }}>Everyone's been active</div>
                  <div style={{ fontSize: 12, color: C.mid }}>No students with a 7+ day gap in activity.</div>
                </Card>
              ) : inactiveStudents.map(s => (
                <div key={s.id} style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.amb}55`, borderRadius: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{s.teacherName} · {s.className}</div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 70 }}>
                      {s.daysSince !== null ? (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 700, color: s.daysSince >= 14 ? C.red : C.amb }}>{s.daysSince}d</div>
                          <div style={{ fontSize: 10, color: C.dim }}>last seen</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic" }}>never</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", minWidth: 50 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.dim }}>{s.t}</div>
                      <div style={{ fontSize: 10, color: C.dim }}>total</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ─── TEACHER ─── */
