"use client";
import { useState, useEffect, useRef } from "react";

const SUPA_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";

/* ─── Supabase client ─── */
const sb = (() => {
  let token = null, user = null;
  const h = (x = {}) => ({ "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${token || SUPA_KEY}`, ...x });

  const q = async (tbl, { method = "GET", body, params = {}, single } = {}) => {
    const u = new URL(`${SUPA_URL}/rest/v1/${tbl}`);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const hd = h();
    if (single) hd["Accept"] = "application/vnd.pgrst.object+json";
    if (method === "POST" || method === "PATCH") hd["Prefer"] = "return=representation";
    const r = await fetch(u, { method, headers: hd, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `${method} ${tbl} failed`); }
    if (method === "DELETE") return null;
    return r.json();
  };

  const del = async (tbl, p = {}) => {
    const u = new URL(`${SUPA_URL}/rest/v1/${tbl}`);
    Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, v));
    await fetch(u, { method: "DELETE", headers: h() });
  };

  const auth = {
    signUp: async (email, pw, meta = {}) => {
      const r = await fetch(`${SUPA_URL}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPA_KEY }, body: JSON.stringify({ email, password: pw, data: meta }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error?.message || d.msg || "Signup failed");
      if (d.access_token) { token = d.access_token; user = d.user; } else if (d.id) return { needsConfirm: true };
      return d;
    },
    signIn: async (email, pw) => {
      const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPA_KEY }, body: JSON.stringify({ email, password: pw }) });
      const d = await r.json();
      if (!r.ok || !d.access_token) throw new Error(d.error_description || d.error?.message || "Login failed");
      token = d.access_token; user = d.user; return d;
    },
    out: () => { token = null; user = null; },
    user: () => user,
    getToken: () => token,
  };
  return { q, del, auth };
})();

/* ─── Spaced Repetition (SM-2) ─── */
function nextSR(correct, prev = {}) {
  let { ef = 2.5, iv = 0, reps = 0 } = prev;
  if (correct) { reps++; iv = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(iv * ef); ef = Math.max(1.3, ef + 0.1); }
  else { reps = 0; iv = 0; ef = Math.max(1.3, ef - 0.2); }
  const d = new Date(); d.setDate(d.getDate() + iv);
  return { ef, iv, reps, due: d.toISOString() };
}

/* ─── Smart Local Marking ─── */
function localMark(qText, modelAnswer, studentAnswer, marks) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const student = norm(studentAnswer);
  const model = norm(modelAnswer);

  if (!student) return { correct: false, marks_awarded: 0, feedback: "No answer given." };

  // Exact or near-exact match
  if (student === model) return { correct: true, marks_awarded: marks, feedback: "Correct!" };

  // Extract key terms from model answer (words 3+ chars, not common words)
  const stopWords = new Set(['the','and','are','was','were','been','being','have','has','had','that','this','with','from','for','not','but','what','all','can','her','one','our','out','you','its','also','into','than','then','them','these','some','will','would','there','their','which','about','each','make','like','just','over','such','take','other','could','after','made','many','before','more','most','only','very','when','come','how','does','two']);
  const getKeyTerms = (s) => s.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));

  const modelTerms = getKeyTerms(model);
  const studentTerms = getKeyTerms(student);

  if (modelTerms.length === 0) {
    // Short model answer — check if student contains it or vice versa
    if (student.includes(model) || model.includes(student)) {
      return { correct: true, marks_awarded: marks, feedback: "Correct!" };
    }
  }

  // Fuzzy match: check how many model key terms appear in student answer
  // Allow for minor typos using a simple distance check
  const fuzzyMatch = (a, b) => {
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    if (a.length < 3 || b.length < 3) return a === b;
    // Allow 1-2 char difference for typos
    if (Math.abs(a.length - b.length) > 2) return false;
    let diffs = 0;
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length < b.length ? a : b;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i]) diffs++;
      if (diffs > 2) return false;
    }
    return diffs <= 2;
  };

  let matched = 0;
  for (const mt of modelTerms) {
    for (const st of studentTerms) {
      if (fuzzyMatch(mt, st)) { matched++; break; }
    }
  }

  const ratio = modelTerms.length > 0 ? matched / modelTerms.length : 0;

  // Also check if student answer contains model answer as substring (different word order)
  const modelWords = model.split(' ');
  const studentContainsCore = modelWords.filter(w => w.length >= 3 && !stopWords.has(w)).every(w =>
    studentTerms.some(st => fuzzyMatch(w, st))
  );

  // Lenient threshold: 60% of key terms matched = correct for retrieval practice
  if (ratio >= 0.6 || studentContainsCore) {
    const awarded = ratio >= 0.85 ? marks : Math.max(1, Math.ceil(marks * ratio));
    return { correct: true, marks_awarded: awarded, feedback: ratio >= 0.85 ? "Correct!" : "Good — most key points covered." };
  }

  // Check for containment — student answer might be worded very differently but contain the right idea
  // Split model into phrases and see if student captures the essence
  if (student.length > 5 && model.length > 5) {
    // Bigram overlap check
    const bigrams = (s) => { const b = []; for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2)); return b; };
    const mBigrams = bigrams(model);
    const sBigrams = new Set(bigrams(student));
    const bigramMatch = mBigrams.filter(b => sBigrams.has(b)).length / mBigrams.length;
    if (bigramMatch >= 0.5) {
      return { correct: true, marks_awarded: marks, feedback: "Correct!" };
    }
  }

  return { correct: false, marks_awarded: 0, feedback: `The answer needed: ${modelAnswer}` };
}

async function aiMark(qText, model, student, marks) {
  // Check for fake/spam answers first
  const fake = detectFakeAnswer(student);
  if (fake) return { correct: false, marks_awarded: 0, feedback: fake, flagged: true };

  // Try AI marking via Supabase Edge Function (proxies to Claude API)
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/mark-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPA_KEY },
      body: JSON.stringify({ question: qText, model_answer: model, student_answer: student, marks }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.source === "ai" || d.source === "fallback") return d;
    }
  } catch (e) {
    console.log("Edge function unavailable, using local marking:", e);
  }
  // Fallback to local fuzzy matching
  return localMark(qText, model, student, marks);
}

/* ─── Fake Answer Detection ─── */
function detectFakeAnswer(answer) {
  const trimmed = answer.trim();
  // Single character or very short nonsense
  if (trimmed.length <= 2) return "Answer too short — doesn't count towards target.";
  // All same character repeated
  if (/^(.)\1+$/.test(trimmed.replace(/\s/g, ''))) return "Repeated characters detected — doesn't count.";
  // All same word repeated
  const words = trimmed.toLowerCase().split(/\s+/);
  if (words.length >= 3 && new Set(words).size === 1) return "Same word repeated — doesn't count.";
  // Random keyboard mashing (all consonants, no vowels in 5+ chars)
  if (trimmed.length >= 5 && !/[aeiouAEIOU]/.test(trimmed)) return "This doesn't look like a real answer — doesn't count.";
  // Just numbers
  if (/^\d+$/.test(trimmed) && trimmed.length < 4) return "Just a number — doesn't count.";
  return null; // not fake
}

/* ─── Weekly Boundaries (Mon-Sun) ─── */
function getWeekBounds(weeksAgo = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(now); thisMonday.setHours(0,0,0,0); thisMonday.setDate(now.getDate() + mondayOffset);
  const targetMonday = new Date(thisMonday); targetMonday.setDate(thisMonday.getDate() - (weeksAgo * 7));
  const targetSunday = new Date(targetMonday); targetSunday.setDate(targetMonday.getDate() + 7); targetSunday.setMilliseconds(-1);
  return { start: targetMonday, end: targetSunday };
}

const WEEKLY_TARGET = 50;
const STAR_INTERVAL = 25; // bonus star every 25 over target

/* ─── Theme ─── */
const C = {
  bg: "#07090e", card: "#0d1117", card2: "#131a25", bdr: "#1b2436",
  pri: "#6366f1", priSoft: "rgba(99,102,241,0.12)", priGlow: "rgba(99,102,241,0.25)",
  grn: "#22c55e", grnS: "rgba(34,197,94,0.12)",
  red: "#ef4444", redS: "rgba(239,68,68,0.12)",
  amb: "#f59e0b", ambS: "rgba(245,158,11,0.12)",
  txt: "#e8ecf4", mid: "#8b95a8", dim: "#505b6e", acc: "#a78bfa",
};

/* ─── UI primitives ─── */
const Inp = ({ style, ...p }) => <input {...p} style={{ width: "100%", padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.txt, fontSize: 15, outline: "none", boxSizing: "border-box", WebkitAppearance: "none", ...style }} />;
const TA = ({ style, ...p }) => <textarea {...p} style={{ width: "100%", padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.txt, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", ...style }} />;
const Btn = ({ v = "pri", style, children, ...p }) => {
  const s = { pri: { background: C.pri, color: "#fff" }, ghost: { background: "transparent", color: C.mid, border: `1px solid ${C.bdr}` } };
  return <button {...p} style={{ padding: "12px 20px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", ...s[v], ...style, ...(p.disabled ? { opacity: .4, cursor: "default" } : {}) }}>{children}</button>;
};
const Card = ({ children, style, ...p }) => <div {...p} style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.bdr}`, ...style }}>{children}</div>;
const Badge = ({ children, color = C.pri, style }) => <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: `${color}18`, color, textTransform: "uppercase", letterSpacing: .6, ...style }}>{children}</span>;
const Pill = ({ on, children, onClick, style }) => <button onClick={onClick} style={{ padding: "8px 16px", borderRadius: 99, border: `1px solid ${on ? C.pri : C.bdr}`, background: on ? C.priSoft : "transparent", color: on ? C.pri : C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", ...style }}>{children}</button>;
const Stat = ({ label, value, color = C.pri }) => <Card style={{ padding: "14px 10px", textAlign: "center", flex: "1 1 0", minWidth: 0 }}><div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: -.5 }}>{value}</div><div style={{ fontSize: 10, color: C.dim, marginTop: 2, textTransform: "uppercase", letterSpacing: .3 }}>{label}</div></Card>;
const Bar = ({ pct }) => <div style={{ width: "100%", height: 5, background: C.bdr, borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red, borderRadius: 99, transition: "width .4s" }} /></div>;

/* ─── AUTH ─── */
function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [name, setName] = useState(""); const [role, setRole] = useState("student");
  const [err, setErr] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);

  const go = async () => {
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "signup") {
        const res = await sb.auth.signUp(email, pw, { display_name: name, role });
        if (res?.needsConfirm) { setInfo("Check email to confirm, then log in. (Or disable email confirmation in Supabase → Auth → Settings)"); setMode("login"); setBusy(false); return; }
      } else { await sb.auth.signIn(email, pw); }
      const u = sb.auth.user();
      let prof;
      try { prof = await sb.q("profiles", { params: { id: `eq.${u.id}` }, single: true }); } catch { prof = { role: u.user_metadata?.role || "student", display_name: u.user_metadata?.display_name || u.email }; }
      onAuth({ ...u, profile: prof });
    } catch (e) {
      const m = e.message || "";
      setErr(m.toLowerCase().includes("fetch") || m.toLowerCase().includes("load") ? "Network error — try opening this in a new tab (expand icon top-right), or check that Supabase email confirmation is disabled." : m);
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans',-apple-system,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.txt, letterSpacing: -1 }}>retrieval<span style={{ color: C.pri }}>.</span></div>
          <div style={{ fontSize: 13, color: C.dim, marginTop: 6 }}>Science practice that sticks</div>
        </div>
        <Card style={{ padding: "28px 24px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
            {["login", "signup"].map(m => <Pill key={m} on={mode === m} onClick={() => { setMode(m); setErr(""); setInfo(""); }} style={{ flex: 1, textAlign: "center" }}>{m === "login" ? "Log in" : "Sign up"}</Pill>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "signup" && <>
              <Inp placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              <div style={{ display: "flex", gap: 6 }}>{["student", "teacher"].map(r => <Pill key={r} on={role === r} onClick={() => setRole(r)} style={{ flex: 1, textAlign: "center" }}>{r.charAt(0).toUpperCase() + r.slice(1)}</Pill>)}</div>
            </>}
            <Inp placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <Inp placeholder="Password (min 6)" type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
            {err && <div style={{ color: C.red, fontSize: 13, padding: "10px 12px", background: C.redS, borderRadius: 8, lineHeight: 1.5 }}>{err}</div>}
            {info && <div style={{ color: C.amb, fontSize: 13, padding: "10px 12px", background: C.ambS, borderRadius: 8, lineHeight: 1.5 }}>{info}</div>}
            <Btn onClick={go} disabled={busy || !email || !pw} style={{ marginTop: 6, width: "100%" }}>{busy ? "Working..." : mode === "login" ? "Log in" : "Create account"}</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─── STUDENT ─── */
/* ─── Question sort: SM-2 due date + teacher recency boost ─── */
// Recency boost pulls recently-taught topic questions forward in the queue.
// Rank 1 = most recently taught → 14-day boost (questions appear as if they were 14 days more overdue)
// Rank 2 → 7-day boost, Rank 3 → 3-day boost
// Never-seen questions are treated as due NOW (not always-first), so past-due wrong answers compete fairly.
function sortQuestions(questions, srMap, recencyBoost) {
  const boostMs = { 1: 14 * 86400000, 2: 7 * 86400000, 3: 3 * 86400000 };
  const now = Date.now();
  // Pre-compute score for each question to avoid Math.random() inside comparator
  const scores = new Map(questions.map(q => {
    const sr = srMap[q.id];
    const dueMs = sr ? new Date(sr.due || 0).getTime() : now; // never-seen = due now
    const boost = boostMs[recencyBoost[q.topic_id]] || 0;
    const jitter = (Math.random() - 0.5) * 3600000; // ±30min to shuffle ties
    return [q.id, dueMs - boost + jitter];
  }));
  return [...questions].sort((a, b) => scores.get(a.id) - scores.get(b.id));
}

function Student({ user }) {
  const [classes, setClasses] = useState([]);
  const [cls, setCls] = useState(null);
  const [qs, setQs] = useState([]);
  const [qi, setQi] = useState(0);
  const [ans, setAns] = useState("");
  const [res, setRes] = useState(null);
  const [marking, setMarking] = useState(false);
  const [stats, setStats] = useState({ t: 0, c: 0 });
  const [sr, setSr] = useState({});
  const [recency, setRecency] = useState({}); // topicId → rank (1/2/3)
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [joining, setJoining] = useState(false);
  const [weeklyValid, setWeeklyValid] = useState(0);
  const [weeklyData, setWeeklyData] = useState([]);
  const [showWeeks, setShowWeeks] = useState(false);
  const [starPop, setStarPop] = useState(false);
  const [topicStats, setTopicStats] = useState([]); // [{name, t, c, notStarted}]
  const [showTopics, setShowTopics] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const mems = await sb.q("class_members", { params: { student_id: `eq.${user.id}`, select: "class_id" } });
      if (mems.length) {
        const ids = mems.map(m => m.class_id);
        const c = await sb.q("classes", { params: { id: `in.(${ids.join(",")})`, select: "*,subjects(name)" } });
        setClasses(c);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const joinClass = async () => {
    if (!joinCode.trim()) return;
    setJoinErr(""); setJoining(true);
    try {
      const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const matches = await sb.q("classes", { params: { join_code: `eq.${code}`, select: "*,subjects(name)" } });
      if (!matches.length) { setJoinErr("No class found with that code. Check with your teacher."); setJoining(false); return; }
      const c = matches[0];
      // Check not already enrolled
      const existing = await sb.q("class_members", { params: { class_id: `eq.${c.id}`, student_id: `eq.${user.id}`, select: "id" } });
      if (existing.length) { setJoinErr("You're already in this class!"); setJoining(false); return; }
      await sb.q("class_members", { method: "POST", body: { class_id: c.id, student_id: user.id } });
      setClasses(p => [...p, c]);
      setJoinCode("");
    } catch (e) { setJoinErr(e.message); }
    setJoining(false);
  };

  const pickClass = async (c) => {
    setCls(c);
    try {
      const ul = await sb.q("class_topics", { params: { class_id: `eq.${c.id}`, select: "topic_id,recency_rank" } });
      if (!ul.length) { setQs([]); return; }
      const tids = ul.map(t => t.topic_id);

      // Build recency boost map: topicId → rank (1=most recent, 2, 3)
      const recencyBoost = {};
      ul.forEach(t => { if (t.recency_rank) recencyBoost[t.topic_id] = t.recency_rank; });
      setRecency(recencyBoost);

      const questions = await sb.q("questions", { params: { topic_id: `in.(${tids.join(",")})`, select: "*,topics(name)" } });
      const resps = await sb.q("responses", { params: { student_id: `eq.${user.id}`, class_id: `eq.${c.id}`, select: "question_id,is_correct,student_answer,answered_at", order: "answered_at.desc" } });

      const srMap = {};
      const byQ = {};
      resps.forEach(r => { if (!byQ[r.question_id]) byQ[r.question_id] = []; byQ[r.question_id].push(r); });
      Object.entries(byQ).forEach(([qid, rs]) => {
        let s = { ef: 2.5, iv: 0, reps: 0 };
        rs.reverse().forEach(r => { s = nextSR(r.is_correct, s); });
        srMap[qid] = s;
      });
      setSr(srMap);

      // Build per-topic accuracy from responses
      const qMap = {}; questions.forEach(q => { qMap[q.id] = q; });
      const tAcc = {}; // topicId → {name, t, c}
      questions.forEach(q => {
        if (!tAcc[q.topic_id]) tAcc[q.topic_id] = { name: q.topics?.name || "Unknown", t: 0, c: 0 };
      });
      resps.forEach(r => {
        const q = qMap[r.question_id];
        if (q && tAcc[q.topic_id]) { tAcc[q.topic_id].t++; if (r.is_correct) tAcc[q.topic_id].c++; }
      });
      const attempted = Object.values(tAcc).filter(t => t.t > 0).sort((a, b) => (a.c/a.t) - (b.c/b.t));
      const notStarted = Object.values(tAcc).filter(t => t.t === 0).length;
      setTopicStats([...attempted, ...(notStarted > 0 ? [{ name: `${notStarted} topic${notStarted !== 1 ? "s" : ""} not yet started`, t: 0, c: 0, isPlaceholder: true }] : [])]);

      setQs(sortQuestions(questions, srMap, recencyBoost));
      setQi(0); setAns(""); setRes(null);
      setStats({ t: resps.length, c: resps.filter(r => r.is_correct).length });

      const thisWeek = getWeekBounds(0);
      const thisWeekResps = resps.filter(r => { const d = new Date(r.answered_at); return d >= thisWeek.start && d <= thisWeek.end; });
      const validThisWeek = thisWeekResps.filter(r => !detectFakeAnswer(r.student_answer)).length;
      setWeeklyValid(validThisWeek);

      const weeks = [];
      for (let w = 0; w < 8; w++) {
        const bounds = getWeekBounds(w);
        const weekResps = resps.filter(r => { const d = new Date(r.answered_at); return d >= bounds.start && d <= bounds.end; });
        const valid = weekResps.filter(r => !detectFakeAnswer(r.student_answer)).length;
        const correct = weekResps.filter(r => r.is_correct && !detectFakeAnswer(r.student_answer)).length;
        const overTarget = Math.max(0, valid - WEEKLY_TARGET);
        const stars = Math.floor(overTarget / STAR_INTERVAL);
        weeks.push({ weekStart: bounds.start, label: w === 0 ? "This week" : w === 1 ? "Last week" : `${w} weeks ago`, total: weekResps.length, valid, correct, stars, metTarget: valid >= WEEKLY_TARGET });
      }
      setWeeklyData(weeks);
    } catch (e) { console.error(e); }
  };

  const submit = async () => {
    if (!ans.trim() || marking) return;
    setMarking(true);
    const q = qs[qi];
    const r = await aiMark(q.question_text, q.model_answer, ans, q.marks);
    setRes(r);
    const prev = sr[q.id] || {};
    const nxt = nextSR(r.correct, prev);
    setSr(s => ({ ...s, [q.id]: nxt }));
    if (r.correct) setStreak(s => s + 1); else setStreak(0);

    const isFlagged = r.flagged;
    if (!isFlagged) {
      const newValid = weeklyValid + 1;
      setWeeklyValid(newValid);
      const overTarget = newValid - WEEKLY_TARGET;
      if (overTarget > 0 && overTarget % STAR_INTERVAL === 0) {
        setStarPop(true);
        setTimeout(() => setStarPop(false), 2000);
      }
    }

    try {
      await sb.q("responses", { method: "POST", body: { student_id: user.id, question_id: q.id, class_id: cls.id, student_answer: ans, is_correct: r.correct, ai_feedback: r.flagged ? "FLAGGED: " + r.feedback : r.feedback, marks_awarded: r.marks_awarded } });
      setStats(s => ({ t: s.t + 1, c: s.c + (r.correct ? 1 : 0) }));
    } catch (e) { console.error(e); }
    setMarking(false);
  };

  const next = () => {
    setQs(sortQuestions(qs, sr, recency));
    setQi(0); setAns(""); setRes(null);
  };

  if (loading) return <div style={{ color: C.mid, padding: 40, textAlign: "center" }}>Loading...</div>;

  /* ── Class select + join ── */
  if (!cls) return (
    <div style={{ padding: 16, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.txt, marginBottom: 16 }}>Your Classes</div>

      {/* Join a class */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ color: C.txt, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Join a class</div>
        <div style={{ color: C.dim, fontSize: 12, marginBottom: 10 }}>Enter the code your teacher gave you</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Inp placeholder="e.g. X7K3NP" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
            style={{ letterSpacing: 3, fontWeight: 700, fontSize: 18, textAlign: "center", textTransform: "uppercase" }}
            maxLength={6} onKeyDown={e => e.key === "Enter" && joinClass()} />
          <Btn onClick={joinClass} disabled={!joinCode.trim() || joining} style={{ whiteSpace: "nowrap" }}>{joining ? "..." : "Join"}</Btn>
        </div>
        {joinErr && <div style={{ color: C.red, fontSize: 13, marginTop: 8, padding: "8px 10px", background: C.redS, borderRadius: 8 }}>{joinErr}</div>}
      </Card>

      {classes.length === 0 ? (
        <Card style={{ padding: "32px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📚</div>
          <div style={{ color: C.mid, fontSize: 14 }}>No classes yet</div>
          <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>Use a join code from your teacher above</div>
        </Card>
      ) : classes.map(c => (
        <Card key={c.id} onClick={() => pickClass(c)} style={{ padding: 16, marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: C.txt, fontWeight: 600, fontSize: 15 }}>{c.name}</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>{c.subjects?.name || "Science"}{c.year_group ? ` · Y${c.year_group}` : ""}</div>
          </div>
          <div style={{ color: C.pri, fontSize: 20 }}>›</div>
        </Card>
      ))}
    </div>
  );

  /* ── Quiz ── */
  const q = qs[qi];
  const acc = stats.t > 0 ? Math.round(stats.c / stats.t * 100) : 0;
  const isDue = !sr[q?.id] || !sr[q?.id]?.due || new Date(sr[q?.id].due) <= new Date();
  const weekPct = Math.min(100, Math.round((weeklyValid / WEEKLY_TARGET) * 100));
  const overTarget = Math.max(0, weeklyValid - WEEKLY_TARGET);
  const currentStars = Math.floor(overTarget / STAR_INTERVAL);

  return (
    <div style={{ padding: "12px 16px", maxWidth: 560, margin: "0 auto" }}>
      {/* Star pop animation */}
      {starPop && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, animation: "starPop 2s ease forwards", fontSize: 48, pointerEvents: "none" }}>⭐</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => setCls(null)} style={{ background: "none", border: "none", color: C.mid, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>← Classes</button>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {streak >= 3 && <Badge color={C.amb}>🔥 {streak}</Badge>}
          {currentStars > 0 && <Badge color={C.amb}>⭐ {currentStars}</Badge>}
          <Badge color={C.pri}>{cls.name}</Badge>
        </div>
      </div>

      {/* Weekly target progress */}
      <Card style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>Weekly target</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: weeklyValid >= WEEKLY_TARGET ? C.grn : weeklyValid >= WEEKLY_TARGET * 0.5 ? C.amb : C.red }}>{weeklyValid}/{WEEKLY_TARGET}</span>
            <button onClick={() => setShowWeeks(!showWeeks)} style={{ background: "none", border: "none", color: C.dim, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
              {showWeeks ? "Hide" : "History"}
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ width: "100%", height: 10, background: C.bdr, borderRadius: 99, overflow: "hidden", position: "relative" }}>
          <div style={{ width: `${weekPct}%`, height: "100%", background: weeklyValid >= WEEKLY_TARGET ? C.grn : weeklyValid >= WEEKLY_TARGET * 0.5 ? C.amb : C.red, borderRadius: 99, transition: "width .4s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: C.dim }}>{weeklyValid < WEEKLY_TARGET ? `${WEEKLY_TARGET - weeklyValid} to go` : "Target hit! 🎉"}</span>
          {overTarget > 0 && <span style={{ fontSize: 10, color: C.amb }}>Next ⭐ in {STAR_INTERVAL - (overTarget % STAR_INTERVAL)} questions</span>}
        </div>

        {/* Star progress if over target */}
        {currentStars > 0 && (
          <div style={{ marginTop: 8, padding: "6px 10px", background: C.ambS, borderRadius: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>{"⭐".repeat(Math.min(currentStars, 5))}{currentStars > 5 ? ` +${currentStars - 5}` : ""}</span>
            <span style={{ fontSize: 11, color: C.amb, fontWeight: 600 }}>{currentStars} achievement point{currentStars !== 1 ? "s" : ""} this week!</span>
          </div>
        )}
      </Card>

      {/* Previous weeks */}
      {showWeeks && (
        <Card style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.txt, marginBottom: 10 }}>Previous weeks</div>
          {weeklyData.filter((_, i) => i > 0).map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: i < weeklyData.length - 2 ? `1px solid ${C.bdr}` : "none" }}>
              <div style={{ flex: 1, fontSize: 12, color: C.mid }}>{w.label}</div>
              <div style={{ width: 80 }}>
                <div style={{ width: "100%", height: 4, background: C.bdr, borderRadius: 99 }}>
                  <div style={{ width: `${Math.min(100, (w.valid / WEEKLY_TARGET) * 100)}%`, height: "100%", background: w.metTarget ? C.grn : C.red, borderRadius: 99 }} />
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: w.metTarget ? C.grn : C.red, minWidth: 35, textAlign: "right" }}>{w.valid}/{WEEKLY_TARGET}</span>
              {w.stars > 0 && <span style={{ fontSize: 12 }}>{"⭐".repeat(Math.min(w.stars, 3))}{w.stars > 3 ? `+${w.stars-3}` : ""}</span>}
              {!w.metTarget && w.valid > 0 && <span style={{ fontSize: 10, color: C.red }}>⚠️</span>}
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Stat label="Done" value={stats.t} color={C.acc} />
        <Stat label="Correct" value={stats.c} color={C.grn} />
        <Stat label="Accuracy" value={`${acc}%`} color={acc >= 70 ? C.grn : acc >= 50 ? C.amb : C.red} />
      </div>

      {/* Topic strength */}
      {topicStats.length > 0 && (
        <Card style={{ padding: 14, marginBottom: 14 }}>
          <button onClick={() => setShowTopics(p => !p)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>Topic strength</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!showTopics && (() => {
                const attempted = topicStats.filter(t => !t.isPlaceholder);
                const weak = attempted.filter(t => t.t > 0 && Math.round(t.c / t.t * 100) < 50);
                return weak.length > 0
                  ? <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>{weak.length} weak area{weak.length !== 1 ? "s" : ""}</span>
                  : <span style={{ fontSize: 11, color: C.grn, fontWeight: 600 }}>Looking good</span>;
              })()}
              <span style={{ color: C.dim, fontSize: 12, transition: "transform .2s", display: "inline-block", transform: showTopics ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
            </div>
          </button>

          {showTopics && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {topicStats.map((t, i) => {
                if (t.isPlaceholder) return (
                  <div key="placeholder" style={{ padding: "8px 10px", borderRadius: 8, background: C.card2, fontSize: 12, color: C.dim, textAlign: "center" }}>{t.name}</div>
                );
                const pct = t.t > 0 ? Math.round(t.c / t.t * 100) : 0;
                const col = pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red;
                const label = pct >= 70 ? "Strong" : pct >= 50 ? "Getting there" : "Needs work";
                return (
                  <div key={i} style={{ padding: "9px 10px", borderRadius: 8, background: C.card2, borderLeft: `3px solid ${col}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: C.txt, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{t.name}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: C.dim }}>{t.t} answered</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: C.bdr, borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 99, transition: "width .4s" }} />
                      </div>
                      <span style={{ fontSize: 10, color: col, fontWeight: 600, minWidth: 72, textAlign: "right" }}>{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {qs.length === 0 ? (
        <Card style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
          <div style={{ color: C.mid }}>No questions available yet</div>
          <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>Your teacher hasn't unlocked any topics</div>
        </Card>
      ) : (
        <Card style={{ overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Badge color={C.acc}>{q?.topics?.name}</Badge>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {isDue ? <Badge color={C.amb}>Due</Badge> : <Badge color={C.grn}>Learned</Badge>}
              <span style={{ fontSize: 12, color: C.dim }}>{q?.marks}mk</span>
            </div>
          </div>
          <div style={{ padding: "20px 16px" }}>
            <div style={{ fontSize: 16, color: C.txt, lineHeight: 1.55, marginBottom: 20, fontWeight: 500 }}>{q?.question_text}</div>
            {!res ? (
              <>
                <TA value={ans} onChange={e => setAns(e.target.value)} placeholder="Type your answer..." rows={3} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
                <Btn onClick={submit} disabled={!ans.trim() || marking} style={{ width: "100%", marginTop: 12, padding: "14px 20px" }}>{marking ? "Marking..." : "Submit"}</Btn>
              </>
            ) : (
              <div style={{ animation: "slideUp .25s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 12, background: res.correct ? C.grnS : C.redS, border: `1px solid ${res.correct ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}`, marginBottom: 14 }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{res.correct ? "✓" : "✗"}</span>
                  <div>
                    <div style={{ color: res.correct ? C.grn : C.red, fontWeight: 700, fontSize: 15 }}>{res.correct ? "Correct!" : "Not quite"} <span style={{ fontWeight: 400, opacity: .7 }}>({res.marks_awarded}/{q.marks})</span></div>
                    <div style={{ color: C.mid, fontSize: 13, marginTop: 3, lineHeight: 1.4 }}>{res.feedback}</div>
                  </div>
                </div>
                <div style={{ padding: "10px 14px", background: `${C.bdr}44`, borderRadius: 10, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: .4 }}>You wrote</span>
                  <div style={{ color: C.mid, marginTop: 3 }}>{ans}</div>
                </div>
                <div style={{ padding: "10px 14px", background: C.priSoft, borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
                  <span style={{ color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: .4 }}>Model answer</span>
                  <div style={{ color: C.txt, marginTop: 3 }}>{q.model_answer}</div>
                </div>
                <Btn onClick={next} style={{ width: "100%", padding: "14px 20px" }}>Next question →</Btn>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── TEACHER ─── */
function Teacher({ user }) {
  const [tab, setTab] = useState("dashboard");
  const [classes, setClasses] = useState([]);
  const [cls, setCls] = useState(null);
  const [topics, setTopics] = useState([]);
  const [unlocked, setUnlocked] = useState(new Set());
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(null);
  const [schools, setSchools] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sId, setSId] = useState(null);
  const [subId, setSubId] = useState(null);
  const [fv, setFv] = useState("");
  const [cf, setCf] = useState({ n: "", y: "" });
  const [timePeriod, setTimePeriod] = useState("thisWeek");
  const [targetDraft, setTargetDraft] = useState(null);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingRecency, setSavingRecency] = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const [c, sc, su] = await Promise.all([
        sb.q("classes", { params: { teacher_id: `eq.${user.id}`, select: "*,subjects(name)" } }),
        sb.q("schools", {}), sb.q("subjects", {}),
      ]);
      setClasses(c); setSchools(sc); setSubjects(su);
      if (c.length) { setCls(c[0]); await loadCls(c[0]); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCls = async (c) => {
    try {
      const [allT, ul, resps, mems] = await Promise.all([
        sb.q("topics", { params: { subject_id: `eq.${c.subject_id}`, select: "*", order: "sort_order.asc" } }),
        sb.q("class_topics", { params: { class_id: `eq.${c.id}`, select: "topic_id,recency_rank" } }),
        sb.q("responses", { params: { class_id: `eq.${c.id}`, select: "*,questions(question_text,model_answer,topic_id,topics(name)),profiles(display_name)" } }),
        sb.q("class_members", { params: { class_id: `eq.${c.id}`, select: "*,profiles(display_name)" } }),
      ]);
      setTopics(allT); setUnlocked(new Set(ul.map(t => t.topic_id)));

      const clsTarget = c.weekly_target ?? WEEKLY_TARGET;
      const sm = {};
      mems.forEach(m => {
        sm[m.student_id] = { name: m.profiles?.display_name || "?", t: 0, c: 0, weekValid: 0, weekStars: 0, flagged: 0, targetOverride: m.weekly_target_override ?? null };
      });
      const mis = {}, tp = {};
      const thisWeekBounds = getWeekBounds(0);

      // Pre-calculate 12 week boundaries for history
      const weekBounds = Array.from({ length: 12 }, (_, i) => getWeekBounds(i));

      resps.forEach(r => {
        if (sm[r.student_id]) {
          sm[r.student_id].t++;
          if (r.is_correct) sm[r.student_id].c++;
          const isFlagged = r.ai_feedback && r.ai_feedback.startsWith("FLAGGED:");
          if (isFlagged) sm[r.student_id].flagged++;
          const d = new Date(r.answered_at);
          if (d >= thisWeekBounds.start && d <= thisWeekBounds.end && !isFlagged) {
            sm[r.student_id].weekValid++;
          }
        }
        if (!r.is_correct && r.questions) {
          const k = r.questions.question_text;
          if (!mis[k]) mis[k] = { q: k, topic: r.questions.topics?.name || "", n: 0, ans: [] };
          mis[k].n++; if (mis[k].ans.length < 3) mis[k].ans.push(r.student_answer);
        }
        if (r.questions?.topics?.name) {
          const t = r.questions.topics.name;
          if (!tp[t]) tp[t] = { t: 0, c: 0 }; tp[t].t++; if (r.is_correct) tp[t].c++;
        }
      });

      // Build per-student 12-week history
      Object.keys(sm).forEach(sid => {
        const sResps = resps.filter(r => r.student_id === sid);
        sm[sid].weeklyHistory = weekBounds.map((wb, i) => {
          const wResps = sResps.filter(r => { const d = new Date(r.answered_at); return d >= wb.start && d <= wb.end; });
          const valid = wResps.filter(r => !(r.ai_feedback && r.ai_feedback.startsWith("FLAGGED:"))).length;
          const label = i === 0 ? "This wk" : i === 1 ? "Last wk" : `${i}w ago`;
          return { valid, label, weeksAgo: i };
        });
      });

      // Period stats
      const periodResps = (weeksBack) => {
        const cutoff = weeksBack === null ? new Date(0) : getWeekBounds(weeksBack - 1).start;
        return resps.filter(r => new Date(r.answered_at) >= cutoff);
      };
      const mkPeriod = (rs) => ({ total: rs.length, correct: rs.filter(r => r.is_correct).length });

      const thisMonday = thisWeekBounds.start;
      const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);

      setDash({
        tR: resps.length, tC: resps.filter(r => r.is_correct).length,
        clsTarget,
        recency: ul.filter(t => t.recency_rank).map(t => ({ topicId: t.topic_id, rank: t.recency_rank })).sort((a, b) => a.rank - b.rank),
        thisWeek: mkPeriod(resps.filter(r => new Date(r.answered_at) >= thisMonday)),
        lastWeek: mkPeriod(resps.filter(r => { const d = new Date(r.answered_at); return d >= lastMonday && d < thisMonday; })),
        last4Weeks: mkPeriod(periodResps(4)),
        allTime: mkPeriod(resps),
        students: Object.entries(sm).map(([id, d]) => {
          const target = d.targetOverride ?? clsTarget;
          const over = Math.max(0, d.weekValid - target);
          return { id, ...d, weekStars: Math.floor(over / STAR_INTERVAL) };
        }),
        mis: Object.values(mis).sort((a, b) => b.n - a.n).slice(0, 10),
        tp: Object.entries(tp).map(([name, d]) => ({ name, ...d, pct: d.t ? Math.round(d.c / d.t * 100) : 0 })).sort((a, b) => a.pct - b.pct),
        mems: mems.length,
      });
    } catch (e) { console.error(e); }
  };

  const toggleT = async (tid) => {
    if (!cls) return;
    try {
      if (unlocked.has(tid)) {
        await sb.del("class_topics", { class_id: `eq.${cls.id}`, topic_id: `eq.${tid}` });
        setUnlocked(p => { const n = new Set(p); n.delete(tid); return n; });
      } else {
        await sb.q("class_topics", { method: "POST", body: { class_id: cls.id, topic_id: tid, unlocked_by: user.id } });
        setUnlocked(p => new Set(p).add(tid));
      }
    } catch (e) { console.error(e); }
  };

  const saveClsTarget = async (newTarget) => {
    if (!cls || savingTarget) return;
    setSavingTarget(true);
    try {
      await sb.q("classes", { method: "PATCH", params: { id: `eq.${cls.id}` }, body: { weekly_target: newTarget } });
      const updated = { ...cls, weekly_target: newTarget };
      setCls(updated);
      setClasses(prev => prev.map(c => c.id === cls.id ? updated : c));
      await loadCls(updated);
    } catch (e) { console.error(e); }
    setSavingTarget(false);
  };

  // Set a topic as recently taught (rank 1), cascading existing ranks down.
  // Old rank 1 → 2, old rank 2 → 3, old rank 3 → cleared.
  const setTopicRecency = async (topicId) => {
    if (!cls || savingRecency) return;
    setSavingRecency(true);
    try {
      const current = dash?.recency || []; // [{topicId, rank}]
      // Build new rank assignments with cascade
      const filtered = current.filter(r => r.topicId !== topicId); // remove topic if already ranked
      const cascaded = filtered
        .map(r => r.rank < 3 ? { ...r, rank: r.rank + 1 } : null)
        .filter(Boolean);
      const newState = [{ topicId, rank: 1 }, ...cascaded];
      // Clear all current ranks first (unique constraint requires this)
      await Promise.all(current.map(r =>
        sb.q("class_topics", { method: "PATCH", params: { class_id: `eq.${cls.id}`, topic_id: `eq.${r.topicId}` }, body: { recency_rank: null } })
      ));
      // Apply new ranks sequentially
      for (const r of newState) {
        await sb.q("class_topics", { method: "PATCH", params: { class_id: `eq.${cls.id}`, topic_id: `eq.${r.topicId}` }, body: { recency_rank: r.rank } });
      }
      await loadCls(cls);
    } catch (e) { console.error(e); }
    setSavingRecency(false);
  };

  const clearTopicRecency = async (topicId) => {
    if (!cls) return;
    try {
      await sb.q("class_topics", { method: "PATCH", params: { class_id: `eq.${cls.id}`, topic_id: `eq.${topicId}` }, body: { recency_rank: null } });
      await loadCls(cls);
    } catch (e) { console.error(e); }
  };

  const doSetup = async () => {
    if (!cf.n.trim()) return;
    try {
      // Use existing school and subject, or create if none exist
      let schoolId = sId;
      let subjectId = subId;

      if (!schoolId && schools.length > 0) schoolId = schools[0].id;
      if (!schoolId && fv.trim()) {
        const [s] = await sb.q("schools", { method: "POST", body: { name: fv } });
        setSchools(p => [...p, s]); schoolId = s.id;
      }
      if (!schoolId) return;

      if (!subjectId && subjects.length > 0) {
        // Pick the subject with the most topics (the one with your question bank)
        subjectId = subjects[0].id;
      }
      if (!subjectId) {
        const [s] = await sb.q("subjects", { method: "POST", body: { name: "Science", school_id: schoolId } });
        setSubjects(p => [...p, s]); subjectId = s.id;
      }

      const [c] = await sb.q("classes", { method: "POST", body: { name: cf.n, school_id: schoolId, teacher_id: user.id, subject_id: subjectId, year_group: parseInt(cf.y) || null } });
      const full = await sb.q("classes", { params: { id: `eq.${c.id}`, select: "*,subjects(name)" }, single: true });
      setClasses(p => [...p, full]); setCls(full); setSetup(null); setCf({ n: "", y: "" }); await loadCls(full);
    } catch (e) { console.error(e); }
  };

  if (loading) return <div style={{ color: C.mid, padding: 40, textAlign: "center" }}>Loading...</div>;
  const acc = dash && dash.tR > 0 ? Math.round(dash.tC / dash.tR * 100) : 0;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "12px 16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={cls?.id || ""} onChange={async e => { const c = classes.find(x => x.id === e.target.value); setCls(c); if (c) await loadCls(c); }}
            style={{ flex: 1, padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.txt, fontSize: 14, outline: "none" }}>
            <option value="">Select class...</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.year_group ? ` (Y${c.year_group})` : ""}</option>)}
          </select>
          <Btn v="ghost" onClick={() => setSetup("class")} style={{ padding: "10px 14px", fontSize: 13, whiteSpace: "nowrap" }}>+ New</Btn>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
          {["dashboard", "starter", "topics", "questions"].map(t => <Pill key={t} on={tab === t} onClick={() => setTab(t)}>{t === "starter" ? "Lesson Starter" : t.charAt(0).toUpperCase() + t.slice(1)}</Pill>)}
        </div>
      </div>

      {setup && (
        <Card style={{ padding: 20, marginBottom: 14 }}>
          <div style={{ color: C.txt, fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Create new class</div>
          <div style={{ color: C.dim, fontSize: 12, marginBottom: 14 }}>All 92 topics and 822 questions will be available — use the Topics tab to unlock them for students</div>

          {schools.length === 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, marginBottom: 6 }}>School name</div>
              <Inp placeholder="e.g. James Hornsby" value={fv} onChange={e => setFv(e.target.value)} />
            </div>
          )}

          {subjects.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, marginBottom: 6 }}>Subject</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {subjects.map(s => <Pill key={s.id} on={subId === s.id} onClick={() => setSubId(s.id)}>{s.name}</Pill>)}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, marginBottom: 6 }}>Class name</div>
              <Inp placeholder="e.g. 10X1" value={cf.n} onChange={e => setCf(p => ({ ...p, n: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, marginBottom: 6 }}>Year</div>
              <Inp placeholder="e.g. 10" type="number" value={cf.y} onChange={e => setCf(p => ({ ...p, y: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={doSetup} disabled={!cf.n.trim()} style={{ flex: 1 }}>Create class</Btn>
            <Btn v="ghost" onClick={() => setSetup(null)} style={{ fontSize: 12 }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {!cls ? (
        <Card style={{ padding: "48px 20px", textAlign: "center" }}><div style={{ color: C.mid }}>Select or create a class.</div></Card>
      ) : (
        <>
          {tab === "dashboard" && dash && (
            <div>
              {/* Join code banner */}
              <Card style={{ padding: "14px 16px", marginBottom: 12, background: C.priSoft, borderColor: "rgba(99,102,241,0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.mid, marginBottom: 2 }}>Student join code</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: C.pri, letterSpacing: 6, fontFamily: "monospace" }}>{cls.join_code || "..."}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: C.dim }}>Share this with students</div>
                    <div style={{ fontSize: 11, color: C.dim }}>They enter it to join this class</div>
                  </div>
                </div>
              </Card>

              {/* Period selector + stats */}
              <Card style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ color: C.txt, fontWeight: 600, fontSize: 14 }}>Class Activity</div>
                  <span style={{ fontSize: 11, color: C.dim }}>{dash.mems} student{dash.mems !== 1 ? "s" : ""} enrolled</span>
                </div>
                {/* Time period pills */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {[
                    { k: "thisWeek", l: "This week" },
                    { k: "lastWeek", l: "Last week" },
                    { k: "last4Weeks", l: "Last 4 weeks" },
                    { k: "allTime", l: "All time" },
                  ].map(({ k, l }) => (
                    <Pill key={k} on={timePeriod === k} onClick={() => setTimePeriod(k)} style={{ fontSize: 12, padding: "6px 12px" }}>{l}</Pill>
                  ))}
                </div>
                {(() => {
                  const pd = dash[timePeriod] || dash.thisWeek;
                  const pct = pd.total > 0 ? Math.round(pd.correct / pd.total * 100) : 0;
                  return (
                    <div style={{ padding: 14, borderRadius: 10, background: C.card2, border: `1px solid ${C.bdr}` }}>
                      <div style={{ fontSize: 30, fontWeight: 800, color: C.txt, letterSpacing: -1 }}>{pd.total}</div>
                      <div style={{ fontSize: 11, color: C.mid, marginTop: 2, marginBottom: 10 }}>questions answered</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: C.grn, fontWeight: 600 }}>{pd.correct} correct</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.dim }}>{pct}%</span>
                      </div>
                      <div style={{ marginTop: 8 }}><Bar pct={pct} /></div>
                    </div>
                  );
                })()}
                {/* Week-on-week change (only when showing thisWeek) */}
                {timePeriod === "thisWeek" && dash.lastWeek?.total > 0 && (
                  <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: C.card2, display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    {(() => {
                      const diff = (dash.thisWeek?.total || 0) - dash.lastWeek.total;
                      const up = diff > 0; const same = diff === 0;
                      return <span style={{ color: same ? C.dim : up ? C.grn : C.red, fontWeight: 700 }}>{same ? "→" : up ? "↑" : "↓"} {same ? "Same as" : `${Math.abs(diff)} ${up ? "more" : "fewer"} than`} last week</span>;
                    })()}
                  </div>
                )}
              </Card>

              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <Stat label="All time" value={dash.tR} color={C.acc} />
                <Stat label="Correct" value={dash.tC} color={C.grn} />
                <Stat label="Accuracy" value={`${acc}%`} color={acc >= 70 ? C.grn : acc >= 50 ? C.amb : C.red} />
              </div>

              {/* Class target slider */}
              <Card style={{ padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>Weekly homework target</div>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: C.pri }}>{targetDraft ?? dash.clsTarget}</span>
                </div>
                <input type="range" min={5} max={100} step={5}
                  value={targetDraft ?? dash.clsTarget}
                  onChange={e => setTargetDraft(Number(e.target.value))}
                  onMouseUp={e => { if (targetDraft !== null) saveClsTarget(targetDraft); setTargetDraft(null); }}
                  onTouchEnd={e => { if (targetDraft !== null) saveClsTarget(targetDraft); setTargetDraft(null); }}
                  style={{ width: "100%", accentColor: C.pri, cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: C.dim }}>5</span>
                  <span style={{ fontSize: 10, color: C.dim }}>questions / week · applies to whole class · override per student below</span>
                  <span style={{ fontSize: 10, color: C.dim }}>100</span>
                </div>
              </Card>

              {/* Recently taught — drives question frequency via forgetting curve boost */}
              <Card style={{ padding: 14, marginBottom: 12 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ color: C.txt, fontWeight: 600, fontSize: 13, marginBottom: 2 }}>Recently taught</div>
                  <div style={{ fontSize: 11, color: C.dim }}>Questions from recent topics appear more frequently. Slot 1 gets the strongest boost — students will see it most.</div>
                </div>
                {/* "What did you just teach?" picker */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) setTopicRecency(e.target.value); e.target.value = ""; }}
                    disabled={savingRecency}
                    style={{ flex: 1, padding: "9px 10px", background: C.card2, border: `1px solid ${C.bdr}`, borderRadius: 8, color: C.txt, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                  >
                    <option value="" disabled>{savingRecency ? "Saving..." : "What did you just teach? →"}</option>
                    {topics.filter(t => unlocked.has(t.id)).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                {/* Current slots */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[1, 2, 3].map(rank => {
                    const slot = dash.recency?.find(r => r.rank === rank);
                    const topicName = slot ? topics.find(t => t.id === slot.topicId)?.name : null;
                    const boostLabel = rank === 1 ? "strongest boost" : rank === 2 ? "medium boost" : "light boost";
                    return (
                      <div key={rank} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, background: C.card2, border: `1px solid ${slot ? "rgba(99,102,241,0.25)" : C.bdr}` }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: slot ? C.priSoft : C.bdr, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: slot ? C.pri : C.dim }}>{rank}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {slot ? (
                            <>
                              <div style={{ fontSize: 13, color: C.txt, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topicName || "Unknown topic"}</div>
                              <div style={{ fontSize: 10, color: C.dim }}>{boostLabel}</div>
                            </>
                          ) : (
                            <div style={{ fontSize: 13, color: C.dim, fontStyle: "italic" }}>Not set</div>
                          )}
                        </div>
                        {slot && (
                          <button onClick={() => clearTopicRecency(slot.topicId)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16, padding: "0 2px", lineHeight: 1 }}>×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>Students</div>
                  <span style={{ fontSize: 11, color: C.dim }}>Tap to manage · showing this week</span>
                </div>
                {dash.students.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>No students yet. Share the join code above.</div> :
                  <StudentList students={dash.students} cls={cls} clsTarget={dash.clsTarget} onRefresh={() => loadCls(cls)} />}
              </Card>

              <Card style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ color: C.txt, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Top Misconceptions</div>
                {dash.mis.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>No data yet.</div> :
                  dash.mis.map((m, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: C.card2, borderLeft: `3px solid ${C.red}`, marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                        <div style={{ fontSize: 13, color: C.txt, fontWeight: 500, lineHeight: 1.3 }}>{m.q}</div>
                        <Badge color={C.red} style={{ flexShrink: 0 }}>{m.n}×</Badge>
                      </div>
                      <div style={{ fontSize: 11, color: C.dim }}>{m.topic}</div>
                      {m.ans.length > 0 && <div style={{ marginTop: 5, display: "flex", gap: 4, flexWrap: "wrap" }}>{m.ans.map((a, j) => <span key={j} style={{ fontSize: 11, color: C.mid, background: C.redS, padding: "2px 7px", borderRadius: 6 }}>"{a}"</span>)}</div>}
                    </div>
                  ))}
              </Card>

              <Card style={{ padding: 14 }}>
                <div style={{ color: C.txt, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Topic Performance</div>
                {dash.tp.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>No data yet.</div> :
                  dash.tp.map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, background: C.card2, marginBottom: 4 }}>
                      <div style={{ flex: 1, color: C.txt, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                      <span style={{ fontSize: 11, color: C.dim }}>{t.t}</span>
                      <div style={{ width: 50 }}><Bar pct={t.pct} /></div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.pct >= 70 ? C.grn : t.pct >= 50 ? C.amb : C.red, minWidth: 28, textAlign: "right" }}>{t.pct}%</span>
                    </div>
                  ))}
              </Card>
            </div>
          )}

          {tab === "starter" && (
            <LessonStarter topics={topics} unlocked={unlocked} cls={cls} dash={dash} />
          )}

          {tab === "topics" && (
            <TopicSelector topics={topics} unlocked={unlocked} toggleT={toggleT} setUnlocked={setUnlocked} cls={cls} userId={user.id} />
          )}

          {tab === "questions" && <QMgr subjectId={cls.subject_id} userId={user.id} topics={topics} setTopics={setTopics} />}
        </>
      )}
    </div>
  );
}

/* ─── Student List with Management Actions ─── */
function StudentList({ students, cls, clsTarget, onRefresh }) {
  const [expanded, setExpanded] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [targetEdits, setTargetEdits] = useState({}); // studentId -> draft value

  const callManage = async (action, studentId, extra = {}) => {
    setBusy(true); setMsg("");
    try {
      const jwt = sb.auth.getToken();
      const r = await fetch(`${SUPA_URL}/functions/v1/manage-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${jwt || SUPA_KEY}` },
        body: JSON.stringify({ action, student_id: studentId, class_id: cls.id, ...extra }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg(d.message);
        if (action === "delete_student" || action === "remove_from_class") {
          setTimeout(() => { onRefresh(); setExpanded(null); setMsg(""); }, 1000);
        }
      } else {
        setMsg("Error: " + (d.error || "Unknown error"));
      }
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const saveTargetOverride = async (studentId, value) => {
    setBusy(true);
    try {
      const override = value === "" || value === null || value === undefined ? null : Number(value);
      await sb.q("class_members", {
        method: "PATCH",
        params: { student_id: `eq.${studentId}`, class_id: `eq.${cls.id}` },
        body: { weekly_target_override: override },
      });
      setTargetEdits(p => { const n = { ...p }; delete n[studentId]; return n; });
      setTimeout(() => onRefresh(), 300);
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  return (
    <div>
      {students.sort((a, b) => b.weekValid - a.weekValid).map(s => {
        const effectiveTarget = s.targetOverride ?? clsTarget;
        const p = s.t > 0 ? Math.round(s.c / s.t * 100) : 0;
        const weekPct = Math.min(100, Math.round((s.weekValid / effectiveTarget) * 100));
        const metTarget = s.weekValid >= effectiveTarget;
        const isExpanded = expanded === s.id;

        return (
          <div key={s.id} style={{ marginBottom: 4 }}>
            <button onClick={() => { setExpanded(isExpanded ? null : s.id); setNewPw(""); setMsg(""); setConfirmDelete(null); }} style={{
              width: "100%", padding: "10px 10px", borderRadius: isExpanded ? "8px 8px 0 0" : 8, background: C.card2, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              borderLeft: `3px solid ${metTarget ? C.grn : s.weekValid < effectiveTarget * 0.5 ? C.red : C.amb}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, color: C.txt, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{s.name}</div>
                {s.targetOverride && <span style={{ fontSize: 9, color: C.acc, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>custom target</span>}
                {s.weekStars > 0 && <span style={{ fontSize: 12 }}>{"⭐".repeat(Math.min(s.weekStars, 3))}{s.weekStars > 3 ? `+${s.weekStars - 3}` : ""}</span>}
                {s.flagged > 0 && <span style={{ fontSize: 10, color: C.red, fontWeight: 600 }}>🚩{s.flagged}</span>}
                <span style={{ fontSize: 11, fontWeight: 700, color: metTarget ? C.grn : C.red }}>{s.weekValid}/{effectiveTarget}</span>
                <span style={{ color: C.dim, fontSize: 12, transition: "transform .2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 5, background: C.bdr, borderRadius: 99 }}>
                  <div style={{ width: `${weekPct}%`, height: "100%", background: metTarget ? C.grn : weekPct >= 50 ? C.amb : C.red, borderRadius: 99, transition: "width .3s" }} />
                </div>
                <span style={{ fontSize: 10, color: C.dim, whiteSpace: "nowrap" }}>{p}% acc all time</span>
              </div>
            </button>

            {/* Expanded panel */}
            {isExpanded && (
              <div style={{ padding: 12, background: C.card, borderRadius: "0 0 8px 8px", borderLeft: `3px solid ${C.bdr}`, borderBottom: `1px solid ${C.bdr}`, borderRight: `1px solid ${C.bdr}` }}>
                {msg && <div style={{ padding: "8px 10px", borderRadius: 6, marginBottom: 10, fontSize: 12, background: msg.startsWith("Error") ? C.redS : C.grnS, color: msg.startsWith("Error") ? C.red : C.grn }}>{msg}</div>}

                {/* All-time stats */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: C.card2, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.acc }}>{s.t}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>All time</div>
                  </div>
                  <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: C.card2, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.grn }}>{s.c}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>Correct</div>
                  </div>
                  <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: C.card2, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: p >= 70 ? C.grn : p >= 50 ? C.amb : C.red }}>{p}%</div>
                    <div style={{ fontSize: 10, color: C.dim }}>Accuracy</div>
                  </div>
                </div>

                {/* 12-week history bars */}
                {s.weeklyHistory && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 8 }}>Weekly homework history (12 weeks)</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 72 }}>
                      {[...s.weeklyHistory].reverse().map((w, i) => {
                        const barH = effectiveTarget > 0 ? Math.min(100, (w.valid / effectiveTarget) * 100) : 0;
                        const met = w.valid >= effectiveTarget;
                        const isCurrent = w.weeksAgo === 0;
                        return (
                          <div key={i} title={`${w.label}: ${w.valid} questions`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <div style={{ fontSize: 8, color: met ? C.grn : w.valid > 0 ? C.amb : C.dim, fontWeight: 600, lineHeight: 1 }}>
                              {w.valid > 0 ? w.valid : ""}
                            </div>
                            <div style={{ width: "100%", height: 52, background: C.bdr, borderRadius: 3, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden", outline: isCurrent ? `1px solid ${C.pri}` : "none" }}>
                              <div style={{ width: "100%", height: `${Math.max(barH, w.valid > 0 ? 5 : 0)}%`, background: met ? C.grn : w.valid >= effectiveTarget * 0.5 ? C.amb : w.valid > 0 ? C.red : "transparent", borderRadius: 3, transition: "height .3s" }} />
                            </div>
                            <div style={{ fontSize: 7, color: isCurrent ? C.txt : C.dim, fontWeight: isCurrent ? 700 : 400, lineHeight: 1, textAlign: "center" }}>
                              {isCurrent ? "now" : `${w.weeksAgo}w`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Per-student target override */}
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: C.card2 }}>
                  <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 6 }}>
                    Individual target <span style={{ color: C.dim, fontWeight: 400 }}>(blank = use class default of {clsTarget})</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="number" min={1} max={200}
                      value={targetEdits[s.id] !== undefined ? targetEdits[s.id] : (s.targetOverride ?? "")}
                      placeholder={`${clsTarget} (class default)`}
                      onChange={e => setTargetEdits(p => ({ ...p, [s.id]: e.target.value }))}
                      style={{ flex: 1, padding: "7px 10px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, color: C.txt, fontSize: 13, fontFamily: "inherit", outline: "none" }}
                    />
                    <Btn onClick={() => saveTargetOverride(s.id, targetEdits[s.id] !== undefined ? targetEdits[s.id] : (s.targetOverride ?? ""))}
                      disabled={busy || targetEdits[s.id] === undefined}
                      style={{ whiteSpace: "nowrap", fontSize: 12, padding: "8px 14px" }}>
                      {busy ? "..." : "Save"}
                    </Btn>
                    {s.targetOverride && (
                      <Btn v="ghost" onClick={() => saveTargetOverride(s.id, "")} disabled={busy} style={{ fontSize: 12, padding: "8px 10px" }}>
                        Reset
                      </Btn>
                    )}
                  </div>
                </div>

                {/* Reset password */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 6 }}>Reset password</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Inp placeholder="New password (min 6)" type="text" value={newPw} onChange={e => setNewPw(e.target.value)} style={{ fontSize: 13, padding: "8px 10px" }} />
                    <Btn onClick={() => callManage("reset_password", s.id, { new_password: newPw })} disabled={newPw.length < 6 || busy} style={{ whiteSpace: "nowrap", fontSize: 12, padding: "8px 14px" }}>
                      {busy ? "..." : "Reset"}
                    </Btn>
                  </div>
                </div>

                {/* Remove + Delete */}
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn v="ghost" onClick={() => callManage("remove_from_class", s.id)} disabled={busy} style={{ flex: 1, fontSize: 11, padding: "8px 10px" }}>
                    Remove from class
                  </Btn>
                  {confirmDelete === s.id ? (
                    <Btn v="ghost" onClick={() => callManage("delete_student", s.id)} disabled={busy} style={{ flex: 1, fontSize: 11, padding: "8px 10px", background: C.redS, color: C.red, borderColor: "rgba(239,68,68,.3)" }}>
                      {busy ? "..." : "Confirm delete"}
                    </Btn>
                  ) : (
                    <Btn v="ghost" onClick={() => setConfirmDelete(s.id)} style={{ flex: 1, fontSize: 11, padding: "8px 10px", color: C.red, borderColor: "rgba(239,68,68,.2)" }}>
                      Delete account
                    </Btn>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Lesson Starter Generator ─── */
function LessonStarter({ topics, unlocked, cls, dash }) {
  const [numQs, setNumQs] = useState(5);
  const [lastTopic, setLastTopic] = useState("");
  const [lastTopicQs, setLastTopicQs] = useState([]); // all questions for selected topic
  const [selectedLastQs, setSelectedLastQs] = useState(new Set()); // teacher-picked question IDs
  const [recentTopics, setRecentTopics] = useState([]);
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [mode, setMode] = useState("setup"); // setup | slideshow | list

  // Only show unlocked topics
  const availableTopics = topics.filter(t => unlocked.has(t.id));

  // Group by prefix for nicer display
  const getPrefix = (name) => { const m = name.match(/^([BCP])/); return m ? (m[1] === 'B' ? '🧬' : m[1] === 'C' ? '⚗️' : '⚡') : '📚'; };

  // Load questions when teacher picks a "last lesson" topic
  const selectLastTopic = async (topicId) => {
    setLastTopic(topicId);
    setSelectedLastQs(new Set());
    setLastTopicQs([]);
    if (!topicId) return;
    setLastTopicQs([{id:"loading"}]); // loading indicator
    try {
      const qs = await sb.q("questions", { params: { topic_id: `eq.${topicId}`, select: "*,topics(name)", order: "difficulty.asc" } });
      setLastTopicQs(qs);
      setSelectedLastQs(new Set(qs.map(q => q.id)));
    } catch (e) { console.error("Failed to load questions:", e); setLastTopicQs([]); }
  };

  const toggleLastQ = (qId) => {
    setSelectedLastQs(prev => {
      const n = new Set(prev);
      if (n.has(qId)) n.delete(qId); else n.add(qId);
      return n;
    });
  };

  const generate = async () => {
    if (!lastTopic) return;
    setLoading(true);

    try {
      // Fetch all questions for unlocked topics
      const tids = [...unlocked];
      const allQs = await sb.q("questions", { params: { topic_id: `in.(${tids.join(",")})`, select: "*,topics(name)" } });

      // Get misconception question IDs from dash data
      const misconceptionQs = [];
      if (dash?.mis) {
        for (const m of dash.mis) {
          const match = allQs.find(q => q.question_text === m.q);
          if (match) misconceptionQs.push(match);
        }
      }

      // Questions from last lesson topic — USE TEACHER'S SELECTION
      const lastTopicSelected = allQs.filter(q => selectedLastQs.has(q.id));

      // Questions from recent topics (selected by teacher)
      const recentQs = allQs.filter(q => recentTopics.includes(q.topic_id) && q.topic_id !== lastTopic);

      // Other unlocked questions (not last topic, not recent, not misconceptions)
      const misconIds = new Set(misconceptionQs.map(q => q.id));
      const lastIds = new Set(lastTopicQs.map(q => q.id));
      const recentIds = new Set(recentQs.map(q => q.id));

      // Calculate split
      const nLast = Math.ceil(numQs * 0.4);
      const nRecent = Math.ceil(numQs * 0.3);
      const nMiscon = numQs - nLast - nRecent;

      // Shuffle helper
      const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

      // Pick questions
      const picked = [];
      const usedIds = new Set();

      // 1. Last lesson (40%) — from teacher's selected questions
      const nLastMax = Math.ceil(numQs * 0.4);
      const shuffledLast = shuffle(lastTopicSelected);
      for (const q of shuffledLast) {
        if (picked.length >= nLastMax) break;
        if (!usedIds.has(q.id)) { picked.push({ ...q, source: "last" }); usedIds.add(q.id); }
      }

      // 2. Recent topics (30%)
      const shuffledRecent = shuffle(recentQs);
      for (const q of shuffledRecent) {
        if (picked.filter(p => p.source === "recent").length >= nRecent) break;
        if (!usedIds.has(q.id)) { picked.push({ ...q, source: "recent" }); usedIds.add(q.id); }
      }

      // 3. Misconceptions (30%) — fill remaining
      const remaining = numQs - picked.length;
      const shuffledMis = shuffle(misconceptionQs);
      let misAdded = 0;
      for (const q of shuffledMis) {
        if (misAdded >= remaining) break;
        if (!usedIds.has(q.id)) { picked.push({ ...q, source: "misconception" }); usedIds.add(q.id); misAdded++; }
      }

      // If we still need more (not enough misconceptions), fill from other unlocked topics
      if (picked.length < numQs) {
        const filler = shuffle(allQs.filter(q => !usedIds.has(q.id)));
        for (const q of filler) {
          if (picked.length >= numQs) break;
          picked.push({ ...q, source: "other" }); usedIds.add(q.id);
        }
      }

      setGenerated(picked);
      setCurrentQ(0);
      setShowAnswers(false);
      setMode("slideshow");
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Slideshow mode — one question at a time for projecting
  if (mode === "slideshow" && generated) {
    const q = generated[currentQ];
    const sourceLabel = { last: "Last lesson", recent: "Recent", misconception: "Misconception", other: "Review" };
    const sourceColor = { last: C.pri, recent: C.acc, misconception: C.red, other: C.mid };

    return (
      <div>
        {/* Controls bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Btn v="ghost" onClick={() => { setMode("setup"); setGenerated(null); }} style={{ padding: "8px 14px", fontSize: 12 }}>← Back</Btn>
          <div style={{ display: "flex", gap: 6 }}>
            <Pill on={mode === "slideshow"} onClick={() => setMode("slideshow")}>Slideshow</Pill>
            <Pill on={mode === "list"} onClick={() => setMode("list")}>All questions</Pill>
          </div>
        </div>

        {/* Question card — large for projecting */}
        <Card style={{ overflow: "hidden", minHeight: 300 }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Badge color={sourceColor[q?.source]}>{sourceLabel[q?.source]}</Badge>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: C.dim }}>{q?.topics?.name}</span>
              <Badge color={C.mid}>Q{currentQ + 1}/{generated.length}</Badge>
            </div>
          </div>

          <div style={{ padding: "40px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 22, color: C.txt, lineHeight: 1.5, fontWeight: 500 }}>{q?.question_text}</div>

            {showAnswers && (
              <div style={{ marginTop: 28, padding: "16px 20px", background: C.grnS, borderRadius: 12, border: `1px solid rgba(34,197,94,0.2)`, animation: "slideUp .25s ease" }}>
                <div style={{ fontSize: 10, color: C.grn, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Answer</div>
                <div style={{ fontSize: 18, color: C.txt, fontWeight: 500 }}>{q?.model_answer}</div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Btn v="ghost" onClick={() => { setCurrentQ(c => Math.max(0, c - 1)); setShowAnswers(false); }} disabled={currentQ === 0} style={{ padding: "10px 16px", fontSize: 13 }}>← Prev</Btn>
            <Btn v={showAnswers ? "ghost" : "pri"} onClick={() => setShowAnswers(!showAnswers)} style={{ padding: "10px 20px", fontSize: 13 }}>
              {showAnswers ? "Hide answer" : "Show answer"}
            </Btn>
            <Btn v="ghost" onClick={() => { setCurrentQ(c => Math.min(generated.length - 1, c + 1)); setShowAnswers(false); }} disabled={currentQ === generated.length - 1} style={{ padding: "10px 16px", fontSize: 13 }}>Next →</Btn>
          </div>
        </Card>

        {/* Question dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
          {generated.map((_, i) => (
            <button key={i} onClick={() => { setCurrentQ(i); setShowAnswers(false); }} style={{
              width: 28, height: 28, borderRadius: 99, border: `2px solid ${i === currentQ ? C.pri : C.bdr}`,
              background: i === currentQ ? C.pri : "transparent", color: i === currentQ ? "#fff" : C.dim,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>{i + 1}</button>
          ))}
        </div>
      </div>
    );
  }

  // List mode — all questions visible
  if (mode === "list" && generated) {
    const sourceLabel = { last: "Last lesson", recent: "Recent", misconception: "Misconception", other: "Review" };
    const sourceColor = { last: C.pri, recent: C.acc, misconception: C.red, other: C.mid };

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Btn v="ghost" onClick={() => { setMode("setup"); setGenerated(null); }} style={{ padding: "8px 14px", fontSize: 12 }}>← Back</Btn>
          <div style={{ display: "flex", gap: 6 }}>
            <Pill on={mode === "slideshow"} onClick={() => setMode("slideshow")}>Slideshow</Pill>
            <Pill on={mode === "list"} onClick={() => setMode("list")}>All questions</Pill>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ color: C.txt, fontWeight: 600, fontSize: 14 }}>{generated.length} Questions</div>
          <Btn v={showAnswers ? "ghost" : "pri"} onClick={() => setShowAnswers(!showAnswers)} style={{ padding: "8px 16px", fontSize: 12 }}>
            {showAnswers ? "Hide answers" : "Show answers"}
          </Btn>
        </div>

        {generated.map((q, i) => (
          <Card key={i} style={{ padding: 16, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: 99, background: C.priSoft, color: C.pri, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                <Badge color={sourceColor[q.source]}>{sourceLabel[q.source]}</Badge>
              </div>
              <span style={{ fontSize: 11, color: C.dim }}>{q.topics?.name}</span>
            </div>
            <div style={{ fontSize: 15, color: C.txt, lineHeight: 1.4, fontWeight: 500 }}>{q.question_text}</div>
            {showAnswers && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: C.grnS, borderRadius: 8, fontSize: 13, color: C.txt, animation: "slideUp .2s ease" }}>
                {q.model_answer}
              </div>
            )}
          </Card>
        ))}
      </div>
    );
  }

  // Setup mode
  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ color: C.txt, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Generate Lesson Starter</div>
        <div style={{ color: C.dim, fontSize: 12, marginBottom: 16 }}>Create a retrieval question set to project at the start of your lesson</div>

        {/* Number of questions */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, marginBottom: 8 }}>Number of questions</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[3, 5, 8, 10].map(n => (
              <Pill key={n} on={numQs === n} onClick={() => setNumQs(n)} style={{ flex: 1, textAlign: "center" }}>{n}</Pill>
            ))}
          </div>
        </div>

        {/* Last lesson topic */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, marginBottom: 8 }}>What did you teach last lesson?</div>
          <select value={lastTopic} onChange={e => selectLastTopic(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.txt, fontSize: 14, outline: "none" }}>
            <option value="">Select topic...</option>
            {availableTopics.map(t => <option key={t.id} value={t.id}>{getPrefix(t.name)} {t.name}</option>)}
          </select>
        </div>

        {/* Question picker for last lesson */}
        {lastTopic && lastTopicQs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {lastTopicQs.length === 1 && lastTopicQs[0].id === "loading" ? (
              <div style={{ padding: "16px", textAlign: "center", color: C.mid, fontSize: 13 }}>Loading questions...</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: C.mid, fontWeight: 600 }}>Pick questions from this topic ({lastTopicQs.length} available)</div>
                  <button onClick={() => {
                    if (selectedLastQs.size === lastTopicQs.length) setSelectedLastQs(new Set());
                    else setSelectedLastQs(new Set(lastTopicQs.map(q => q.id)));
                  }} style={{ background: "none", border: "none", color: C.pri, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {selectedLastQs.size === lastTopicQs.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>{selectedLastQs.size} of {lastTopicQs.length} selected — up to {Math.ceil(numQs * 0.4)} will be used</div>
                <div style={{ maxHeight: 400, overflowY: "auto", borderRadius: 10, border: `1px solid ${C.bdr}`, background: C.card }}>
                  {lastTopicQs.map(q => {
                    const sel = selectedLastQs.has(q.id);
                    const diffLabel = q.difficulty === 1 ? "Easy" : q.difficulty === 2 ? "Medium" : "Hard";
                    const diffColor = q.difficulty === 1 ? C.grn : q.difficulty === 2 ? C.amb : C.red;
                    return (
                      <button key={q.id} onClick={() => toggleLastQ(q.id)} style={{
                        display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", width: "100%", textAlign: "left", fontFamily: "inherit", fontSize: 13, cursor: "pointer",
                        background: sel ? C.priSoft : "transparent", border: "none", borderBottom: `1px solid ${C.bdr}`, color: sel ? C.txt : C.mid, transition: "all .1s",
                      }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? C.pri : C.dim}`, background: sel ? C.pri : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{sel ? "✓" : ""}</div>
                        <div style={{ flex: 1, lineHeight: 1.35 }}>{q.question_text}</div>
                        <span style={{ fontSize: 10, color: diffColor, fontWeight: 600, flexShrink: 0 }}>{diffLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Recent topics (optional multi-select) */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, marginBottom: 4 }}>Recent topics (last few lessons)</div>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>Tap to select 2-3 topics you taught recently</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 200, overflowY: "auto" }}>
            {availableTopics.filter(t => t.id !== lastTopic).map(t => {
              const sel = recentTopics.includes(t.id);
              return (
                <button key={t.id} onClick={() => setRecentTopics(p => sel ? p.filter(x => x !== t.id) : [...p, t.id])} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit", fontSize: 13,
                  background: sel ? C.priSoft : "transparent", border: `1px solid ${sel ? "rgba(99,102,241,.2)" : "transparent"}`, color: sel ? C.txt : C.mid,
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? C.pri : C.dim}`, background: sel ? C.pri : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{sel ? "✓" : ""}</div>
                  {getPrefix(t.name)} {t.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Misconception info */}
        {dash?.mis?.length > 0 && (
          <div style={{ padding: "10px 14px", background: C.redS, borderRadius: 10, marginBottom: 16, fontSize: 12, color: C.mid, border: `1px solid rgba(239,68,68,0.15)` }}>
            <span style={{ color: C.red, fontWeight: 600 }}>{dash.mis.length} misconception{dash.mis.length !== 1 ? "s" : ""}</span> detected from retrieval data — these will automatically be included in the remaining {Math.round(numQs * 0.3)} question{Math.round(numQs * 0.3) !== 1 ? "s" : ""}
          </div>
        )}

        {/* Generate button */}
        <Btn onClick={generate} disabled={!lastTopic || loading} style={{ width: "100%", padding: "14px 20px" }}>
          {loading ? "Generating..." : `Generate ${numQs} questions`}
        </Btn>

        {/* Split preview */}
        <div style={{ marginTop: 12, display: "flex", gap: 6, justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: C.pri }}>● {Math.ceil(numQs * 0.4)} last lesson</span>
          <span style={{ fontSize: 11, color: C.acc }}>● {Math.ceil(numQs * 0.3)} recent</span>
          <span style={{ fontSize: 11, color: C.red }}>● {numQs - Math.ceil(numQs * 0.4) - Math.ceil(numQs * 0.3)} misconceptions</span>
        </div>
      </Card>
    </div>
  );
}

/* ─── Topic Selector (grouped by B/C/P with collapsible sections) ─── */
function TopicSelector({ topics, unlocked, toggleT, setUnlocked, cls, userId }) {
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState("");

  // Group topics by prefix: B = Biology, C = Chemistry, P = Physics
  const groups = {};
  topics.forEach(t => {
    const prefix = t.name.charAt(0);
    const label = prefix === 'B' ? 'Biology' : prefix === 'C' ? 'Chemistry' : prefix === 'P' ? 'Physics' : 'Other';
    const icon = prefix === 'B' ? '🧬' : prefix === 'C' ? '⚗️' : prefix === 'P' ? '⚡' : '📚';
    const color = prefix === 'B' ? '#22c55e' : prefix === 'C' ? '#f59e0b' : prefix === 'P' ? '#6366f1' : '#8b95a8';
    if (!groups[label]) groups[label] = { label, icon, color, topics: [] };
    groups[label].topics.push(t);
  });

  // Sub-group by unit number (e.g. B1, B2, C4)
  const getUnit = (name) => {
    const m = name.match(/^([BCP]\d+)/);
    return m ? m[1] : '';
  };

  const filtered = search.trim()
    ? topics.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : null;

  const toggleGroup = (groupTopics) => {
    const allOn = groupTopics.every(t => unlocked.has(t.id));
    groupTopics.forEach(async t => {
      if (allOn && unlocked.has(t.id)) {
        await toggleT(t.id);
      } else if (!allOn && !unlocked.has(t.id)) {
        await toggleT(t.id);
      }
    });
  };

  const renderTopic = (t) => {
    const on = unlocked.has(t.id);
    return (
      <button key={t.id} onClick={() => toggleT(t.id)} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit", fontSize: 13, marginBottom: 3,
        background: on ? C.priSoft : "transparent", border: `1px solid ${on ? "rgba(99,102,241,.2)" : "transparent"}`, color: on ? C.txt : C.mid, transition: "all .15s",
      }}>
        <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? C.pri : C.dim}`, background: on ? C.pri : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{on ? "✓" : ""}</div>
        <span style={{ flex: 1 }}>{t.name}</span>
      </button>
    );
  };

  if (topics.length === 0) return (
    <Card style={{ padding: "40px 20px", textAlign: "center" }}>
      <div style={{ color: C.dim, fontSize: 13 }}>No topics found. Import questions first.</div>
    </Card>
  );

  return (
    <div>
      <Card style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ color: C.txt, fontWeight: 600, fontSize: 14 }}>Unlock Topics</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>Students only see questions from unlocked topics</div>
          </div>
          <Badge color={C.pri}>{unlocked.size}/{topics.length}</Badge>
        </div>
        <Inp placeholder="Search topics..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 13, padding: "10px 12px" }} />
      </Card>

      {/* Search results */}
      {filtered && (
        <Card style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</div>
          {filtered.map(renderTopic)}
        </Card>
      )}

      {/* Grouped view */}
      {!filtered && Object.values(groups).map(g => {
        const isOpen = expanded[g.label] !== false; // default open
        const onCount = g.topics.filter(t => unlocked.has(t.id)).length;
        const allOn = onCount === g.topics.length;

        // Sub-group by unit
        const units = {};
        g.topics.forEach(t => {
          const u = getUnit(t.name);
          if (!units[u]) units[u] = [];
          units[u].push(t);
        });

        return (
          <Card key={g.label} style={{ marginBottom: 10, overflow: "hidden" }}>
            {/* Group header */}
            <button onClick={() => setExpanded(p => ({ ...p, [g.label]: !isOpen }))} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", width: "100%", textAlign: "left", fontFamily: "inherit", cursor: "pointer",
              background: "transparent", border: "none", borderBottom: isOpen ? `1px solid ${C.bdr}` : "none",
            }}>
              <span style={{ fontSize: 18 }}>{g.icon}</span>
              <span style={{ flex: 1, color: C.txt, fontWeight: 700, fontSize: 15 }}>{g.label}</span>
              <span style={{ fontSize: 12, color: onCount > 0 ? g.color : C.dim, fontWeight: 600 }}>{onCount}/{g.topics.length}</span>
              <span style={{ color: C.dim, fontSize: 16, transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
            </button>

            {isOpen && (
              <div style={{ padding: "8px 12px 12px" }}>
                {/* Select all / none for this subject */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <button onClick={() => toggleGroup(g.topics)} style={{
                    padding: "6px 12px", borderRadius: 6, border: `1px solid ${allOn ? "rgba(239,68,68,.3)" : g.color + "44"}`,
                    background: allOn ? C.redS : `${g.color}15`, color: allOn ? C.red : g.color,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {allOn ? "Deselect all" : "Select all"} {g.label.toLowerCase()}
                  </button>
                </div>

                {/* Topics grouped by unit */}
                {Object.entries(units).map(([unitName, unitTopics]) => (
                  <div key={unitName} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, marginTop: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: g.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {unitName === 'B1' ? 'B1 — Cells' : unitName === 'B2' ? 'B2 — Body' : unitName === 'B3' ? 'B3 — Nutrition' : unitName === 'B4' ? 'B4 — Breathing' : unitName === 'B5' ? 'B5 — Reproduction' : unitName === 'B6' ? 'B6 — Plants' : unitName === 'B7' ? 'B7 — Respiration' : unitName === 'B8' ? 'B8 — Ecology' : unitName === 'B9' ? 'B9 — Genetics' : unitName}
                      </div>
                      <div style={{ flex: 1, height: 1, background: C.bdr }} />
                      <span style={{ fontSize: 10, color: C.dim }}>{unitTopics.filter(t => unlocked.has(t.id)).length}/{unitTopics.length}</span>
                    </div>
                    {unitTopics.map(renderTopic)}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ─── Question Manager ─── */
function QMgr({ subjectId, userId, topics, setTopics }) {
  const [nt, setNt] = useState(""); const [tid, setTid] = useState(""); const [qt, setQt] = useState(""); const [qa, setQa] = useState(""); const [mk, setMk] = useState(1);
  const [added, setAdded] = useState(0); const [mode, setMode] = useState("single"); const [bt, setBt] = useState(""); const [imp, setImp] = useState(false);
  const [csvRows, setCsvRows] = useState(null); const [csvErr, setCsvErr] = useState(""); const [csvProgress, setCsvProgress] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const addT = async () => { if (!nt.trim()) return; const [t] = await sb.q("topics", { method: "POST", body: { subject_id: subjectId, name: nt, sort_order: topics.length } }); setTopics(p => [...p, t]); setNt(""); setTid(t.id); };
  const addQ = async () => { if (!qt.trim() || !qa.trim() || !tid) return; await sb.q("questions", { method: "POST", body: { topic_id: tid, question_text: qt, model_answer: qa, marks: mk, difficulty: 1, created_by: userId } }); setAdded(p => p + 1); setQt(""); setQa(""); };
  const bulkAdd = async () => {
    if (!bt.trim() || !tid) return; setImp(true);
    const lines = bt.split("\n").filter(l => l.includes("|")); let n = 0;
    for (const line of lines) { const [q, a] = line.split("|").map(s => s.trim()); if (q && a) { try { await sb.q("questions", { method: "POST", body: { topic_id: tid, question_text: q, model_answer: a, marks: 1, difficulty: 1, created_by: userId } }); n++; } catch {} } }
    setAdded(p => p + n); setBt(""); setImp(false);
  };

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
    // Build lookup map from existing topics (case-insensitive)
    const tMap = {}; topics.forEach(t => { tMap[t.name.toLowerCase()] = t.id; });
    let done = 0;
    for (const row of csvRows) {
      // Use subtopic as the topic name if present, otherwise use topic
      const tName = (row.subtopic || row.topic).trim();
      const key = tName.toLowerCase();
      let topicId = tMap[key];
      if (!topicId) {
        try {
          const [newT] = await sb.q("topics", { method: "POST", body: { subject_id: subjectId, name: tName, sort_order: Object.keys(tMap).length } });
          topicId = newT.id; tMap[key] = topicId;
          setTopics(p => [...p, newT]);
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

  // Unique topics in the CSV preview
  const csvTopicCount = csvRows ? new Set(csvRows.map(r => (r.subtopic || r.topic).toLowerCase())).size : 0;
  const existingNames = new Set(topics.map(t => t.name.toLowerCase()));
  const newTopics = csvRows ? [...new Set(csvRows.map(r => r.subtopic || r.topic))].filter(n => !existingNames.has(n.toLowerCase())) : [];

  return (
    <Card style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>Questions</div>
        {added > 0 && <Badge color={C.grn}>+{added} added</Badge>}
      </div>

      {/* Topic creation — only for Single/Bulk */}
      {mode !== "csv" && <>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Inp placeholder="New topic..." value={nt} onChange={e => setNt(e.target.value)} onKeyDown={e => e.key === "Enter" && addT()} />
          <Btn onClick={addT} style={{ whiteSpace: "nowrap", fontSize: 13 }}>+ Topic</Btn>
        </div>
        <select value={tid} onChange={e => setTid(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.txt, fontSize: 14, marginBottom: 12, outline: "none" }}>
          <option value="">Select topic...</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </>}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <Pill on={mode === "single"} onClick={() => setMode("single")}>Single</Pill>
        <Pill on={mode === "bulk"} onClick={() => setMode("bulk")}>Bulk</Pill>
        <Pill on={mode === "csv"} onClick={() => { setMode("csv"); setCsvRows(null); setCsvErr(""); }}>CSV import</Pill>
      </div>

      {mode === "single" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Inp placeholder="Question" value={qt} onChange={e => setQt(e.target.value)} />
          <Inp placeholder="Model answer" value={qa} onChange={e => setQa(e.target.value)} onKeyDown={e => e.key === "Enter" && addQ()} />
          <Inp type="number" min={1} max={6} value={mk} onChange={e => setMk(parseInt(e.target.value) || 1)} style={{ width: 80 }} />
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

      {mode === "csv" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: C.dim, padding: "8px 12px", background: C.card2, borderRadius: 8, lineHeight: 1.7 }}>
            Required columns: <code style={{ color: C.acc }}>question</code>, <code style={{ color: C.acc }}>answer</code>, <code style={{ color: C.acc }}>topic</code> · Optional: <code style={{ color: C.mid }}>subtopic</code><br />
            Topics are matched by name — new ones are created automatically. If subtopic is present, it's used as the topic name.
          </div>

          {/* Drop zone */}
          {!csvRows && !csvProgress && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? C.pri : C.bdr}`, borderRadius: 10, padding: "32px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? C.priSoft : "transparent", transition: "all .15s" }}
            >
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>📄</div>
              <div style={{ fontSize: 13, color: C.mid, fontWeight: 600 }}>Drop CSV here or tap to browse</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>question, answer, topic, subtopic</div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>
          )}

          {csvErr && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redS, color: C.red, fontSize: 12, fontFamily: "monospace" }}>{csvErr}</div>}

          {/* Preview */}
          {csvRows && !csvProgress && (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ padding: "8px 14px", borderRadius: 8, background: C.grnS, color: C.grn, fontSize: 12, fontWeight: 600 }}>{csvRows.length} questions</div>
                <div style={{ padding: "8px 14px", borderRadius: 8, background: C.priSoft, color: C.pri, fontSize: 12, fontWeight: 600 }}>{csvTopicCount} topics</div>
                {newTopics.length > 0 && <div style={{ padding: "8px 14px", borderRadius: 8, background: C.ambS, color: C.amb, fontSize: 12, fontWeight: 600 }}>{newTopics.length} new topic{newTopics.length !== 1 ? "s" : ""} will be created</div>}
              </div>

              {newTopics.length > 0 && (
                <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: C.card2, fontSize: 11, color: C.dim }}>
                  New: {newTopics.slice(0, 5).join(', ')}{newTopics.length > 5 ? ` +${newTopics.length - 5} more` : ''}
                </div>
              )}

              {/* Preview table */}
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
                {csvRows.length > 5 && (
                  <div style={{ padding: "6px 12px", fontSize: 11, color: C.dim, borderTop: `1px solid ${C.bdr}`, textAlign: "center" }}>+{csvRows.length - 5} more rows</div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={importCSV} disabled={imp} style={{ flex: 1 }}>Import {csvRows.length} questions →</Btn>
                <Btn v="ghost" onClick={() => { setCsvRows(null); setCsvErr(""); }} style={{ fontSize: 12 }}>Cancel</Btn>
              </div>
            </div>
          )}

          {/* Progress */}
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
    </Card>
  );
}

/* ─── APP ─── */
export default function App() {
  const [user, setUser] = useState(null);
  if (!user) return <Auth onAuth={setUser} />;
  const isT = user.profile?.role === "teacher" || user.user_metadata?.role === "teacher";

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'DM Sans',-apple-system,sans-serif", color: C.txt }}>
      <div style={{ borderBottom: `1px solid ${C.bdr}`, background: C.card, padding: "0 16px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -.5 }}>retrieval<span style={{ color: C.pri }}>.</span></span>
            <Badge color={isT ? C.acc : C.pri}>{isT ? "Teacher" : "Student"}</Badge>
          </div>
          <Btn v="ghost" onClick={() => { sb.auth.out(); setUser(null); }} style={{ padding: "6px 12px", fontSize: 12 }}>Log out</Btn>
        </div>
      </div>
      <div style={{ paddingBottom: 60 }}>{isT ? <Teacher user={user} /> : <Student user={user} />}</div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};-webkit-font-smoothing:antialiased}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes starPop{0%{opacity:0;transform:scale(0) rotate(-30deg)}20%{opacity:1;transform:scale(1.5) rotate(10deg)}40%{transform:scale(1.2) rotate(-5deg)}60%{transform:scale(1.3) rotate(3deg)}100%{opacity:0;transform:scale(2) translateY(-40px) rotate(15deg)}}
        button:active{transform:scale(.98)}
        input:focus,textarea:focus,select:focus{border-color:${C.pri}!important;box-shadow:0 0 0 3px ${C.priGlow}}
        ::selection{background:${C.priGlow}}
        select option{background:${C.card};color:${C.txt}}
      `}</style>
    </div>
  );
}
