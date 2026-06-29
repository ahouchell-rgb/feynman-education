"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// Public unsubscribe confirmation. The email links here (GET) and the parent
// confirms with a button that POSTs — so email scanners that prefetch links
// can't silently revoke consent.

const COL = { bg: "#f4f4f2", card: "#fff", border: "#e5e5e0", text: "#1a1a1a", muted: "#666", red: "#b95a3c" };

function Inner() {
  const token = useSearchParams().get("t") || "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const confirm = async () => {
    setState("busy");
    try {
      const r = await fetch("/api/parent/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't unsubscribe.");
      setMsg(d.studentName ? `You'll no longer receive emails about ${d.studentName}.` : "You've been unsubscribed.");
      setState("done");
    } catch (e: any) { setMsg(e.message); setState("error"); }
  };

  return (
    <div style={{ background: COL.card, border: `1px solid ${COL.border}`, borderRadius: 12, padding: 28, maxWidth: 420, textAlign: "center" }}>
      {state === "done" ? (
        <p style={{ color: COL.text, fontSize: 15, margin: 0 }}>{msg}</p>
      ) : (
        <>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Stop these emails?</h1>
          <p style={{ color: COL.muted, fontSize: 14, margin: "0 0 20px" }}>You can ask your child's teacher to turn them back on at any time.</p>
          {state === "error" && <p style={{ color: COL.red, fontSize: 13 }}>{msg}</p>}
          <button onClick={confirm} disabled={state === "busy" || !token}
            style={{ background: COL.red, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: token ? "pointer" : "default", opacity: token ? 1 : 0.5 }}>
            {state === "busy" ? "Unsubscribing…" : "Yes, unsubscribe"}
          </button>
        </>
      )}
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: COL.bg, padding: 24, fontFamily: "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" }}>
      <Suspense fallback={null}><Inner /></Suspense>
    </div>
  );
}
