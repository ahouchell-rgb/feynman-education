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

async function aiMark(qText, model, student, marks, question_id) {
  // Check for fake/spam answers first
  const fake = detectFakeAnswer(student);
  if (fake) return { correct: false, marks_awarded: 0, feedback: fake, flagged: true };

  // Try AI marking via Supabase Edge Function (proxies to Claude API)
  // Sources we accept from the function (in v10): "ai", "ai_double_check_overturned",
  // "ai_double_check_confirmed", "numerical_match", "cache", "fallback".
  // If we don't recognise a source, fall through to local marking — defensive.
  const VALID_SOURCES = new Set([
    "ai", "ai_double_check_overturned", "ai_double_check_confirmed",
    "numerical_match", "cache", "fallback"
  ]);
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/mark-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPA_KEY },
      body: JSON.stringify({ question: qText, model_answer: model, student_answer: student, marks, question_id }),
    });
    if (r.ok) {
      const d = await r.json();
      if (VALID_SOURCES.has(d.source)) return d;
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
  // Too short
  if (trimmed.length <= 2) return "Answer too short — doesn't count towards target.";
  // All same character repeated
  if (/^(.)\1+$/.test(trimmed.replace(/\s/g, ''))) return "Repeated characters detected — doesn't count.";
  // All same word repeated
  const words = trimmed.toLowerCase().split(/\s+/);
  if (words.length >= 3 && new Set(words).size === 1) return "Same word repeated — doesn't count.";
  // No vowels — keyboard mashing
  if (trimmed.length >= 5 && !/[aeiouAEIOU]/.test(trimmed)) return "This doesn't look like a real answer — doesn't count.";
  // "I don't know" and explicit non-attempt phrases
  if (/^(i )?(don'?t|do not|dont) know\.?$/i.test(trimmed)) return "Please attempt the answer — doesn't count towards target.";
  if (/^(idk|dunno|no idea|not sure|unsure|no clue|i have no idea|i dont know|idek)\.?$/i.test(trimmed)) return "Please attempt the answer — doesn't count towards target.";
  if (/^\?+$/.test(trimmed)) return "Please attempt the answer — doesn't count towards target.";
  return null;
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
        // Teacher/HoD/moderator accounts can only be created by a moderator via the admin panel.
        // Public signups always create students.
        const res = await sb.auth.signUp(email, pw, { display_name: name, role: "student" });
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
              <div style={{ fontSize: 11, color: C.dim, padding: "8px 10px", background: C.card2, borderRadius: 8, lineHeight: 1.5 }}>
                Signing up as a student. Teachers — please ask your admin for an account.
              </div>
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
// 50/50 interleave between recent topics (any rank in recencyBoost) and other topics.
// Within each bucket, items are sorted by SM-2 due date (earliest first) with a small
// ±30-min jitter to shuffle ties. A large cooldown penalty shoves questions recently
// answered wrong to the bottom of their bucket for the rest of the session.
// Never-seen questions are treated as due NOW so they compete fairly with past-due items.
// recencyBoost: { topic_id: 1 | 2 | 3 } — rank now only decides bucket membership.
function sortQuestions(questions, srMap, recencyBoost, cooldownSet) {
  const now = Date.now();
  const COOLDOWN_PENALTY = 365 * 86400000;
  const JITTER = 3600000;
  const score = (q) => {
    const sr = srMap[q.id];
    const dueMs = sr ? new Date(sr.due || 0).getTime() : now;
    const jitter = (Math.random() - 0.5) * JITTER;
    const cooldown = cooldownSet && cooldownSet.has(q.id) ? COOLDOWN_PENALTY : 0;
    return dueMs + jitter + cooldown;
  };
  const scored = questions.map(q => ({ q, s: score(q), recent: !!recencyBoost[q.topic_id] }));
  const recent = scored.filter(x => x.recent).sort((a, b) => a.s - b.s).map(x => x.q);
  const other  = scored.filter(x => !x.recent).sort((a, b) => a.s - b.s).map(x => x.q);
  if (recent.length === 0) return other;
  if (other.length === 0) return recent;
  const out = [];
  const maxLen = Math.max(recent.length, other.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < recent.length) out.push(recent[i]);
    if (i < other.length)  out.push(other[i]);
  }
  return out;
}

/* ─── SR status label ─── */
function getSRInfo(srData, isDue) {
  if (!srData || srData.reps === undefined) return { label: "New", color: C.acc, detail: "First time seeing this" };
  if (!isDue) {
    if (srData.reps >= 4) return { label: "Mastered", color: C.grn, detail: `Reviewing every ${srData.iv}d` };
    return { label: "Reviewing", color: C.grn, detail: `${srData.reps} correct in a row` };
  }
  if (srData.reps === 0) return { label: "Needs work", color: C.red, detail: "You got this wrong — try again" };
  return { label: "Due", color: C.amb, detail: `Due every ${srData.iv}d` };
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
  const [statView, setStatView] = useState("allTime"); // "allTime" | "thisWeek"
  const [sessionStats, setSessionStats] = useState({ t: 0, c: 0, topics: [], struggles: [] });
  const [showSummary, setShowSummary] = useState(false);
  const [sessionHitTarget, setSessionHitTarget] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [studyTopicId, setStudyTopicId] = useState(null);
  // Session-level "wrong answer cooldown" — maps questionId -> how many MORE questions must be answered before this one can resurface.
  // Prevents the same wrong question cycling back within seconds. Resets on reload (in-memory only).
  const [cooldown, setCooldown] = useState(new Map());
  const COOLDOWN_LENGTH = 6; // answer 6 other questions before a wrong one can return
  // Session progress counter (resets on class pick or Back)
  const [sessionQCount, setSessionQCount] = useState(0);
  // Per-session target that drives the progress bar — remainder of weekly target, min 5, max 15
  const [sessionTarget, setSessionTarget] = useState(10);
  // Report wrong marking
  const [flagging, setFlagging] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagMsg, setFlagMsg] = useState("");
  const [lastResponseId, setLastResponseId] = useState(null);
  // 7-day habit visual: [{ date, label, count }]
  const [habitDays, setHabitDays] = useState([]);
  // Review mistakes mode: filters qs to those student has recently got wrong
  const [reviewMode, setReviewMode] = useState(false);
  const [mistakeQIds, setMistakeQIds] = useState(new Set()); // recent wrong qids for review mode
  // Session-intro framing: show a "here's your session" card before first question
  const [sessionStarted, setSessionStarted] = useState(false);
  // Voice input state (Web Speech API)
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const recognitionRef = useRef(null);
  const ansBaseRef = useRef("");

  useEffect(() => { load(); }, []);

  // Initialise Web Speech API once per mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setSpeechSupported(true);
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    rec.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const base = ansBaseRef.current;
      setAns(((base && base.trim()) ? base.trim() + " " : "") + transcript.trim());
    };
    rec.onend = () => setIsRecording(false);
    rec.onerror = (e) => {
      const msg = e?.error === "not-allowed" ? "Mic access blocked — enable it in browser settings"
                : e?.error === "no-speech" ? "Didn't hear anything — try again"
                : e?.error === "network" ? "Network issue with speech recognition"
                : "Couldn't transcribe — try typing";
      setSpeechError(msg);
      setIsRecording(false);
      setTimeout(() => setSpeechError(""), 3500);
    };
    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch { /* no-op */ } };
  }, []);

  const toggleMic = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (isRecording) {
      try { rec.stop(); } catch { /* no-op */ }
      setIsRecording(false);
    } else {
      ansBaseRef.current = ans;
      setSpeechError("");
      try { rec.start(); setIsRecording(true); }
      catch (e) { console.warn("speech start failed", e); }
    }
  };

  const stopMicIfActive = () => {
    if (isRecording && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* no-op */ }
      setIsRecording(false);
    }
  };

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
    setSessionStats({ t: 0, c: 0, topics: [], struggles: [] });
    setShowSummary(false);
    setSessionHitTarget(false);
    setStudyMode(false);
    setStudyTopicId(null);
    setSessionQCount(0);
    setFlagMsg("");
    try {
      const ul = await sb.q("class_topics", { params: { class_id: `eq.${c.id}`, select: "topic_id,recency_rank" } });
      if (!ul.length) { setQs([]); return; }
      const tids = ul.map(t => t.topic_id);

      // Build recency boost map: topicId → rank (1=most recent, 2, 3)
      const recencyBoost = {};
      ul.forEach(t => { if (t.recency_rank) recencyBoost[t.topic_id] = t.recency_rank; });
      setRecency(recencyBoost);

      const questions = await sb.q("questions", { params: { topic_id: `in.(${tids.join(",")})`, archived: "eq.false", select: "*,topics(name)" } });
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

      setQs(sortQuestions(questions, srMap, recencyBoost, new Set()));
      setQi(0); setAns(""); setRes(null);
      setStats({ t: resps.length, c: resps.filter(r => r.is_correct).length });

      const thisWeek = getWeekBounds(0);
      const thisWeekResps = resps.filter(r => { const d = new Date(r.answered_at); return d >= thisWeek.start && d <= thisWeek.end; });
      const validThisWeek = thisWeekResps.filter(r => !detectFakeAnswer(r.student_answer)).length;
      setWeeklyValid(validThisWeek);
      // Session target: how many questions to aim for in this session — remainder of weekly target, clamped 5-15
      const remaining = Math.max(0, WEEKLY_TARGET - validThisWeek);
      setSessionTarget(Math.max(5, Math.min(15, remaining || 10)));

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

      // 7-day habit — count valid responses per day, today on right
      const days = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i); d.setHours(0,0,0,0);
        const end = new Date(d); end.setHours(23,59,59,999);
        const dayResps = resps.filter(r => { const rd = new Date(r.answered_at); return rd >= d && rd <= end; });
        const count = dayResps.filter(r => !detectFakeAnswer(r.student_answer)).length;
        const label = i === 0 ? "Today" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
        days.push({ date: d.toISOString(), label, count });
      }
      setHabitDays(days);

      // Identify recent mistakes for review mode — use most-recent response per question, keep the wrongs
      const latestByQ = {};
      resps.forEach(r => { if (!latestByQ[r.question_id]) latestByQ[r.question_id] = r; });
      const mistakes = new Set(Object.values(latestByQ).filter(r => !r.is_correct && !detectFakeAnswer(r.student_answer)).map(r => r.question_id));
      setMistakeQIds(mistakes);

      // Session starts at intro screen
      setSessionStarted(false);
      setReviewMode(false);
    } catch (e) { console.error(e); }
  };

  const submit = async () => {
    if (!ans.trim() || marking) return;
    stopMicIfActive();
    setMarking(true);
    const activeQs = reviewMode
      ? qs.filter(q => mistakeQIds.has(q.id))
      : (studyMode && studyTopicId ? qs.filter(q => q.topic_id === studyTopicId) : qs);
    const q = activeQs[qi];
    const r = await aiMark(q.question_text, q.model_answer, ans, q.marks, q.id);
    setRes(r);
    const prev = sr[q.id] || {};
    const nxt = nextSR(r.correct, prev);
    setSr(s => ({ ...s, [q.id]: nxt }));
    if (r.correct) setStreak(s => s + 1); else setStreak(0);
    // If wrong (and not a flagged low-effort attempt), put it on cooldown for the session
    if (!r.correct && !r.flagged) {
      setCooldown(prev => { const n = new Map(prev); n.set(q.id, COOLDOWN_LENGTH); return n; });
    }

    const isFlagged = r.flagged;
    if (!isFlagged) {
      const newValid = weeklyValid + 1;
      setWeeklyValid(newValid);
      // Track session
      const topicName = q.topics?.name || "Unknown";
      setSessionStats(prev => ({
        t: prev.t + 1,
        c: prev.c + (r.correct ? 1 : 0),
        topics: prev.topics.includes(topicName) ? prev.topics : [...prev.topics, topicName],
        struggles: !r.correct && !r.flagged
          ? [...prev.struggles, { question: q.question_text, studentAnswer: ans, modelAnswer: q.model_answer, topic: topicName }]
          : prev.struggles,
      }));
      // Star milestone
      const overTarget = newValid - WEEKLY_TARGET;
      if (overTarget > 0 && overTarget % STAR_INTERVAL === 0) {
        setStarPop(true);
        setTimeout(() => setStarPop(false), 2000);
      }
      // Show summary when target first hit this session
      if (newValid === WEEKLY_TARGET && !sessionHitTarget) {
        setSessionHitTarget(true);
        setTimeout(() => setShowSummary(true), 600); // brief delay so student sees the correct/wrong result
      }
    }

    try {
      const respRows = await sb.q("responses", { method: "POST", body: { student_id: user.id, question_id: q.id, class_id: cls.id, student_answer: ans, is_correct: r.correct, ai_feedback: r.flagged ? "FLAGGED: " + r.feedback : r.feedback, marks_awarded: r.marks_awarded } });
      if (Array.isArray(respRows) && respRows[0]?.id) setLastResponseId(respRows[0].id);
      setStats(s => ({ t: s.t + 1, c: s.c + (r.correct ? 1 : 0) }));
      setSessionQCount(n => n + 1);
    } catch (e) { console.error(e); }
    setMarking(false);
  };

  const next = () => {
    stopMicIfActive();
    // Tick down all cooldowns by 1; drop any that hit zero
    const nextCooldown = new Map();
    cooldown.forEach((remaining, qid) => { if (remaining > 1) nextCooldown.set(qid, remaining - 1); });
    setCooldown(nextCooldown);
    setQs(sortQuestions(qs, sr, recency, new Set(nextCooldown.keys())));
    setQi(0); setAns(""); setRes(null);
    setFlagging(false); setFlagReason(""); setFlagMsg(""); setLastResponseId(null);
  };

  // Submit a marking flag (student reports wrong AI mark)
  const submitFlag = async () => {
    if (!lastResponseId) return;
    setFlagBusy(true); setFlagMsg("");
    try {
      const activeQs = reviewMode
        ? qs.filter(qq => mistakeQIds.has(qq.id))
        : (studyMode && studyTopicId ? qs.filter(qq => qq.topic_id === studyTopicId) : qs);
      const q = activeQs[qi];
      await sb.q("marking_flags", { method: "POST", body: {
        response_id: lastResponseId,
        student_id: user.id,
        class_id: cls.id,
        question_id: q.id,
        student_answer: ans,
        ai_feedback: res?.feedback || "",
        ai_correct: !!res?.correct,
        student_reason: flagReason.trim() || null,
      }});
      setFlagMsg("Thanks — your teacher will review this.");
      setFlagging(false); setFlagReason("");
    } catch (e) { setFlagMsg("Error: " + e.message); }
    setFlagBusy(false);
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
  const activeQs = reviewMode
    ? qs.filter(qq => mistakeQIds.has(qq.id))
    : (studyMode && studyTopicId ? qs.filter(qq => qq.topic_id === studyTopicId) : qs);
  const q = activeQs[qi];
  // Derived session breakdown for the intro screen
  const introBreakdown = (() => {
    const upcoming = activeQs.slice(0, sessionTarget);
    let fresh = 0, review = 0;
    upcoming.forEach(uq => {
      const st = sr[uq.id];
      if (!st || !st.reps) fresh++; else review++;
    });
    return { fresh, review, total: upcoming.length };
  })();
  const estimatedMinutes = Math.max(1, Math.round(introBreakdown.total * 0.7));
  const acc = stats.t > 0 ? Math.round(stats.c / stats.t * 100) : 0;
  const isDue = !sr[q?.id] || !sr[q?.id]?.due || new Date(sr[q?.id].due) <= new Date();
  const weekPct = Math.min(100, Math.round((weeklyValid / WEEKLY_TARGET) * 100));
  const overTarget = Math.max(0, weeklyValid - WEEKLY_TARGET);
  const currentStars = Math.floor(overTarget / STAR_INTERVAL);
  // Topics available for study mode (derived from all questions)
  const studyTopics = [...new Map(qs.map(q => [q.topic_id, q.topics?.name || "Unknown"])).entries()]
    .map(([id, name]) => ({ id, name, count: qs.filter(qq => qq.topic_id === id).length }))
    .sort((a, b) => a.name.localeCompare(b.name));

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
          {sessionStats.t > 0 && <button onClick={() => setShowSummary(true)} style={{ background: "none", border: `1px solid ${C.bdr}`, borderRadius: 8, color: C.dim, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}>📊 {sessionStats.t}</button>}
          <button onClick={() => { setStudyMode(p => !p); setStudyTopicId(null); setReviewMode(false); setRes(null); setAns(""); }} style={{ background: studyMode ? C.priSoft : "none", border: `1px solid ${studyMode ? C.pri : C.bdr}`, borderRadius: 8, color: studyMode ? C.pri : C.dim, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "4px 8px", fontWeight: studyMode ? 700 : 400 }}>📖 Study</button>
          {mistakeQIds.size > 0 && (
            <button onClick={() => {
                const turningOn = !reviewMode;
                setReviewMode(turningOn);
                setStudyMode(false); setStudyTopicId(null);
                setRes(null); setAns(""); setQi(0);
                // In review mode the target matches the number of mistakes (capped at 10)
                if (turningOn) setSessionTarget(Math.min(10, mistakeQIds.size));
                else setSessionTarget(Math.max(5, Math.min(15, Math.max(0, WEEKLY_TARGET - weeklyValid) || 10)));
                setSessionStarted(false); setSessionQCount(0);
              }}
              style={{ background: reviewMode ? C.redS : "none", border: `1px solid ${reviewMode ? C.red : C.bdr}`, borderRadius: 8, color: reviewMode ? C.red : C.dim, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "4px 8px", fontWeight: reviewMode ? 700 : 400 }}>
              🔁 Review ({mistakeQIds.size})
            </button>
          )}
          <Badge color={C.pri}>{cls.name}</Badge>
        </div>
      </div>

      {/* Study mode topic picker */}
      {studyMode && (
        <Card style={{ padding: 14, marginBottom: 12, borderColor: "rgba(99,102,241,0.3)", background: C.priSoft }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.pri, marginBottom: 10 }}>
            📖 Study mode — pick a topic. Answers still count toward your weekly target.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {studyTopics.map(t => (
              <button key={t.id} onClick={() => { setStudyTopicId(t.id); setQi(0); setRes(null); setAns(""); }}
                style={{ padding: "6px 12px", borderRadius: 99, border: `1px solid ${studyTopicId === t.id ? C.pri : C.bdr}`, background: studyTopicId === t.id ? C.pri : "transparent", color: studyTopicId === t.id ? "#fff" : C.mid, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: studyTopicId === t.id ? 600 : 400 }}>
                {t.name} <span style={{ opacity: 0.6 }}>({t.count})</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 7-day habit strip */}
      {habitDays.length > 0 && (
        <Card style={{ padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>Last 7 days</div>
            <div style={{ fontSize: 10, color: C.dim }}>{habitDays.filter(d => d.count > 0).length} of 7 active</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {habitDays.map((d, i) => {
              const isToday = i === habitDays.length - 1;
              let col = C.bdr;
              if (d.count >= 10) col = C.grn;
              else if (d.count >= 5) col = C.amb;
              else if (d.count > 0) col = C.red;
              return (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div title={`${d.label}: ${d.count} answered`} style={{ height: 22, background: col, borderRadius: 5, border: isToday ? `2px solid ${C.pri}` : "none", opacity: d.count === 0 && !isToday ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: d.count > 0 ? "#fff" : C.dim, fontWeight: 600 }}>
                    {d.count > 0 ? d.count : ""}
                  </div>
                  <div style={{ fontSize: 9, color: isToday ? C.pri : C.dim, marginTop: 2, fontWeight: isToday ? 700 : 400 }}>{d.label.slice(0, 3)}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
        {sessionQCount > 0 && (
          <button onClick={() => setShowSummary(true)} style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.bdr}`, background: "transparent", color: C.mid, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
            Finish session — see summary ({sessionQCount} answered)
          </button>
        )}

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

      {(() => {
        const tw = weeklyData[0];
        const isWeek = statView === "thisWeek";
        const t = isWeek ? (tw?.total || 0) : stats.t;
        const c = isWeek ? (tw?.correct || 0) : stats.c;
        const pct = t > 0 ? Math.round(c / t * 100) : 0;
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, justifyContent: "flex-end" }}>
              <Pill on={statView === "allTime"} onClick={() => setStatView("allTime")} style={{ fontSize: 11, padding: "4px 10px" }}>All time</Pill>
              <Pill on={statView === "thisWeek"} onClick={() => setStatView("thisWeek")} style={{ fontSize: 11, padding: "4px 10px" }}>This week</Pill>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Stat label="Done" value={t} color={C.acc} />
              <Stat label="Correct" value={c} color={C.grn} />
              <Stat label="Accuracy" value={`${pct}%`} color={pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red} />
            </div>
          </div>
        );
      })()}

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

      {activeQs.length === 0 && studyMode ? (
        <Card style={{ padding: "36px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{studyTopicId ? "✅" : "👆"}</div>
          <div style={{ color: C.mid, fontSize: 14, fontWeight: 600 }}>
            {studyTopicId ? "All caught up on this topic" : "Pick a topic above to start studying"}
          </div>
          {studyTopicId && <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>All questions in this topic are mastered or not yet due</div>}
        </Card>
      ) : qs.length === 0 ? (
        <Card style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
          <div style={{ color: C.mid }}>No questions available yet</div>
          <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>Your teacher hasn't unlocked any topics</div>
        </Card>
      ) : showSummary ? (
        /* ── Session summary ── */
        <Card style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{weeklyValid >= WEEKLY_TARGET ? "🎉" : "📊"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.txt, letterSpacing: -0.5, marginBottom: 4 }}>
            {weeklyValid >= WEEKLY_TARGET ? "Target hit!" : "Session complete"}
          </div>
          <div style={{ fontSize: 13, color: C.dim, marginBottom: 24 }}>
            {weeklyValid >= WEEKLY_TARGET ? `${weeklyValid}/${WEEKLY_TARGET} questions done this week` : `${weeklyValid}/${WEEKLY_TARGET} questions done this week — keep going!`}
          </div>

          {/* Session stats */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: "14px 10px", borderRadius: 12, background: C.card2 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.acc }}>{sessionStats.t}</div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 }}>This session</div>
            </div>
            <div style={{ flex: 1, padding: "14px 10px", borderRadius: 12, background: C.card2 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.grn }}>{sessionStats.c}</div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 }}>Correct</div>
            </div>
            <div style={{ flex: 1, padding: "14px 10px", borderRadius: 12, background: C.card2 }}>
              {(() => { const p = sessionStats.t > 0 ? Math.round(sessionStats.c / sessionStats.t * 100) : 0; return <>
                <div style={{ fontSize: 26, fontWeight: 800, color: p >= 70 ? C.grn : p >= 50 ? C.amb : C.red }}>{p}%</div>
                <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 }}>Accuracy</div>
              </>; })()}
            </div>
          </div>

          {/* Topics covered */}
          {sessionStats.topics.length > 0 && (
            <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: C.card2, textAlign: "left" }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Topics covered</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sessionStats.topics.map((t, i) => (
                  <span key={i} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 99, background: C.priSoft, color: C.pri, fontWeight: 500 }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {sessionStats.struggles.length > 0 && (
            <div style={{ marginBottom: 20, textAlign: "left" }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
                Questions to revisit ({sessionStats.struggles.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sessionStats.struggles.map((s, i) => (
                  <div key={i} style={{ borderRadius: 10, border: `1px solid rgba(239,68,68,0.2)`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", background: C.redS }}>
                      <div style={{ fontSize: 11, color: C.dim, marginBottom: 3 }}>{s.topic}</div>
                      <div style={{ fontSize: 13, color: C.txt, fontWeight: 500, lineHeight: 1.4 }}>{s.question}</div>
                    </div>
                    <div style={{ padding: "8px 12px", background: C.card2 }}>
                      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>You wrote</div>
                      <div style={{ fontSize: 12, color: C.mid, marginBottom: 8, fontStyle: "italic" }}>"{s.studentAnswer}"</div>
                      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>Correct answer</div>
                      <div style={{ fontSize: 12, color: C.grn, fontWeight: 500, lineHeight: 1.4 }}>{s.modelAnswer}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {weeklyValid < WEEKLY_TARGET && (
              <Btn onClick={() => setShowSummary(false)} style={{ width: "100%", padding: "14px 20px" }}>
                Keep going →
              </Btn>
            )}
            {weeklyValid >= WEEKLY_TARGET && (
              <Btn onClick={() => setShowSummary(false)} style={{ width: "100%", padding: "14px 20px" }}>
                Keep going — every extra question counts ⭐
              </Btn>
            )}
            <Btn v="ghost" onClick={() => setCls(null)} style={{ width: "100%", fontSize: 13 }}>
              Back to classes
            </Btn>
          </div>
        </Card>
      ) : reviewMode && activeQs.length === 0 ? (
        <Card style={{ padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.txt, marginBottom: 4 }}>No mistakes to review</div>
          <div style={{ fontSize: 13, color: C.mid, marginBottom: 20 }}>You're up to date. Back to normal practice?</div>
          <Btn onClick={() => { setReviewMode(false); setSessionStarted(false); }} style={{ width: "100%" }}>← Back to practice</Btn>
        </Card>
      ) : !sessionStarted ? (
        /* ── Session intro ── */
        <Card style={{ padding: "24px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>{reviewMode ? "🔁" : studyMode ? "📖" : "🧠"}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.txt, letterSpacing: -0.3, marginBottom: 4 }}>
            {reviewMode ? "Review your mistakes" : studyMode ? "Study mode" : "Ready to practise?"}
          </div>
          <div style={{ fontSize: 13, color: C.mid, marginBottom: 18 }}>
            {reviewMode ? `${mistakeQIds.size} question${mistakeQIds.size === 1 ? "" : "s"} you recently got wrong` :
             studyMode && !studyTopicId ? "Pick a topic above to begin" :
             weeklyValid >= WEEKLY_TARGET ? `You've already hit this week's target — every extra question earns a ⭐` :
             `${Math.max(0, WEEKLY_TARGET - weeklyValid)} to go this week`}
          </div>

          {activeQs.length > 0 && (!studyMode || studyTopicId) && (
            <>
              {/* Session breakdown */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <div style={{ flex: 1, padding: "12px 10px", borderRadius: 10, background: C.card2 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.pri }}>{introBreakdown.total}</div>
                  <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>Questions</div>
                </div>
                {!reviewMode && (
                  <>
                    <div style={{ flex: 1, padding: "12px 10px", borderRadius: 10, background: C.card2 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.acc }}>{introBreakdown.fresh}</div>
                      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>New</div>
                    </div>
                    <div style={{ flex: 1, padding: "12px 10px", borderRadius: 10, background: C.card2 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.amb }}>{introBreakdown.review}</div>
                      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>Review</div>
                    </div>
                  </>
                )}
                <div style={{ flex: 1, padding: "12px 10px", borderRadius: 10, background: C.card2 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.mid }}>~{estimatedMinutes}</div>
                  <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>Min</div>
                </div>
              </div>

              <Btn onClick={() => setSessionStarted(true)} style={{ width: "100%", padding: "14px 20px" }}>
                {reviewMode ? "Start review →" : "Start session →"}
              </Btn>
              {!reviewMode && (
                <div style={{ fontSize: 11, color: C.dim, marginTop: 10 }}>You can finish early whenever you want</div>
              )}
            </>
          )}
        </Card>
      ) : (
        <Card style={{ overflow: "hidden" }}>
          {(() => {
            const srData = sr[q?.id];
            const srInfo = getSRInfo(srData, isDue);
            const sessionPct = Math.min(100, Math.round((sessionQCount / sessionTarget) * 100));
            return (
              <>
                <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Badge color={C.acc}>{q?.topics?.name}</Badge>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: srInfo.color, padding: "2px 8px", borderRadius: 99, background: `${srInfo.color}18` }}>{srInfo.label}</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{srInfo.detail}</div>
                    </div>
                    <span style={{ fontSize: 12, color: C.dim }}>{q?.marks}mk</span>
                  </div>
                </div>
                {/* Session progress */}
                <div style={{ padding: "0 16px 10px", borderBottom: `1px solid ${C.bdr}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      Session · Q{Math.min(sessionQCount + 1, sessionTarget)} of {sessionTarget}
                    </span>
                    <span style={{ fontSize: 10, color: C.dim }}>{sessionPct}%</span>
                  </div>
                  <div style={{ width: "100%", height: 4, background: C.bdr, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${sessionPct}%`, height: "100%", background: sessionPct >= 100 ? C.grn : C.pri, borderRadius: 99, transition: "width .3s ease" }} />
                  </div>
                </div>
              </>
            );
          })()}
          <div style={{ padding: "20px 16px" }}>
            {q?.image_url && (
              <div style={{ marginBottom: 14, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.bdr}`, background: "#fff" }}>
                <img src={q.image_url} alt="question diagram" style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block" }} />
              </div>
            )}
            <div style={{ fontSize: 16, color: C.txt, lineHeight: 1.55, marginBottom: 20, fontWeight: 500 }}>{q?.question_text}</div>
            {!res ? (
              <>
                <div style={{ position: "relative" }}>
                  <TA value={ans} onChange={e => setAns(e.target.value)} placeholder={isRecording ? "Listening… speak naturally" : "Type your answer… or tap the mic"} rows={3} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} style={{ paddingRight: speechSupported ? 52 : undefined }} />
                  {speechSupported && (
                    <button type="button" onClick={toggleMic} aria-label={isRecording ? "Stop recording" : "Start voice input"}
                      style={{ position: "absolute", right: 10, bottom: 10, width: 36, height: 36, borderRadius: 99, border: `1px solid ${isRecording ? C.red : C.bdr}`, background: isRecording ? C.red : C.card, color: isRecording ? "#fff" : C.mid, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, padding: 0, boxShadow: isRecording ? `0 0 0 4px ${C.redS}` : "none", transition: "all .15s ease" }}>
                      {isRecording ? "■" : "🎤"}
                    </button>
                  )}
                </div>
                {isRecording && <div style={{ fontSize: 11, color: C.red, marginTop: 6, textAlign: "center", fontWeight: 500 }}>● Recording — tap mic again to stop</div>}
                {speechError && <div style={{ fontSize: 11, color: C.red, marginTop: 6, textAlign: "center" }}>{speechError}</div>}
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
                {flagMsg ? (
                  <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: flagMsg.startsWith("Error") ? C.redS : C.grnS, color: flagMsg.startsWith("Error") ? C.red : C.grn, fontSize: 12, textAlign: "center" }}>{flagMsg}</div>
                ) : !flagging ? (
                  <button onClick={() => { setFlagging(true); setFlagReason(""); }} style={{ marginTop: 10, width: "100%", background: "transparent", border: "none", color: C.dim, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 4 }}>
                    Something wrong with this mark? Tell your teacher
                  </button>
                ) : (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: C.card2, border: `1px solid ${C.bdr}` }}>
                    <div style={{ fontSize: 12, color: C.mid, marginBottom: 6, fontWeight: 600 }}>Report wrong marking</div>
                    <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>Your teacher will review this. Your mark won't change automatically.</div>
                    <TA value={flagReason} onChange={e => setFlagReason(e.target.value)} rows={2} maxLength={300} placeholder="What's wrong? (optional)" style={{ fontSize: 13 }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <Btn onClick={submitFlag} disabled={flagBusy} style={{ flex: 1, fontSize: 12, padding: "8px 12px" }}>{flagBusy ? "..." : "Send"}</Btn>
                      <Btn v="ghost" onClick={() => { setFlagging(false); setFlagReason(""); }} disabled={flagBusy} style={{ fontSize: 12, padding: "8px 12px" }}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── ADMIN PANEL (moderator only) ─── */
function AdminPanel({ user }) {
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classMembers, setClassMembers] = useState([]);
  const [responses30d, setResponses30d] = useState([]);
  // AI usage logging — populated lazily when the "AI usage" tab is opened
  const [aiUsage, setAiUsage] = useState(null); // null = not loaded, [] = loaded empty
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [aiUsageWindow, setAiUsageWindow] = useState(7); // days
  // Cache health view
  const [cacheRows, setCacheRows] = useState(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cachePurging, setCachePurging] = useState(null); // id being purged
  // Cost estimate: ~150 input tokens + ~80 output tokens per AI mark at Haiku 4.5 pricing
  // ($1/1M in + $5/1M out) = ~$0.00055/answer. ~25% of answers skip the AI via the
  // numerical exemption shortcut, so effective cost is ~$0.00041/answer.
  // Converted to pence at ~0.79 GBP/USD ≈ 0.033p/answer.
  const COST_PER_AI_MARK_PENCE = 0.055 * 0.79;      // ≈ 0.043p before exemptions
  const EXEMPTION_RATE = 0.25;                        // empirical: ~25% are pure-number answers
  const EFFECTIVE_COST_PER_ANSWER_PENCE = COST_PER_AI_MARK_PENCE * (1 - EXEMPTION_RATE); // ≈ 0.033p
  const [filter, setFilter] = useState("");
  const [view, setView] = useState("overview"); // overview | teachers | students | unjoined
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pwDraft, setPwDraft] = useState("");
  const [addClassId, setAddClassId] = useState(""); // selected class in the student's "Add to class" dropdown
  const [showCreateTeacher, setShowCreateTeacher] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ email: "", display_name: "", password: "" });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Pull only responses from the last ~31 days; we only need answered_at + class_id for costs.
      const cutoff = new Date(Date.now() - 31 * 86400000).toISOString();
      const [profs, clss, mems, resps] = await Promise.all([
        sb.q("profiles", { params: { select: "*", order: "created_at.desc" } }),
        sb.q("classes", { params: { select: "*,profiles!classes_teacher_id_fkey(display_name,email)", order: "created_at.desc" } }),
        sb.q("class_members", { params: { select: "class_id,student_id" } }),
        sb.q("responses", { params: { select: "class_id,answered_at", answered_at: `gte.${cutoff}`, order: "answered_at.desc", limit: "10000" } }),
      ]);
      setTeachers(profs.filter(p => p.role === "teacher" || p.role === "moderator" || p.role === "hod"));
      setStudents(profs.filter(p => p.role === "student"));
      setClasses(clss);
      setClassMembers(mems);
      setResponses30d(resps || []);
    } catch (e) { console.error(e); setMsg("Error loading: " + e.message); }
    setLoading(false);
  };

  const callManage = async (action, studentId, extra = {}) => {
    setBusy(true); setMsg("");
    try {
      const jwt = sb.auth.getToken();
      const r = await fetch(`${SUPA_URL}/functions/v1/manage-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${jwt || SUPA_KEY}` },
        body: JSON.stringify({ action, student_id: studentId, ...extra }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg("✓ " + d.message);
        await loadAll();
        if (action === "delete_student") setExpandedStudent(null);
      } else {
        setMsg("Error: " + (d.error || "Unknown error"));
      }
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const studentClassMap = {};
  classMembers.forEach(m => {
    if (!studentClassMap[m.student_id]) studentClassMap[m.student_id] = [];
    studentClassMap[m.student_id].push(m.class_id);
  });
  const classById = Object.fromEntries(classes.map(c => [c.id, c]));
  const unjoinedStudents = students.filter(s => !studentClassMap[s.id] || studentClassMap[s.id].length === 0);

  const studentsForTeacher = (teacherId) => {
    const tClassIds = new Set(classes.filter(c => c.teacher_id === teacherId).map(c => c.id));
    return students.filter(s => (studentClassMap[s.id] || []).some(cid => tClassIds.has(cid)));
  };

  const filteredStudents = students.filter(s => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (s.display_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
  });
  const filteredTeachers = teachers.filter(t => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (t.display_name || "").toLowerCase().includes(q) || (t.email || "").toLowerCase().includes(q);
  });

  if (loading) return <div style={{ maxWidth: 700, margin: "0 auto", padding: 40, textAlign: "center", color: C.mid }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 16, padding: "16px 20px", background: `linear-gradient(135deg, ${C.priSoft}, transparent)`, border: `1px solid ${C.pri}33`, borderRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, marginBottom: 4 }}>⚙ Moderator panel</div>
        <div style={{ fontSize: 12, color: C.mid }}>You can see every teacher and student across retrieval. Only ahouchell@gmail.com has this access.</div>
      </div>

      {/* Overview stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        <StatTile label="Teachers" value={teachers.length} onClick={() => setView("teachers")} active={view === "teachers"} />
        <StatTile label="Students" value={students.length} onClick={() => setView("students")} active={view === "students"} />
        <StatTile label="Classes" value={classes.length} />
        <StatTile label="Unjoined" value={unjoinedStudents.length} onClick={() => setView("unjoined")} active={view === "unjoined"} color={unjoinedStudents.length > 0 ? C.red : C.mid} />
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {[{ k: "overview", l: "Overview" }, { k: "teachers", l: "All teachers" }, { k: "students", l: "All students" }, { k: "unjoined", l: `Unjoined${unjoinedStudents.length > 0 ? ` (${unjoinedStudents.length})` : ""}` }, { k: "costs", l: "Costs" }, { k: "aiusage", l: "AI usage" }, { k: "cache", l: "Cache health" }].map(t => (
          <Pill key={t.k} on={view === t.k} onClick={() => setView(t.k)} style={{ fontSize: 12, padding: "6px 12px" }}>{t.l}</Pill>
        ))}
      </div>

      {msg && <div style={{ padding: "8px 12px", borderRadius: 8, background: msg.startsWith("Error") ? C.redS : C.priSoft, color: msg.startsWith("Error") ? C.red : C.pri, fontSize: 12, marginBottom: 12 }}>{msg}</div>}

      {/* Create teacher */}
      <div style={{ marginBottom: 16 }}>
        {!showCreateTeacher ? (
          <Btn v="ghost" onClick={() => { setShowCreateTeacher(true); setMsg(""); }} style={{ width: "100%", fontSize: 12, padding: "10px" }}>+ Create teacher account</Btn>
        ) : (
          <div style={{ padding: 14, background: C.card, border: `1px solid ${C.pri}33`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginBottom: 10 }}>Create teacher account</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              <Inp placeholder="Full name" value={newTeacher.display_name} onChange={e => setNewTeacher(p => ({ ...p, display_name: e.target.value }))} style={{ fontSize: 13, padding: "8px 10px" }} />
              <Inp placeholder="Email" type="email" value={newTeacher.email} onChange={e => setNewTeacher(p => ({ ...p, email: e.target.value }))} style={{ fontSize: 13, padding: "8px 10px" }} />
              <Inp placeholder="Temporary password (min 6)" type="text" value={newTeacher.password} onChange={e => setNewTeacher(p => ({ ...p, password: e.target.value }))} style={{ fontSize: 13, padding: "8px 10px" }} />
            </div>
            <div style={{ fontSize: 11, color: C.mid, marginBottom: 10 }}>They can log in immediately and change the password in their own settings. Only tell them the password in person or through a trusted channel.</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn onClick={async () => {
                  const { email, display_name, password } = newTeacher;
                  if (!email.trim() || !display_name.trim() || !password.trim()) { setMsg("Error: all fields required"); return; }
                  if (password.length < 6) { setMsg("Error: password must be at least 6 characters"); return; }
                  setBusy(true); setMsg("");
                  try {
                    const jwt = sb.auth.getToken();
                    const r = await fetch(`${SUPA_URL}/functions/v1/manage-student`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${jwt || SUPA_KEY}` },
                      body: JSON.stringify({ action: "create_teacher", new_email: email, new_display_name: display_name, new_password: password }),
                    });
                    const d = await r.json();
                    if (d.success) {
                      setMsg(`✓ Teacher account created. Tell ${display_name} to log in with ${email} and change password.`);
                      setNewTeacher({ email: "", display_name: "", password: "" });
                      setShowCreateTeacher(false);
                      await loadAll();
                    } else {
                      setMsg("Error: " + (d.error || "Unknown"));
                    }
                  } catch (e) { setMsg("Error: " + e.message); }
                  setBusy(false);
                }} disabled={busy} style={{ flex: 1, fontSize: 12 }}>{busy ? "Creating..." : "Create account"}</Btn>
              <Btn v="ghost" onClick={() => { setShowCreateTeacher(false); setMsg(""); }} disabled={busy} style={{ fontSize: 12 }}>Cancel</Btn>
            </div>
          </div>
        )}
      </div>

      {/* Overview */}
      {view === "overview" && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.mid, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Teachers at a glance</div>
          {teachers.map(t => {
            const tClasses = classes.filter(c => c.teacher_id === t.id);
            const tStudents = studentsForTeacher(t.id);
            return (
              <div key={t.id} style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.txt, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>{t.display_name || "—"}</span>
                      {t.role === "moderator" && <Badge color={C.pri} style={{ fontSize: 9 }}>MOD</Badge>}
                      {t.role === "hod" && <Badge color={C.amb} style={{ fontSize: 9 }}>HoD</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: C.mid, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.email}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: C.mid }}>
                    <div>{tClasses.length} class{tClasses.length === 1 ? "" : "es"}</div>
                    <div>{tStudents.length} student{tStudents.length === 1 ? "" : "s"}</div>
                  </div>
                </div>
                {tClasses.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                    {tClasses.map(c => <Badge key={c.id} color={C.mid} style={{ fontSize: 10 }}>{c.name}</Badge>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Teachers list with search */}
      {view === "teachers" && (
        <div>
          <Inp placeholder="Search teachers by name or email" value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom: 10 }} />
          {filteredTeachers.map(t => {
            const tClasses = classes.filter(c => c.teacher_id === t.id);
            const isHoD = t.role === "hod";
            const isMod = t.role === "moderator";
            const teamCount = teachers.filter(x => x.hod_id === t.id).length;
            const assignedHoD = t.hod_id ? teachers.find(h => h.id === t.hod_id) : null;
            const hods = teachers.filter(x => x.role === "hod");
            return (
              <div key={t.id} style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {t.display_name || "—"}
                      {isMod && <Badge color={C.pri} style={{ fontSize: 9 }}>MOD</Badge>}
                      {isHoD && <Badge color={C.amb} style={{ fontSize: 9 }}>HoD · {teamCount}</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: C.mid, fontFamily: "monospace" }}>{t.email}</div>
                  </div>
                  <Btn v="ghost" onClick={() => { navigator.clipboard.writeText(t.email || ""); setMsg("Email copied"); setTimeout(() => setMsg(""), 1500); }} style={{ fontSize: 11, padding: "6px 10px" }}>Copy email</Btn>
                </div>
                {tClasses.length > 0 && (
                  <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>
                    Classes: {tClasses.map(c => c.name).join(", ")}
                  </div>
                )}

                {/* HoD controls (moderators only can't self-modify, handle on teacher and hod roles) */}
                {!isMod && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.bdr}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {isHoD ? (
                      <>
                        <Btn v="ghost" onClick={() => { if (confirm(`Demote ${t.display_name} from HoD back to teacher?`)) callManage("set_hod", t.id, { target_id: t.id, promote: false }); }} disabled={busy} style={{ fontSize: 11, padding: "5px 10px", color: C.red, borderColor: "rgba(239,68,68,.3)" }}>
                          Demote HoD
                        </Btn>
                        <span style={{ fontSize: 11, color: C.mid }}>{teamCount} teacher{teamCount === 1 ? "" : "s"} in dept</span>
                      </>
                    ) : (
                      <>
                        <Btn v="ghost" onClick={() => callManage("set_hod", t.id, { target_id: t.id, promote: true })} disabled={busy} style={{ fontSize: 11, padding: "5px 10px", color: C.amb, borderColor: "rgba(217,119,6,.3)" }}>
                          Promote to HoD
                        </Btn>
                        {assignedHoD ? (
                          <span style={{ fontSize: 11, color: C.mid, display: "flex", alignItems: "center", gap: 4 }}>
                            → {assignedHoD.display_name}'s dept
                            <Btn v="ghost" onClick={() => callManage("set_hod_link", t.id, { target_id: t.id, hod_id: null })} disabled={busy} style={{ fontSize: 10, padding: "3px 8px" }}>Remove</Btn>
                          </span>
                        ) : hods.length > 0 ? (
                          <select onChange={e => { if (e.target.value) { callManage("set_hod_link", t.id, { target_id: t.id, hod_id: e.target.value }); e.target.value = ""; } }} defaultValue="" style={{ padding: "5px 8px", fontSize: 11, borderRadius: 6, border: `1px solid ${C.bdr}`, background: C.card, fontFamily: "inherit", cursor: "pointer" }}>
                            <option value="">Assign to HoD…</option>
                            {hods.map(h => <option key={h.id} value={h.id}>{h.display_name}</option>)}
                          </select>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filteredTeachers.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.mid, fontSize: 12 }}>No teachers match.</div>}
        </div>
      )}

      {/* Students list with search */}
      {(view === "students" || view === "unjoined") && (
        <div>
          <Inp placeholder="Search students by name or email" value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom: 10 }} />
          {(view === "unjoined" ? unjoinedStudents.filter(s => !filter || (s.display_name || "").toLowerCase().includes(filter.toLowerCase()) || (s.email || "").toLowerCase().includes(filter.toLowerCase())) : filteredStudents).map(s => {
            const isExpanded = expandedStudent === s.id;
            const sClassIds = studentClassMap[s.id] || [];
            const sClasses = sClassIds.map(id => classById[id]).filter(Boolean);
            const unjoined = sClasses.length === 0;
            return (
              <div key={s.id} style={{ background: C.card, border: `1px solid ${unjoined ? C.red + "55" : C.bdr}`, borderRadius: 8, marginBottom: 4 }}>
                <button onClick={() => { setExpandedStudent(isExpanded ? null : s.id); setRenameDraft(s.display_name || ""); setPwDraft(""); setMsg(""); }}
                  style={{ width: "100%", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{s.display_name || "—"}</div>
                    <div style={{ fontSize: 11, color: C.mid, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.email || "no email"}</div>
                  </div>
                  {unjoined ? <Badge color={C.red}>No class</Badge> : <div style={{ fontSize: 11, color: C.mid }}>{sClasses.map(c => c.name).join(", ")}</div>}
                  <span style={{ fontSize: 14, color: C.mid }}>{isExpanded ? "−" : "+"}</span>
                </button>
                {isExpanded && (
                  <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.bdr}`, background: C.cardSoft || C.bg }}>
                    {/* Rename */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 4 }}>Display name</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Inp value={renameDraft} onChange={e => setRenameDraft(e.target.value)} maxLength={80} style={{ fontSize: 13, padding: "8px 10px" }} />
                        <Btn onClick={() => { const t = renameDraft.trim(); if (t && t !== s.display_name) callManage("rename_student", s.id, { new_name: t }); }} disabled={busy || !renameDraft.trim() || renameDraft.trim() === s.display_name} style={{ whiteSpace: "nowrap", fontSize: 12, padding: "8px 14px" }}>{busy ? "..." : "Save"}</Btn>
                      </div>
                    </div>

                    {/* Reset password */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 4 }}>Reset password</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Inp placeholder="New password (min 6)" type="text" value={pwDraft} onChange={e => setPwDraft(e.target.value)} style={{ fontSize: 13, padding: "8px 10px" }} />
                        <Btn onClick={() => callManage("reset_password", s.id, { new_password: pwDraft })} disabled={pwDraft.length < 6 || busy} style={{ whiteSpace: "nowrap", fontSize: 12, padding: "8px 14px" }}>{busy ? "..." : "Reset"}</Btn>
                      </div>
                    </div>

                    {/* Email */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 4 }}>Login email</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ flex: 1, padding: "8px 10px", background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 12, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.email || "no email"}</div>
                        <Btn v="ghost" onClick={() => { navigator.clipboard.writeText(s.email || ""); setMsg("Email copied"); setTimeout(() => setMsg(""), 1500); }} style={{ fontSize: 11, padding: "8px 12px" }}>Copy</Btn>
                      </div>
                    </div>

                    {/* Add to class */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 4 }}>Add to class</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <select value={expandedStudent === s.id ? addClassId : ""} onChange={e => setAddClassId(e.target.value)} style={{ flex: 1, padding: "8px 10px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: C.txt, cursor: "pointer" }}>
                          <option value="">Select a class...</option>
                          {classes.filter(c => !(studentClassMap[s.id] || []).includes(c.id)).map(c => (
                            <option key={c.id} value={c.id}>{c.name}{c.profiles?.display_name ? ` (${c.profiles.display_name})` : ""}</option>
                          ))}
                        </select>
                        <Btn onClick={() => { if (addClassId) { callManage("add_to_class", s.id, { class_id: addClassId }); setAddClassId(""); } }} disabled={!addClassId || busy} style={{ whiteSpace: "nowrap", fontSize: 12, padding: "8px 14px" }}>{busy ? "..." : "Add"}</Btn>
                      </div>
                      {classes.filter(c => !(studentClassMap[s.id] || []).includes(c.id)).length === 0 && (
                        <div style={{ fontSize: 11, color: C.mid, marginTop: 4, fontStyle: "italic" }}>In all available classes already.</div>
                      )}
                    </div>

                    {/* Remove from current classes */}
                    {(studentClassMap[s.id] || []).length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, marginBottom: 4 }}>Remove from class</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(studentClassMap[s.id] || []).map(cid => {
                            const cl = classById[cid];
                            if (!cl) return null;
                            return (
                              <div key={cid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 6 }}>
                                <span style={{ flex: 1, fontSize: 12 }}>{cl.name}</span>
                                <Btn v="ghost" onClick={() => { if (confirm(`Remove ${s.display_name} from ${cl.name}?`)) callManage("remove_from_class", s.id, { class_id: cid }); }} disabled={busy} style={{ fontSize: 11, padding: "4px 10px", color: C.red, borderColor: "rgba(239,68,68,.3)" }}>Remove</Btn>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Delete */}
                    <div>
                      <Btn v="ghost" onClick={() => { if (confirm(`Permanently delete ${s.display_name}? This removes the account entirely.`)) callManage("delete_student", s.id); }} disabled={busy} style={{ width: "100%", fontSize: 11, padding: "8px 10px", background: C.redS, color: C.red, borderColor: "rgba(239,68,68,.3)" }}>Delete student account</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {view === "unjoined" && unjoinedStudents.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.mid, fontSize: 12 }}>🎉 All students are in a class.</div>}
        </div>
      )}

      {/* COSTS */}
      {view === "costs" && (() => {
        const classTeacherMap = Object.fromEntries(classes.map(c => [c.id, c.teacher_id]));
        const teacherHodMap = Object.fromEntries(teachers.map(t => [t.id, t.hod_id || null]));
        const teacherNameMap = Object.fromEntries(teachers.map(t => [t.id, t.display_name || t.email || "—"]));
        const hodNameMap = Object.fromEntries(
          teachers.filter(t => t.role === "hod").map(h => [h.id, h.display_name || h.email || "—"])
        );

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const rollingCutoff = now.getTime() - 30 * 86400000;

        const monthResps = responses30d.filter(r => new Date(r.answered_at).getTime() >= startOfMonth);
        const rollingResps = responses30d.filter(r => new Date(r.answered_at).getTime() >= rollingCutoff);

        const monthTotal = monthResps.length;
        const rollingTotal = rollingResps.length;
        const monthCostPence = monthTotal * EFFECTIVE_COST_PER_ANSWER_PENCE;
        const rollingCostPence = rollingTotal * EFFECTIVE_COST_PER_ANSWER_PENCE;

        const deptAgg = {};
        monthResps.forEach(r => {
          const tid = classTeacherMap[r.class_id];
          if (!tid) return;
          const hodId = teacherHodMap[tid] || "__unassigned__";
          if (!deptAgg[hodId]) deptAgg[hodId] = { hodId, responses: 0, teacherIds: new Set() };
          deptAgg[hodId].responses++;
          deptAgg[hodId].teacherIds.add(tid);
        });

        const deptRows = Object.values(deptAgg)
          .map(d => ({
            hodId: d.hodId,
            name: d.hodId === "__unassigned__" ? "Unassigned" : (hodNameMap[d.hodId] || "—") + "'s department",
            teacherCount: d.teacherIds.size,
            teacherNames: [...d.teacherIds].map(tid => teacherNameMap[tid]).sort(),
            responses: d.responses,
            costPence: d.responses * EFFECTIVE_COST_PER_ANSWER_PENCE,
            pct: monthTotal > 0 ? (d.responses / monthTotal) * 100 : 0,
          }))
          .sort((a, b) => b.costPence - a.costPence);

        const fmt = (pence) => {
          if (pence < 1) return `${pence.toFixed(1)}p`;
          if (pence < 100) return `${pence.toFixed(0)}p`;
          return `£${(pence / 100).toFixed(2)}`;
        };

        const monthLabel = now.toLocaleString("en-GB", { month: "long", year: "numeric" });

        return (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ padding: "16px 18px", background: `linear-gradient(135deg, ${C.priSoft}, transparent)`, border: `1px solid ${C.pri}33`, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>{monthLabel}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.pri, lineHeight: 1 }}>{fmt(monthCostPence)}</div>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>{monthTotal.toLocaleString()} answers this month</div>
              </div>
              <div style={{ padding: "16px 18px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Rolling 30 days</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.txt, lineHeight: 1 }}>{fmt(rollingCostPence)}</div>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>{rollingTotal.toLocaleString()} answers</div>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>By department ({monthLabel})</div>
            {deptRows.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: C.mid, fontSize: 12, background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>No answers this month yet.</div>
            ) : (
              deptRows.map(d => (
                <div key={d.hodId} style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                        {d.teacherCount} teacher{d.teacherCount === 1 ? "" : "s"} · {d.responses.toLocaleString()} answer{d.responses === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.txt }}>{fmt(d.costPence)}</div>
                      <div style={{ fontSize: 10, color: C.dim }}>{d.pct.toFixed(0)}% of total</div>
                    </div>
                  </div>
                  <div style={{ height: 4, background: C.bdr, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${d.pct}%`, height: "100%", background: d.hodId === "__unassigned__" ? C.amb : C.pri, borderRadius: 99 }} />
                  </div>
                  {d.teacherNames.length > 0 && d.teacherNames.length <= 6 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                      {d.teacherNames.map((n, i) => <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: C.bg, color: C.mid, border: `1px solid ${C.bdr}` }}>{n}</span>)}
                    </div>
                  )}
                </div>
              ))
            )}

            <div style={{ marginTop: 16, padding: "10px 12px", background: C.card, border: `1px dashed ${C.bdr}`, borderRadius: 8, fontSize: 11, color: C.mid, lineHeight: 1.6 }}>
              <strong style={{ color: C.txt }}>How this is calculated.</strong> Estimated from response count × ~{EFFECTIVE_COST_PER_ANSWER_PENCE.toFixed(3)}p per AI-marked answer (Claude Sonnet 4 pricing, ~25% of answers auto-marked numerically so skip the AI). Department figures group teachers by their HoD link. Accurate to within a few pence per month. Doesn't include Supabase or Vercel (both ≈ free at current scale).
            </div>
          </div>
        );
      })()}

      {/* AI USAGE — real cache hit rate from logged Anthropic usage */}
      {view === "aiusage" && (() => {
        const loadAiUsage = async (days) => {
          setAiUsageLoading(true);
          try {
            const cutoff = new Date(Date.now() - days * 86400000).toISOString();
            const rows = await sb.q("ai_usage", { params: {
              select: "ts,call_label,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens",
              ts: `gte.${cutoff}`,
              order: "ts.desc",
              limit: "10000"
            }});
            setAiUsage(rows || []);
          } catch (e) {
            console.error("ai_usage load failed", e);
            setAiUsage([]);
          }
          setAiUsageLoading(false);
        };

        // Auto-load on first render of this view
        if (aiUsage === null && !aiUsageLoading) {
          loadAiUsage(aiUsageWindow);
        }

        const rows = aiUsage || [];
        const totalCalls = rows.length;
        const totalInput = rows.reduce((s, r) => s + (r.input_tokens || 0), 0);
        const totalOutput = rows.reduce((s, r) => s + (r.output_tokens || 0), 0);
        const totalCacheRead = rows.reduce((s, r) => s + (r.cache_read_tokens || 0), 0);
        const totalCacheWrite = rows.reduce((s, r) => s + (r.cache_creation_tokens || 0), 0);
        // Hit rate = (cache reads) / (cache reads + cache writes). Fresh prompt tokens
        // (input_tokens) are the small per-call user message and don't reflect cache state.
        const cacheableTotal = totalCacheRead + totalCacheWrite;
        const hitRate = cacheableTotal > 0 ? Math.round((totalCacheRead / cacheableTotal) * 100) : 0;
        const callsPerHit = rows.filter(r => (r.cache_read_tokens || 0) > 0).length;
        const callsPerWrite = rows.filter(r => (r.cache_creation_tokens || 0) > 0).length;

        // Haiku 4.5 pricing in USD per million tokens
        const PRICE_INPUT = 1.0;       // fresh prompt tokens
        const PRICE_OUTPUT = 5.0;
        const PRICE_CACHE_READ = 0.10;  // 10% of input
        const PRICE_CACHE_WRITE = 1.25; // 125% of input (one-off write surcharge)
        const usdActual = (totalInput * PRICE_INPUT + totalOutput * PRICE_OUTPUT + totalCacheRead * PRICE_CACHE_READ + totalCacheWrite * PRICE_CACHE_WRITE) / 1_000_000;
        // Hypothetical: what we'd have paid if every cached token had been billed at full input rate
        const usdNoCache = (totalInput * PRICE_INPUT + totalOutput * PRICE_OUTPUT + (totalCacheRead + totalCacheWrite) * PRICE_INPUT) / 1_000_000;
        const usdSaved = Math.max(0, usdNoCache - usdActual);
        const savedPct = usdNoCache > 0 ? Math.round((usdSaved / usdNoCache) * 100) : 0;
        const gbp = (usd) => `£${(usd * 0.79).toFixed(2)}`;

        const firstCalls = rows.filter(r => r.call_label === "first").length;
        const secondCalls = rows.filter(r => r.call_label === "second").length;
        const doubleCheckRate = firstCalls > 0 ? Math.round((secondCalls / firstCalls) * 100) : 0;

        return (
          <div>
            {/* Window selector + refresh */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.dim, marginRight: 4 }}>Window:</span>
              {[1, 7, 30].map(d => (
                <button key={d} onClick={() => { setAiUsageWindow(d); loadAiUsage(d); }}
                  style={{ padding: "4px 10px", fontSize: 11, borderRadius: 99, border: `1px solid ${aiUsageWindow === d ? C.pri : C.bdr}`, background: aiUsageWindow === d ? C.priSoft : "transparent", color: aiUsageWindow === d ? C.pri : C.mid, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                  {d === 1 ? "24h" : `${d}d`}
                </button>
              ))}
              <button onClick={() => loadAiUsage(aiUsageWindow)} disabled={aiUsageLoading}
                style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 11, borderRadius: 99, border: `1px solid ${C.bdr}`, background: "transparent", color: C.mid, cursor: aiUsageLoading ? "wait" : "pointer", fontFamily: "inherit" }}>
                {aiUsageLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {aiUsageLoading && rows.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: C.mid, fontSize: 12, background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: C.mid, fontSize: 12, background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
                No AI calls logged in this window yet. Have a student answer a question to start collecting data.
              </div>
            ) : (
              <>
                {/* Headline tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div style={{ padding: "16px 18px", background: `linear-gradient(135deg, ${C.priSoft}, transparent)`, border: `1px solid ${C.pri}33`, borderRadius: 12 }}>
                    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Cache hit rate</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: C.pri, lineHeight: 1 }}>{hitRate}%</div>
                    <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>{callsPerHit.toLocaleString()} of {totalCalls.toLocaleString()} AI calls hit cache</div>
                  </div>
                  <div style={{ padding: "16px 18px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 12 }}>
                    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Saved by caching</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: C.txt, lineHeight: 1 }}>{gbp(usdSaved)}</div>
                    <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>{savedPct}% off the no-cache cost</div>
                  </div>
                </div>

                {/* Detail row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>AI calls</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{totalCalls.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{firstCalls.toLocaleString()} first, {secondCalls.toLocaleString()} double-check</div>
                  </div>
                  <div style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Actual spend</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{gbp(usdActual)}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>vs. {gbp(usdNoCache)} without cache</div>
                  </div>
                  <div style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Double-check rate</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{doubleCheckRate}%</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>of first-pass calls re-run</div>
                  </div>
                </div>

                {/* Token breakdown */}
                <div style={{ marginTop: 12, padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Token breakdown</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px", fontSize: 12 }}>
                    <div style={{ color: C.mid }}>Fresh input (per-call)</div><div style={{ fontFamily: "monospace", textAlign: "right" }}>{totalInput.toLocaleString()}</div>
                    <div style={{ color: C.mid }}>Output</div><div style={{ fontFamily: "monospace", textAlign: "right" }}>{totalOutput.toLocaleString()}</div>
                    <div style={{ color: C.grn || C.pri }}>Cache reads (cheap)</div><div style={{ fontFamily: "monospace", textAlign: "right", color: C.grn || C.pri }}>{totalCacheRead.toLocaleString()}</div>
                    <div style={{ color: C.amb }}>Cache writes (one-off)</div><div style={{ fontFamily: "monospace", textAlign: "right", color: C.amb }}>{totalCacheWrite.toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ marginTop: 16, padding: "10px 12px", background: C.card, border: `1px dashed ${C.bdr}`, borderRadius: 8, fontSize: 11, color: C.mid, lineHeight: 1.6 }}>
                  <strong style={{ color: C.txt }}>How this works.</strong> Every AI call to Haiku writes a row to <code style={{ background: C.bg, padding: "1px 4px", borderRadius: 3 }}>ai_usage</code> with token counts from Anthropic’s response. Cache hit rate = cache-read tokens ÷ (cache-read + cache-write tokens). Cache reads cost ~10% of fresh input. Once warm and busy, hit rate should sit at 80–95%. After a quiet period the cache expires (~5 min) and the next call writes a fresh entry.
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* CACHE HEALTH — accepted-answer cache audit */}
      {view === "cache" && (() => {
        const loadCache = async () => {
          setCacheLoading(true);
          try {
            const rows = await sb.q("accepted_answers", { params: {
              select: "id,question_id,normalised_answer,marks_awarded,feedback,confirmation_count,hit_count,last_verified_at,created_at,questions(question_text,topic_id,topics(name))",
              order: "hit_count.desc",
              limit: "200"
            }});
            setCacheRows(rows || []);
          } catch (e) {
            console.error("cache load failed", e);
            setCacheRows([]);
          }
          setCacheLoading(false);
        };

        if (cacheRows === null && !cacheLoading) loadCache();

        const purgeOne = async (id) => {
          if (!confirm("Delete this cached answer? Future students writing this exact phrasing will be re-checked by the AI.")) return;
          setCachePurging(id);
          try {
            await sb.q("accepted_answers", { method: "DELETE", params: { id: `eq.${id}` } });
            setCacheRows(prev => (prev || []).filter(r => r.id !== id));
          } catch (e) { console.error(e); alert("Purge failed: " + e.message); }
          setCachePurging(null);
        };

        const rows = cacheRows || [];
        const total = rows.length;
        const probationary = rows.filter(r => (r.confirmation_count ?? 0) < 3).length;
        const authoritative = total - probationary;
        const totalHits = rows.reduce((s, r) => s + (r.hit_count || 0), 0);
        const suspicious = rows.filter(r => (r.hit_count || 0) > 10 && (r.confirmation_count ?? 0) === 3);

        return (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.dim }}>Showing top {total} cached entries by hit count</span>
              <button onClick={loadCache} disabled={cacheLoading}
                style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 11, borderRadius: 99, border: `1px solid ${C.bdr}`, background: "transparent", color: C.mid, cursor: cacheLoading ? "wait" : "pointer", fontFamily: "inherit" }}>
                {cacheLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {cacheLoading && rows.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: C.mid, fontSize: 12, background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: C.mid, fontSize: 12, background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
                No cached answers yet. The cache fills up as students write correct answers that the AI marks with high confidence.
              </div>
            ) : (
              <>
                {/* Stat tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Authoritative</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.pri, marginTop: 4 }}>{authoritative}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>≥3 confirmations</div>
                  </div>
                  <div style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Probationary</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.amb, marginTop: 4 }}>{probationary}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>still verified by AI</div>
                  </div>
                  <div style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Total cache hits</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.txt, marginTop: 4 }}>{totalHits.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>AI calls saved</div>
                  </div>
                </div>

                {suspicious.length > 0 && (
                  <div style={{ padding: "10px 12px", background: C.amb + "22", border: `1px solid ${C.amb}55`, borderRadius: 8, marginBottom: 12, fontSize: 12, color: C.txt }}>
                    ⚠ {suspicious.length} entr{suspicious.length === 1 ? "y has" : "ies have"} been hit 10+ times with only 3 confirmations — worth spot-checking these manually.
                  </div>
                )}

                {/* Table */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {rows.map(r => {
                    const auth = (r.confirmation_count ?? 0) >= 3;
                    const topicName = r.questions?.topics?.name || "—";
                    return (
                      <div key={r.id} style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>
                              <span style={{ fontFamily: "monospace" }}>{topicName}</span>
                              <span style={{ marginLeft: 8 }}>{r.questions?.question_text?.slice(0, 80) || "(deleted question)"}</span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: C.txt, fontFamily: "monospace", wordBreak: "break-word" }}>
                              "{r.normalised_answer}"
                            </div>
                            <div style={{ fontSize: 10, color: C.dim, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                              <span>{r.marks_awarded} mark{r.marks_awarded === 1 ? "" : "s"}</span>
                              <span style={{ color: auth ? C.pri : C.amb }}>{r.confirmation_count} confirmation{r.confirmation_count === 1 ? "" : "s"}</span>
                              <span>{r.hit_count} hit{r.hit_count === 1 ? "" : "s"}</span>
                            </div>
                          </div>
                          <button onClick={() => purgeOne(r.id)} disabled={cachePurging === r.id}
                            style={{ padding: "4px 10px", fontSize: 11, borderRadius: 6, border: `1px solid ${C.red}55`, background: "transparent", color: C.red, cursor: "pointer", fontFamily: "inherit", opacity: cachePurging === r.id ? 0.5 : 1 }}>
                            {cachePurging === r.id ? "…" : "Purge"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 16, padding: "10px 12px", background: C.card, border: `1px dashed ${C.bdr}`, borderRadius: 8, fontSize: 11, color: C.mid, lineHeight: 1.6 }}>
                  <strong style={{ color: C.txt }}>How the cache works.</strong> Once an answer has been independently confirmed by the AI 3 times with high confidence, it becomes authoritative — future students writing the same phrasing skip the AI entirely. Entries expire after 90 days or 50 hits and re-verify. Editing a question's text or model answer wipes its cache. Purge removes a specific entry; the next student typing it will be re-marked by the AI.
                </div>
              </>
            )}
          </div>
        );
      })()}

    </div>
  );
}

const StatTile = ({ label, value, onClick, active, color }) => (
  <button onClick={onClick} disabled={!onClick} style={{ padding: "10px 8px", background: active ? C.priSoft : C.card, border: `1px solid ${active ? C.pri : C.bdr}`, borderRadius: 8, cursor: onClick ? "pointer" : "default", fontFamily: "inherit", textAlign: "center" }}>
    <div style={{ fontSize: 18, fontWeight: 700, color: color || (active ? C.pri : C.txt), lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 10, color: C.mid, textTransform: "uppercase", letterSpacing: .5, marginTop: 4 }}>{label}</div>
  </button>
);

/* ─── HoD PANEL ─── */
function HodPanel({ user }) {
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
      {/* Header */}
      <div style={{ marginBottom: 16, padding: "16px 20px", background: `linear-gradient(135deg, ${C.priSoft}, transparent)`, border: `1px solid ${C.pri}33`, borderRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, marginBottom: 4 }}>🧭 Head of Department</div>
        <div style={{ fontSize: 12, color: C.mid }}>Oversight of your department — {teachers.length} teacher{teachers.length === 1 ? "" : "s"}, {totalStudents} student{totalStudents === 1 ? "" : "s"}.</div>
      </div>

      {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: C.redS, color: C.red, fontSize: 12, marginBottom: 12 }}>Error: {error}</div>}

      {teachers.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🗂</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.txt, marginBottom: 6 }}>No teachers in your department yet</div>
          <div style={{ fontSize: 13, color: C.mid }}>Ask your admin to add teachers to your department.</div>
        </Card>
      ) : (
        <>
          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
            <div style={{ padding: "12px 8px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.txt }}>{teachers.length}</div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Teachers</div>
            </div>
            <div style={{ padding: "12px 8px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.txt }}>{totalStudents}</div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Students</div>
            </div>
            <div style={{ padding: "12px 8px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: totalActiveThisWeek > 0 ? C.grn : C.dim }}>{totalActiveThisWeek}</div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Active 7d</div>
            </div>
            <div style={{ padding: "12px 8px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: deptAccuracy >= 70 ? C.grn : deptAccuracy >= 50 ? C.amb : C.red }}>{deptAccuracy}%</div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Accuracy</div>
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
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
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
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
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
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
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
function Teacher({ user, isMod, isHoD }) {
  const [tab, setTab] = useState(isHoD ? "hod" : "dashboard");
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
  const [deliveries, setDeliveries] = useState({}); // topicId → {taught_at, notes}
  const [parentTokens, setParentTokens] = useState({}); // studentId → token UUID

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
      const [allT, ul, resps, mems, dels, tokens] = await Promise.all([
        sb.q("topics", { params: { subject_id: `eq.${c.subject_id}`, select: "*", order: "sort_order.asc" } }),
        sb.q("class_topics", { params: { class_id: `eq.${c.id}`, select: "topic_id,recency_rank" } }),
        sb.q("responses", { params: { class_id: `eq.${c.id}`, select: "*,questions(question_text,model_answer,topic_id,topics(name)),profiles(display_name)" } }),
        sb.q("class_members", { params: { class_id: `eq.${c.id}`, select: "*,profiles(display_name,email)" } }),
        sb.q("lesson_deliveries", { params: { class_id: `eq.${c.id}`, select: "topic_id,taught_at,notes" } }),
        sb.q("parent_tokens", { params: { class_id: `eq.${c.id}`, select: "student_id,token" } }),
      ]);
      setTopics(allT); setUnlocked(new Set(ul.map(t => t.topic_id)));
      const delMap = {}; dels.forEach(d => { delMap[d.topic_id] = { taught_at: d.taught_at, notes: d.notes }; });
      setDeliveries(delMap);
      const tokMap = {}; tokens.forEach(t => { tokMap[t.student_id] = t.token; });
      setParentTokens(tokMap);

      const clsTarget = c.weekly_target ?? WEEKLY_TARGET;
      const sm = {};
      mems.forEach(m => {
        sm[m.student_id] = { name: m.profiles?.display_name || "?", email: m.profiles?.email || "", t: 0, c: 0, weekValid: 0, weekStars: 0, flagged: 0, targetOverride: m.weekly_target_override ?? null };
      });
      const mis = {}, tp = {};
      const thisWeekBounds = getWeekBounds(0);
      const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

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
        if (!r.is_correct && r.questions && new Date(r.answered_at) >= twoWeeksAgo) {
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

  const markTaught = async (topicId) => {
    if (!cls) return;
    try {
      if (deliveries[topicId]) {
        // Already marked — unmark (delete)
        await sb.del("lesson_deliveries", { class_id: `eq.${cls.id}`, topic_id: `eq.${topicId}` });
        setDeliveries(p => { const n = { ...p }; delete n[topicId]; return n; });
      } else {
        // Mark as taught today
        await sb.q("lesson_deliveries", { method: "POST", body: { class_id: cls.id, topic_id: topicId, teacher_id: user.id } });
        setDeliveries(p => ({ ...p, [topicId]: { taught_at: new Date().toISOString(), notes: null } }));
      }
    } catch (e) { console.error(e); }
  };

  const generateParentToken = async (studentId) => {
    if (!cls) return null;
    try {
      if (parentTokens[studentId]) {
        // Delete existing and regenerate
        await sb.del("parent_tokens", { student_id: `eq.${studentId}`, class_id: `eq.${cls.id}` });
      }
      const [newToken] = await sb.q("parent_tokens", { method: "POST", body: { student_id: studentId, class_id: cls.id, created_by: user.id } });
      setParentTokens(p => ({ ...p, [studentId]: newToken.token }));
      return newToken.token;
    } catch (e) { console.error(e); return null; }
  };

  const revokeParentToken = async (studentId) => {
    if (!cls) return;
    try {
      await sb.del("parent_tokens", { student_id: `eq.${studentId}`, class_id: `eq.${cls.id}` });
      setParentTokens(p => { const n = { ...p }; delete n[studentId]; return n; });
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
          {[...(isHoD ? ["hod"] : []), ...["dashboard", "starter", "topics", "questions"], ...(isMod ? ["admin"] : [])].map(t => <Pill key={t} on={tab === t} onClick={() => setTab(t)} style={t === "admin" ? { borderColor: C.pri, color: tab === t ? C.pri : C.pri } : (t === "hod" ? { borderColor: C.amb, color: tab === t ? C.amb : C.amb } : undefined)}>{t === "starter" ? "Lesson Starter" : t === "admin" ? "⚙ Admin" : t === "hod" ? "🧭 Department" : t.charAt(0).toUpperCase() + t.slice(1)}</Pill>)}
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

              {/* At-risk alerts */}
              {(() => {
                const atRisk = dash.students.filter(s => {
                  const h = s.weeklyHistory;
                  return h && h.length >= 2 && h[0].valid === 0 && h[1].valid === 0;
                });
                if (atRisk.length === 0) return null;
                return (
                  <Card style={{ padding: 14, marginBottom: 12, borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.04)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 16 }}>⚠️</span>
                      <div style={{ color: C.red, fontWeight: 600, fontSize: 13 }}>Needs attention — {atRisk.length} student{atRisk.length !== 1 ? "s" : ""} inactive for 2+ weeks</div>
                    </div>
                    {atRisk.map((s, i) => {
                      const lastActive = s.weeklyHistory?.findIndex(w => w.valid > 0);
                      const weeksAgo = lastActive === -1 || lastActive === undefined ? "Never" : lastActive === 0 ? "This week" : `${lastActive}w ago`;
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, background: C.redS, marginBottom: i < atRisk.length - 1 ? 6 : 0 }}>
                          <span style={{ fontSize: 13, color: C.txt, fontWeight: 500 }}>{s.name}</span>
                          <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>Last active: {weeksAgo}</span>
                        </div>
                      );
                    })}
                  </Card>
                );
              })()}

              <Card style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>Students</div>
                  <span style={{ fontSize: 11, color: C.dim }}>Tap to manage · showing this week</span>
                </div>
                {dash.students.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>No students yet. Share the join code above.</div> :
                  <StudentList students={dash.students} cls={cls} clsTarget={dash.clsTarget} onRefresh={() => loadCls(cls)} parentTokens={parentTokens} onGenerateToken={generateParentToken} onRevokeToken={revokeParentToken} />}
              </Card>

              <BulkUpload cls={cls} onRefresh={() => loadCls(cls)} />

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
            <TopicSelector topics={topics} unlocked={unlocked} toggleT={toggleT} setUnlocked={setUnlocked} cls={cls} userId={user.id} deliveries={deliveries} onMarkTaught={markTaught} />
          )}

          {tab === "questions" && <QMgr subjectId={cls.subject_id} userId={user.id} topics={topics} setTopics={setTopics} />}
          {tab === "admin" && isMod && <AdminPanel user={user} />}
          {tab === "hod" && isHoD && <HodPanel user={user} />}
        </>
      )}
    </div>
  );
}

/* ─── Student List with Management Actions ─── */
function StudentList({ students, cls, clsTarget, onRefresh, parentTokens = {}, onGenerateToken, onRevokeToken }) {
  const [expanded, setExpanded] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [renaming, setRenaming] = useState(null); // studentId being renamed
  const [renameDraft, setRenameDraft] = useState("");
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
            <button onClick={() => { setExpanded(isExpanded ? null : s.id); setNewPw(""); setMsg(""); setConfirmDelete(null); setRenaming(null); setRenameDraft(""); }} style={{
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

                {/* Parent access */}
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: C.card2 }}>
                  <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 8 }}>Parent access link</div>
                  {parentTokens[s.id] ? (
                    <div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <input readOnly value={`https://parent-hub-ten.vercel.app/view/${parentTokens[s.id]}`}
                          style={{ flex: 1, padding: "6px 8px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.dim, fontSize: 11, fontFamily: "monospace", outline: "none" }} />
                        <button onClick={() => { navigator.clipboard.writeText(`https://parent-hub-ten.vercel.app/view/${parentTokens[s.id]}`); setMsg("Link copied!"); setTimeout(() => setMsg(""), 2000); }}
                          style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.bdr}`, background: C.pri, color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                          Copy
                        </button>
                      </div>
                      <button onClick={() => onRevokeToken(s.id)} style={{ fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
                        Revoke link
                      </button>
                    </div>
                  ) : (
                    <Btn onClick={async () => { const t = await onGenerateToken(s.id); if (t) setMsg("Link generated — copy it above"); }} disabled={busy} style={{ fontSize: 12, padding: "8px 14px" }}>
                      Generate parent link
                    </Btn>
                  )}
                </div>

                {/* Identity — email + rename */}
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: C.card2 }}>
                  <div style={{ fontSize: 11, color: C.mid, fontWeight: 600, marginBottom: 8 }}>Identity</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: C.dim, minWidth: 44, textTransform: "uppercase", letterSpacing: 0.5 }}>Email</span>
                    <input readOnly value={s.email || "—"}
                      style={{ flex: 1, padding: "6px 8px", background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.dim, fontSize: 11, fontFamily: "monospace", outline: "none" }} />
                    <button onClick={() => { if (s.email) { navigator.clipboard.writeText(s.email); setMsg("Email copied"); setTimeout(() => setMsg(""), 1500); } }}
                      disabled={!s.email}
                      style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.bdr}`, background: C.pri, color: "#fff", fontSize: 11, cursor: s.email ? "pointer" : "default", fontFamily: "inherit", fontWeight: 600, opacity: s.email ? 1 : 0.4 }}>
                      Copy
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: C.dim, minWidth: 44, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</span>
                    {renaming === s.id ? (
                      <>
                        <Inp value={renameDraft} onChange={e => setRenameDraft(e.target.value)} autoFocus maxLength={80}
                          onKeyDown={e => { if (e.key === "Escape") { setRenaming(null); setRenameDraft(""); } }}
                          style={{ fontSize: 13, padding: "6px 8px" }} />
                        <Btn onClick={async () => {
                            const t = renameDraft.trim();
                            if (!t || t === s.name) { setRenaming(null); setRenameDraft(""); return; }
                            await callManage("rename_student", s.id, { new_name: t });
                            setRenaming(null); setRenameDraft(""); onRefresh();
                          }} disabled={busy || !renameDraft.trim() || renameDraft.trim() === s.name}
                          style={{ whiteSpace: "nowrap", fontSize: 12, padding: "7px 12px" }}>
                          {busy ? "..." : "Save"}
                        </Btn>
                        <Btn v="ghost" onClick={() => { setRenaming(null); setRenameDraft(""); }}
                          style={{ fontSize: 12, padding: "7px 10px" }}>
                          Cancel
                        </Btn>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: 13, color: C.txt, fontWeight: 500 }}>{s.name}</span>
                        <Btn v="ghost" onClick={() => { setRenaming(s.id); setRenameDraft(s.name); }}
                          style={{ fontSize: 12, padding: "6px 12px" }}>
                          Rename
                        </Btn>
                      </>
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

/* ─── Bulk Upload Students ─── */
function BulkUpload({ cls, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState([]); // [{display_name, email}]
  const [parseErr, setParseErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // [{display_name, email, status, password?, error?}]

  const parseCSV = (text) => {
    setParseErr(""); setResults(null);
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { setParsed([]); return; }
    // Skip header row if it looks like a header
    const first = lines[0].toLowerCase();
    const start = (first.includes("name") || first.includes("email")) ? 1 : 0;
    const rows = [];
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(",").map(p => p.trim().replace(/^["']|["']$/g, ""));
      if (parts.length < 2) { setParseErr(`Row ${i + 1}: need at least 2 columns (name, email)`); setParsed([]); return; }
      const [display_name, email] = parts;
      if (!display_name || !email) { setParseErr(`Row ${i + 1}: missing name or email`); setParsed([]); return; }
      if (!email.includes("@")) { setParseErr(`Row ${i + 1}: "${email}" doesn't look like an email`); setParsed([]); return; }
      rows.push({ display_name, email: email.toLowerCase() });
    }
    if (rows.length > 60) { setParseErr("Max 60 students per upload"); setParsed([]); return; }
    setParsed(rows);
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = e => { const text = e.target.result; setRaw(text); parseCSV(text); };
    reader.readAsText(file);
  };

  const upload = async () => {
    if (!parsed.length || busy) return;
    setBusy(true); setResults(null);
    try {
      const jwt = sb.auth.getToken();
      const r = await fetch(`${SUPA_URL}/functions/v1/manage-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${jwt || SUPA_KEY}` },
        body: JSON.stringify({ action: "bulk_create", class_id: cls.id, students: parsed }),
      });
      const d = await r.json();
      if (d.results) {
        setResults(d.results);
        const created = d.results.filter(r => r.status === "created");
        if (created.length) { downloadCredentials(created); onRefresh(); }
      } else {
        setParseErr(d.error || "Upload failed");
      }
    } catch (e) { setParseErr(e.message); }
    setBusy(false);
  };

  const downloadCredentials = (rows) => {
    const header = "Name,Email,Password,Login URL";
    const loginUrl = window.location.origin;
    const lines = rows.map(r => `"${r.display_name}","${r.email}","${r.password}","${loginUrl}"`);
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${cls.name.replace(/\//g, "-")}_login_credentials.csv`;
    a.click();
  };

  const downloadTemplate = () => {
    const csv = "display_name,email\nJohn Smith,john.smith@school.org.uk\nJane Doe,jane.doe@school.org.uk";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "student_import_template.csv";
    a.click();
  };

  return (
    <Card style={{ padding: 14, marginBottom: 10 }}>
      <button onClick={() => { setOpen(o => !o); setResults(null); setParseErr(""); setParsed([]); setRaw(""); }}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "inherit" }}>
        <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>Import students from CSV</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.dim }}>Bulk create accounts</span>
          <span style={{ color: C.dim, fontSize: 12, transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Instructions */}
          <div style={{ padding: "10px 12px", borderRadius: 8, background: C.card2, marginBottom: 12, fontSize: 12, color: C.mid, lineHeight: 1.6 }}>
            Upload a CSV with two columns: <span style={{ color: C.txt, fontFamily: "monospace" }}>display_name, email</span>. One student per row. Passwords are auto-generated — a credentials sheet downloads automatically so you can hand out login slips.
            <button onClick={downloadTemplate} style={{ display: "block", marginTop: 6, background: "none", border: "none", color: C.pri, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0, textDecoration: "underline" }}>
              Download template CSV
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => document.getElementById("csv-file-input").click()}
            style={{ border: `1px dashed ${C.bdr}`, borderRadius: 8, padding: "20px 16px", textAlign: "center", cursor: "pointer", marginBottom: 10, background: C.card2 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>📂</div>
            <div style={{ fontSize: 13, color: C.mid }}>Drop CSV here or click to browse</div>
            <input id="csv-file-input" type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
          </div>

          {/* Or paste */}
          <textarea
            value={raw}
            onChange={e => { setRaw(e.target.value); parseCSV(e.target.value); }}
            placeholder={"Or paste CSV here...\ndisplay_name,email\nJohn Smith,john@school.org.uk"}
            rows={4}
            style={{ width: "100%", padding: "10px 12px", background: C.card2, border: `1px solid ${C.bdr}`, borderRadius: 8, color: C.txt, fontSize: 12, fontFamily: "monospace", resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 10 }}
          />

          {/* Parse error */}
          {parseErr && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, marginBottom: 10 }}>⚠ {parseErr}</div>}

          {/* Preview */}
          {parsed.length > 0 && !results && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.mid, marginBottom: 6 }}>{parsed.length} student{parsed.length !== 1 ? "s" : ""} ready to import</div>
              <div style={{ maxHeight: 160, overflowY: "auto", borderRadius: 8, border: `1px solid ${C.bdr}` }}>
                {parsed.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 12px", borderBottom: i < parsed.length - 1 ? `1px solid ${C.bdr}` : "none", fontSize: 12 }}>
                    <span style={{ flex: 1, color: C.txt, fontWeight: 500 }}>{s.display_name}</span>
                    <span style={{ color: C.dim }}>{s.email}</span>
                  </div>
                ))}
              </div>
              <Btn onClick={upload} disabled={busy} style={{ width: "100%", marginTop: 10, fontSize: 13, padding: "10px 16px" }}>
                {busy ? "Creating accounts..." : `Create ${parsed.length} accounts →`}
              </Btn>
            </div>
          )}

          {/* Results */}
          {results && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: C.grnS, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.grn }}>{results.filter(r => r.status === "created").length}</div>
                  <div style={{ fontSize: 10, color: C.grn }}>Created</div>
                </div>
                <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: results.filter(r => r.status === "error").length > 0 ? C.redS : C.card2, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: results.filter(r => r.status === "error").length > 0 ? C.red : C.dim }}>{results.filter(r => r.status === "error").length}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>Failed</div>
                </div>
              </div>
              {results.filter(r => r.status === "error").length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {results.filter(r => r.status === "error").map((r, i) => (
                    <div key={i} style={{ padding: "6px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 11, marginBottom: 4 }}>
                      {r.display_name} ({r.email}) — {r.error}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {results.filter(r => r.status === "created").length > 0 && (
                  <Btn v="ghost" onClick={() => downloadCredentials(results.filter(r => r.status === "created"))} style={{ flex: 1, fontSize: 12 }}>
                    ↓ Re-download credentials
                  </Btn>
                )}
                <Btn v="ghost" onClick={() => { setResults(null); setParsed([]); setRaw(""); setParseErr(""); }} style={{ flex: 1, fontSize: 12 }}>
                  Import more
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
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
      const allQs = await sb.q("questions", { params: { topic_id: `in.(${tids.join(",")})`, archived: "eq.false", select: "*,topics(name)" } });

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
      const nMisconMax = numQs - nLast - nRecent; // reserve up to 30% for misconceptions

      // Shuffle helper
      const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

      // Pick questions — misconceptions always appended last
      const picked = [];
      const usedIds = new Set();

      // 1. Last lesson (40%) — teacher-selected questions
      const shuffledLast = shuffle(lastTopicSelected);
      for (const q of shuffledLast) {
        if (picked.length >= nLast) break;
        if (!usedIds.has(q.id)) { picked.push({ ...q, source: "last" }); usedIds.add(q.id); }
      }

      // 2. Recent topics (30%)
      const shuffledRecent = shuffle(recentQs);
      for (const q of shuffledRecent) {
        if (picked.filter(p => p.source === "recent").length >= nRecent) break;
        if (!usedIds.has(q.id)) { picked.push({ ...q, source: "recent" }); usedIds.add(q.id); }
      }

      // 3. Filler — fill up to (numQs - nMisconMax) so misconceptions land at the end
      const fillerTarget = numQs - Math.min(nMisconMax, misconceptionQs.filter(q => !usedIds.has(q.id)).length);
      if (picked.length < fillerTarget) {
        const filler = shuffle(allQs.filter(q => !usedIds.has(q.id) && !misconIds.has(q.id)));
        for (const q of filler) {
          if (picked.length >= fillerTarget) break;
          picked.push({ ...q, source: "other" }); usedIds.add(q.id);
        }
      }

      // 4. Misconceptions — always last
      const shuffledMis = shuffle(misconceptionQs);
      for (const q of shuffledMis) {
        if (picked.length >= numQs) break;
        if (!usedIds.has(q.id)) { picked.push({ ...q, source: "misconception" }); usedIds.add(q.id); }
      }

      // 5. Final top-up if still short (e.g. not enough misconceptions or filler)
      if (picked.length < numQs) {
        const topUp = shuffle(allQs.filter(q => !usedIds.has(q.id)));
        for (const q of topUp) {
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
function TopicSelector({ topics, unlocked, toggleT, setUnlocked, cls, userId, deliveries = {}, onMarkTaught }) {
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
    const taught = deliveries[t.id];
    const taughtDate = taught ? new Date(taught.taught_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
    return (
      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <button onClick={() => toggleT(t.id)} style={{
          flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 13,
          background: on ? C.priSoft : "transparent", border: `1px solid ${on ? "rgba(99,102,241,.2)" : "transparent"}`, color: on ? C.txt : C.mid, transition: "all .15s",
        }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? C.pri : C.dim}`, background: on ? C.pri : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{on ? "✓" : ""}</div>
          <span style={{ flex: 1 }}>{t.name}</span>
          {taughtDate && <span style={{ fontSize: 10, color: C.grn, fontWeight: 600, whiteSpace: "nowrap" }}>✓ Taught {taughtDate}</span>}
        </button>
        {on && onMarkTaught && (
          <button onClick={() => onMarkTaught(t.id)} title={taught ? "Unmark as taught" : "Mark as taught"} style={{
            padding: "6px 10px", borderRadius: 8, border: `1px solid ${taught ? C.grn : C.bdr}`, background: taught ? C.grnS : "transparent",
            color: taught ? C.grn : C.dim, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap",
          }}>{taught ? "Taught ✓" : "Mark taught"}</button>
        )}
      </div>
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

  useEffect(() => { if (mode === "browse" && tid) loadQl(tid); }, [mode, tid]);

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
    <Card style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>Questions</div>
        {added > 0 && <Badge color={C.grn}>+{added} added</Badge>}
      </div>

      {/* Topic selector */}
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

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <Pill on={mode === "single"} onClick={() => setMode("single")}>Single</Pill>
        <Pill on={mode === "bulk"} onClick={() => setMode("bulk")}>Bulk</Pill>
        <Pill on={mode === "csv"} onClick={() => { setMode("csv"); setCsvRows(null); setCsvErr(""); }}>CSV import</Pill>
        <Pill on={mode === "browse"} onClick={() => setMode("browse")}>Browse & edit</Pill>
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
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>📄</div>
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
    </Card>
  );
}

/* ─── APP ─── */
export default function App() {
  const [user, setUser] = useState(null);
  if (!user) return <Auth onAuth={setUser} />;
  const isT = user.profile?.role === "teacher" || user.profile?.role === "moderator" || user.profile?.role === "hod" || user.user_metadata?.role === "teacher";
  const isMod = user.profile?.role === "moderator";
  const isHoD = user.profile?.role === "hod" || user.profile?.role === "moderator";

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'DM Sans',-apple-system,sans-serif", color: C.txt }}>
      <div style={{ borderBottom: `1px solid ${C.bdr}`, background: C.card, padding: "0 16px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -.5 }}>retrieval<span style={{ color: C.pri }}>.</span></span>
            <Badge color={isMod ? C.pri : (user.profile?.role === "hod" ? C.amb : (isT ? C.acc : C.pri))}>{isMod ? "Moderator" : (user.profile?.role === "hod" ? "Head of Department" : (isT ? "Teacher" : "Student"))}</Badge>
          </div>
          <Btn v="ghost" onClick={() => { sb.auth.out(); setUser(null); }} style={{ padding: "6px 12px", fontSize: 12 }}>Log out</Btn>
        </div>
      </div>
      <div style={{ paddingBottom: 60 }}>{isT ? <Teacher user={user} isMod={isMod} isHoD={isHoD} /> : <Student user={user} />}</div>
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
