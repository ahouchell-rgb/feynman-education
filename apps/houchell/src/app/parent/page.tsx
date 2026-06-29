"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { pupilProgressLine } from "@/lib/pupilProgress";
import { AccessibilityMenu, useApplyAccessibilityPrefs } from "@/components/AccessibilityMenu";

// Public, password-less parent portal. Reached via the token in the weekly
// report emails: /parent?t=<token>. Lists the parent's consented children,
// their latest report, history, and a "practise now" link into retrieval-app.
// No teacher auth, no AppShell — this page is intentionally outside the gate.

const COL = {
  bg: "#f4f4f2", card: "#fff", border: "#e5e5e0", text: "#1a1a1a", muted: "#666", dim: "#999", green: "#1a7f5a",
};

interface Report { id: string; weekStart: string; html: string; emailed: boolean; }
interface Weak { topic_id: string; topic_name: string; pct: number; practiseUrl: string | null; }
interface Home { enabled: boolean; weak: Weak[]; targetGrade: string | null; recentScore: number | null; }
interface Course { xp: number; crowns: number; streak: number; updatedAt: string | null }
interface Child { linkId: string; studentName: string; classLabel: string; practiseUrl: string | null; unsubscribeToken: string; reports: Report[]; home?: Home; course?: Course | null; }

function firstName(s: string) { return (s || "").trim().split(/\s+/)[0] || s; }
function heat(pct: number) { return pct < 40 ? "#b95a3c" : pct < 65 ? "#a06520" : "#1a7f5a"; }
const GRADES = ["9", "8", "7", "6", "5", "4", "3"];

// Read-only "my progress / what to practise" view, written TO the pupil. Reuses
// the same per-child Home data (weakest topics, recent score, shared target/goal)
// the parent sees — no extra fetch, no new auth, no other pupil's data.
function PupilProgress({ child, target, onSetTarget }: {
  child: Child; target: string; onSetTarget: (g: string) => void;
}) {
  const home = child.home;
  if (!home || !home.enabled) return null;
  const name = firstName(child.studentName);
  const practiseUrl = home.weak.find((w) => w.practiseUrl)?.practiseUrl || child.practiseUrl;

  return (
    <div style={{ background: "#eef5f1", border: `1px solid #cfe3d8`, borderRadius: 10, padding: 16, marginBottom: 18 }}>
      <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COL.green, marginBottom: 6 }}>For {name}</div>
      <p style={{ fontSize: 14, margin: "0 0 12px", lineHeight: 1.5 }}>{pupilProgressLine(home.recentScore, home.weak.length)}</p>

      {practiseUrl && (
        <p style={{ margin: "0 0 14px" }}>
          <a href={practiseUrl} style={{ background: COL.green, color: "#fff", padding: "10px 18px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 14, display: "inline-block" }}>
            Practise now →
          </a>
        </p>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: COL.muted, marginBottom: 12 }}>
        <span>My goal:</span>
        <select value={target} onChange={(e) => onSetTarget(e.target.value)} style={{ fontSize: 13, padding: "3px 6px", borderRadius: 6, border: `1px solid ${COL.border}` }}>
          <option value="">Pick a grade</option>
          {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
        </select>
        {target && home.recentScore != null && <span style={{ color: COL.dim }}>· aiming for grade {target}</span>}
      </label>

      {home.weak.length === 0 ? (
        <p style={{ fontSize: 13, color: COL.muted, margin: 0 }}>Nothing flagged to practise right now — great work, {name}.</p>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: COL.dim, marginBottom: 6 }}>What to practise next:</div>
          {home.weak.map((w) => (
            <div key={w.topic_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: `1px solid #cfe3d8` }}>
              <span style={{ flex: 1, fontSize: 13 }}>{w.topic_name}</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: heat(w.pct) }}>{w.pct}%</span>
              {w.practiseUrl && <a href={w.practiseUrl} style={{ fontSize: 12, color: COL.green, textDecoration: "none", fontWeight: 600 }}>Practise →</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChildCard({ child, token }: { child: Child; token: string }) {
  const [openId, setOpenId] = useState<string | null>(child.reports[0]?.id || null);
  const [target, setTarget] = useState(child.home?.targetGrade || "");
  const open = child.reports.find((r) => r.id === openId);
  const home = child.home;

  const saveTarget = async (g: string) => {
    setTarget(g);
    await fetch("/api/parent/set-target", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, linkId: child.linkId, target: g }) }).catch(() => {});
  };

  return (
    <div style={{ background: COL.card, border: `1px solid ${COL.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <h2 style={{ fontSize: 22, margin: 0 }}>{child.studentName}</h2>
        <span style={{ color: COL.dim, fontSize: 13 }}>{child.classLabel}</span>
      </div>
      {child.practiseUrl && (
        <p style={{ margin: "14px 0 18px" }}>
          <a href={child.practiseUrl} style={{ background: COL.green, color: "#fff", padding: "10px 18px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 14, display: "inline-block" }}>
            Practise with {firstName(child.studentName)} →
          </a>
        </p>
      )}

      {/* Pupil-facing "my progress / what to practise" view (read-only, same data). */}
      <PupilProgress child={child} target={target} onSetTarget={saveTarget} />

      {/* Home-learning course progress (synced from the self-study app). */}
      {child.course && (
        <div style={{ background: "#f4f6fc", border: "1px solid #d7dcec", borderRadius: 10, padding: "12px 16px", marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#1E2761", marginBottom: 8 }}>Home science course</div>
          <div style={{ display: "flex", gap: 18, fontSize: 14 }}>
            <span><strong>👑 {child.course.crowns}</strong> lessons</span>
            <span><strong>💎 {child.course.xp}</strong> XP</span>
            <span><strong>🔥 {child.course.streak}</strong> day streak</span>
          </div>
        </div>
      )}

      {/* Home: parent summary line. The weak topics + goal live in the pupil
          view above (single source of truth); this is the parent's framing. */}
      {home && (home.enabled ? (
        home.recentScore != null && (
          <div style={{ background: "#f7f5ef", border: `1px solid ${COL.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 13, color: COL.muted }}>
            <strong style={{ color: COL.text }}>For you:</strong> {firstName(child.studentName)} is averaging{" "}
            <strong style={{ color: heat(home.recentScore) }}>{home.recentScore}%</strong> on recent practice
            {target ? <> and is working toward grade {target}.</> : <>. Help {firstName(child.studentName)} set a goal above.</>}
            {" "}The topics above are where a few minutes tonight will help most.
          </div>
        )
      ) : (
        <div style={{ background: "#f7f5ef", border: `1px dashed ${COL.border}`, borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 13, color: COL.muted }}>
          <strong>Home practice</strong> — personalised practice and a target tracker for {firstName(child.studentName)}. Ask your school to enable it, or subscribe.
        </div>
      ))}

      {child.reports.length === 0 ? (
        <p style={{ color: COL.muted, fontSize: 14 }}>No reports yet — the first arrives at the end of the school week.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {child.reports.map((r) => (
              <button key={r.id} onClick={() => setOpenId(r.id)}
                style={{ border: `1px solid ${r.id === openId ? COL.text : COL.border}`, background: r.id === openId ? COL.text : "#fff", color: r.id === openId ? "#fff" : COL.muted, borderRadius: 999, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>
                Week of {r.weekStart}
              </button>
            ))}
          </div>
          {open && (
            <iframe title={`Report ${open.weekStart}`} srcDoc={open.html} sandbox=""
              style={{ width: "100%", height: 520, border: `1px solid ${COL.border}`, borderRadius: 8, background: "#fff" }} />
          )}
        </>
      )}

      <p style={{ fontSize: 11, color: COL.dim, marginTop: 14 }}>
        <a href={`/parent/unsubscribe?t=${encodeURIComponent(child.unsubscribeToken)}`} style={{ color: COL.dim }}>Stop emails about {firstName(child.studentName)}</a>
      </p>
    </div>
  );
}

