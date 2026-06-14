"use client";
// Route-level error boundary. Without it, an unexpected render error (e.g. a
// malformed row from the API) white-screens the whole app mid-practice. This
// keeps the pupil in a recoverable state with a one-tap retry.
export default function Error({ error, reset }) {
  return (
    <div style={{ minHeight: "100dvh", background: "#faf7f0", color: "#1c1a14", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "var(--font-plex), -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>retrieval<span style={{ color: "#c2410c" }}>.</span></div>
        <div style={{ fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 15, color: "#6b6657", marginTop: 10, marginBottom: 22, lineHeight: 1.5 }}>
          Something went wrong — your progress is saved. Try again.
        </div>
        <button
          onClick={() => reset()}
          style={{ padding: "11px 20px", fontSize: 14, fontWeight: 600, borderRadius: 8, border: "none", background: "#1c1a14", color: "#faf7f0", cursor: "pointer", fontFamily: "inherit" }}
        >
          Try again
        </button>
        {error?.digest && <div style={{ fontSize: 11, color: "#9b968a", marginTop: 16, fontFamily: "monospace" }}>ref: {error.digest}</div>}
      </div>
    </div>
  );
}
