"use client";
import { useEffect } from "react";

// Present mode is fullscreen on a projector, so its error fallback stays dark
// (a bright light-themed error card mid-lesson is jarring). Offers a quick
// retry and a calm exit back to the deck list.
export default function PresentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", color: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 460 }}>
        <div style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#888", marginBottom: 12 }}>Presentation hit a problem</div>
        <div style={{ fontSize: 22, marginBottom: 10 }}>This slide couldn’t be shown</div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#aaa", margin: "0 0 24px" }}>Try again to keep presenting, or exit to the deck list.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={() => reset()} style={{ padding: "10px 22px", fontSize: 15, fontWeight: 600, color: "#000", background: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Try again</button>
          <button onClick={() => { window.location.href = "/slides"; }} style={{ padding: "10px 18px", fontSize: 14, color: "#ddd", background: "transparent", border: "1px solid #444", borderRadius: 8, cursor: "pointer" }}>Exit to slides</button>
        </div>
      </div>
    </div>
  );
}