function PortalInner() {
  useApplyAccessibilityPrefs();
  const params = useSearchParams();
  const token = params.get("t") || "";
  const [data, setData] = useState<{ guardianName: string | null; children: Child[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) { setErr("This link is missing its access code."); return; }
    (async () => {
      try {
        const r = await fetch(`/api/parent/portal?t=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Couldn't load your reports.");
        setData(d);
      } catch (e: any) { setErr(e.message); }
    })();
  }, [token]);

  if (err) return <Centered>{err}</Centered>;
  if (!data) return <Centered>Loading…</Centered>;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: COL.dim, marginTop: 4 }}>Houchell · Parent</div>
        <AccessibilityMenu variant="light" />
      </div>
      <h1 style={{ fontSize: 30, margin: "0 0 6px" }}>{data.guardianName ? `Hello, ${data.guardianName}` : "Your child's science"}</h1>
      <p style={{ color: COL.muted, margin: "0 0 28px", fontSize: 15 }}>
        {data.children.length ? "Weekly progress and a few minutes of the right practice — best looked at together." : "No active children are linked to this account yet."}
      </p>

      {/* Free, self-paced KS3 home-learning course (no login, works offline). Open to every parent. */}
      <a href="/learn/springboard.html" target="_blank" rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", gap: 13, background: "#eef5f1", border: `1px solid #cfe3d8`, borderRadius: 12, padding: 16, marginBottom: 24, textDecoration: "none", color: COL.text }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>📚</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>Revise at home — KS3 science course</span>
          <span style={{ display: "block", fontSize: 13, color: COL.muted, marginTop: 2 }}>A free, self-paced course following the class lessons: learn the key words aloud, practise, and grow a streak.</span>
        </span>
        <span style={{ color: COL.green, fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>Open →</span>
      </a>

      {data.children.map((c) => <ChildCard key={c.linkId} child={c} token={token} />)}
      <p style={{ fontSize: 11, color: COL.dim, textAlign: "center", marginTop: 24 }}>
        Reports reflect your child's class lessons and practice. Questions? Speak to their science teacher.
      </p>
      <p style={{ fontSize: 11, color: COL.dim, textAlign: "center", marginTop: 8, lineHeight: 1.6 }}>
        Your child's practice data is never used to train AI models, and is kept only as long as the school needs it.{" "}
        <a href="/trust-centre" style={{ color: COL.dim, textDecoration: "underline" }}>How we protect data →</a>
      </p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: COL.bg, color: COL.muted, fontSize: 14, padding: 24, textAlign: "center" }}>
      {children}
    </div>
  );
}

export default function ParentPortalPage() {
  return (
    <div style={{ minHeight: "100dvh", background: COL.bg, fontFamily: "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif", color: COL.text }}>
      <Suspense fallback={<Centered>Loading…</Centered>}>
        <PortalInner />
      </Suspense>
    </div>
  );
}
