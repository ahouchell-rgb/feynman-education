"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Inp, Card } from "@/lib/primitives";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login, signup } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [name, setName] = useState("");
  const [err, setErr] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);

  // A safe same-origin return path (e.g. resume a deck fork after signing in).
  // Read from window so we don't need a Suspense boundary for useSearchParams.
  const nextPath = () => {
    if (typeof window === "undefined") return null;
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : null;
  };

  useEffect(() => {
    if (!loading && user) router.replace(nextPath() || "/");
  }, [user, loading, router]);

  const go = async () => {
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "signup") {
        const res = await signup(email, pw, name);
        if (res.needsConfirmation) {
          setInfo("Check your email to confirm, then log in.");
          setMode("login");
          setBusy(false);
          return;
        }
      } else {
        await login(email, pw);
      }
      // Honour an explicit return path (e.g. resume a deck fork); otherwise
      // land on setup if no calendar yet, else home.
      const next = nextPath();
      if (next) { router.replace(next); return; }
      try {
        const cals = await sk.q("timetable_calendar", { params: { teacher_id: `eq.${sk.auth.user().id}`, limit: "1" } });
        router.replace((cals && cals.length) ? "/" : "/setup");
      } catch { router.replace("/"); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.32em", textTransform: "uppercase", color: C.dim, marginBottom: 14 }}>Feynman Education</div>
          <div style={{ fontFamily: C.serif, fontSize: 44, lineHeight: 1, letterSpacing: "-0.02em", color: C.text }}>Feyn<em style={{ fontStyle: "italic", color: C.grn }}>man</em></div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 12, fontFamily: C.serif, fontStyle: "italic" }}>a shared base for every lesson</div>
        </div>
        <Card style={{ padding: "28px 24px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {["login","signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }}
                style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${mode===m ? C.accent : C.border}`, background: mode===m ? C.accent : "transparent", color: mode===m ? C.accentFg : C.muted, fontFamily: C.mono, fontSize: 12, cursor: "pointer", letterSpacing: "0.03em" }}>
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>
          {mode === "signup" && <div style={{ marginBottom: 10 }}><Inp aria-label="Full name" autoComplete="name" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} /></div>}
          <div style={{ marginBottom: 10 }}><Inp type="email" aria-label="Email" autoComplete="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div style={{ marginBottom: 16 }}><Inp type="password" aria-label="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} /></div>
          {err && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{err}</div>}
          {info && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.grnS, color: C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{info}</div>}
          <Btn onClick={go} disabled={busy} style={{ width: "100%" }}>{busy ? "..." : mode === "login" ? "Log in" : "Create account"}</Btn>
        </Card>
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <a href="/driving" style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, textDecoration: "none" }}>
            🚗 UK Driving Test Trainer — no account needed →
          </a>
        </div>
      </div>
    </div>
  );
}
