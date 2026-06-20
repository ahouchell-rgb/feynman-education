"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// Public, password-less parent portal. Reached via the token in the weekly
// report emails: /parent?t=<token>. Lists the parent's consented children,
// their latest report, history, and a "practise now" link into retrieval-app.
// No teacher auth, no AppShell — this page is intentionally outside the gate.

const COL = {
  bg: "#f4f4f2", card: "#fff", border: "#e5e5e0", text: "#1a1a1a", muted: "#666", dim: "#999", green: "#1a7f5a",
};

interface Report { id: string; weekStart: string; html: string; emailed: boolean; }
interface Child { linkId: string; studentName: string; classLabel: string; practiseUrl: string | null; unsubscribeToken: string; reports: Report[]; }

function firstName(s: string) { return (s || "").trim().split(/\s+/)[0] || s; }

function ChildCard({ child }: { child: Child }) {
  const [openId, setOpenId] = useState<string | null>(child.reports[0]?.id || null);
  const open = child.reports.find((r) => r.id === openId);
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
      <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: COL.dim, marginBottom: 6 }}>Feynman · Parent</div>
      <h1 style={{ fontSize: 30, margin: "0 0 6px" }}>{data.guardianName ? `Hello, ${data.guardianName}` : "Your child's science"}</h1>
      <p style={{ color: COL.muted, margin: "0 0 28px", fontSize: 15 }}>
        {data.children.length ? "Weekly progress and a few minutes of the right practice." : "No active children are linked to this account yet."}
      </p>
      {data.children.map((c) => <ChildCard key={c.linkId} child={c} />)}
      <p style={{ fontSize: 11, color: COL.dim, textAlign: "center", marginTop: 24 }}>
        Reports reflect your child's class lessons and practice. Questions? Speak to their science teacher.
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
