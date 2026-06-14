"use client";
import { useState } from "react";
import { sb } from "../lib/supabase";
import { attachProfile } from "../lib/roles";
import { C } from "../lib/theme";
import { Btn, Card, Inp } from "./ui";

/* ─── AUTH ─── */
export function Auth({ onAuth, onBack }) {
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
      onAuth(await attachProfile(sb.auth.user()));
    } catch (e) {
      const m = e.message || "";
      setErr(m.toLowerCase().includes("fetch") || m.toLowerCase().includes("load") ? "Network error — try opening this in a new tab (expand icon top-right), or check that Supabase email confirmation is disabled." : m);
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "var(--font-plex), -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 14 }}>← Home</button>}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: C.txt, letterSpacing: -0.5 }}>Feynman<span style={{ color: C.pri }}> Education</span></div>
          <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: 14, color: C.dim, marginTop: 6 }}>Science practice that sticks</div>
        </div>
        <Card style={{ padding: "28px 24px" }}>
          <div style={{ display: "flex", gap: 24, marginBottom: 22, borderBottom: `1px solid ${C.bdrSoft}` }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(""); setInfo(""); }} style={{ background: "none", border: "none", padding: "0 0 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: mode === m ? 700 : 600, color: mode === m ? C.txt : C.dim, borderBottom: mode === m ? `2.5px solid ${C.pri}` : "2.5px solid transparent", marginBottom: -1 }}>{m === "login" ? "Log in" : "Sign up"}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "signup" && <>
              <Inp placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              <div style={{ fontSize: 12, color: C.mid, padding: "10px 12px", background: C.card2, borderRadius: 3, borderLeft: `3px solid ${C.amb}`, lineHeight: 1.5 }}>
                You're signing up as a <strong style={{ color: C.txt, fontWeight: 600 }}>student</strong>. Teachers — please ask your admin for an account.
              </div>
            </>}
            <Inp placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <Inp placeholder="Password (min 6)" type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
            {err && <div style={{ color: C.red, fontSize: 13, padding: "10px 12px", background: C.redS, borderRadius: 8, lineHeight: 1.5 }}>{err}</div>}
            {info && <div style={{ color: C.amb, fontSize: 13, padding: "10px 12px", background: C.ambS, borderRadius: 8, lineHeight: 1.5 }}>{info}</div>}
            <Btn onClick={go} disabled={busy || !email || !pw} style={{ marginTop: 6, width: "100%", ...((busy || !email || !pw) ? { background: C.bg, color: C.dim, border: `1.5px solid ${C.bdr}`, opacity: 1 } : { background: C.txt, color: C.bg }) }}>{busy ? "Working..." : mode === "login" ? "Log in" : "Create account"}</Btn>
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
