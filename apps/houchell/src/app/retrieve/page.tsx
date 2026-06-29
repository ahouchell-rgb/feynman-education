"use client";
import { AppShell } from "@/components/AppShell";
import { C } from "@/lib/theme";
import { RETRIEVAL_ORIGIN } from "@/lib/interactive";

// Retrieve is the retrieval-practice app, surfaced full-bleed inside the shell.
// It runs as its own deployment (see RETRIEVAL_ORIGIN); the iframe keeps the
// visitor on this domain. The retrieval app must list this origin in its
// ALLOWED_FRAME_ANCESTORS for the embed to render.
export default function RetrievePage() {
  return (
    <AppShell>
      <div style={{ marginBottom: 14, fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>Retrieve · low-stakes practice</span>
        <a href={RETRIEVAL_ORIGIN} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", color: C.muted, textDecoration: "none", letterSpacing: "0.04em" }}>Open ↗</a>
      </div>
      <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, background: "#fff", height: "calc(100dvh - 90px)" }}>
        <iframe
          src={RETRIEVAL_ORIGIN}
          title="Retrieval practice"
          style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#fff" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </AppShell>
  );
}
