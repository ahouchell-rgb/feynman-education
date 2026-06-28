"use client";
import { useEffect } from "react";
import { C } from "@/lib/theme";

// App-level error boundary. Catches render/runtime errors in any route segment
// so a single bad deck/lesson/component shows a recoverable card instead of a
// blank white screen mid-lesson. `reset()` re-renders the segment.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "28px 30px", textAlign: "center" }}>
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: C.dim, marginBottom: 10 }}>Something went wrong</div>
        <h1 style={{ fontFamily: C.serif, fontSize: 28, color: C.text, margin: "0 0 10px" }}>This page hit a problem</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: C.muted, margin: "0 0 22px" }}>
          Your work is saved as you go, so nothing should be lost. Try again, or head back.
        </p>
        {error?.message && (
          <pre style={{ textAlign: "left", fontFamily: C.mono, fontSize: 11, color: C.dim, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", margin: "0 0 22px", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>
            {error.message}{error.digest ? `\n(${error.digest})` : ""}
          </pre>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={() => reset()} style={{ padding: "9px 18px", borderRadius: 6, border: "none", background: C.accent, color: C.accentFg, fontFamily: C.mono, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Try again</button>
          <button onClick={() => { window.location.href = "/"; }} style={{ padding: "9px 18px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: C.mono, fontSize: 12, cursor: "pointer" }}>Back to this week</button>
        </div>
      </div>
    </div>
  );
}
