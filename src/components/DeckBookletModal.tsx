"use client";
// Deck → public revision booklet: generate & review modal.
//
// Generates a DRAFT pupil-facing revision booklet (house style) from the open
// deck via /api/deck-to-booklet, previews it in an iframe, and lets the teacher
// download the .html. It does NOT publish to interactive-science.com — the
// teacher reviews, downloads, and commits it to the site (then runs
// add_retrieval_widget.py to drop in the live practice widget). The same authored
// deck thus feeds both the gated class resource AND the public booklet.
import { useState } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { sk } from "@/lib/sk";

const label: React.CSSProperties = { fontSize: 11, fontFamily: C.mono, color: C.dim, fontWeight: 600, letterSpacing: "0.04em" };

function slugify(s: string): string {
  return (s || "revision-booklet").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "revision-booklet";
}

export function DeckBookletModal({ slides, lessonTitle = "", onClose }: { slides: any[]; lessonTitle?: string; onClose: () => void; }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [html, setHtml] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true); setErr("");
    try {
      const token = sk.auth.getToken();
      const r = await fetch("/api/deck-to-booklet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slides, lessonTitle }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Generation failed (${r.status})`);
      if (!d.html) throw new Error("No booklet was returned — try again.");
      setHtml(d.html);
    } catch (e: any) {
      setErr(e?.message || "Generation failed.");
    }
    setBusy(false);
  };

  const download = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(lessonTitle)}-revision.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(26,23,20,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 760, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ ...label, color: C.grn }}>📖 Revision booklet</div>
            <div style={{ fontFamily: C.serif, fontSize: 22, color: C.text, lineHeight: 1.2 }}>Generate a public revision booklet</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>A pupil-facing revision guide built from this deck, in the interactive-science house style. Review &amp; download — it isn&rsquo;t published until you add it to the site.</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {!html ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 14, border: `1px dashed ${C.border}`, borderRadius: 8, background: C.bg }}>
            <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>Reads the text on your slides and writes a self-study booklet (sections, key terms, watch-outs, and a self-quiz).</span>
            <Btn onClick={generate} disabled={busy}>{busy ? "Writing the booklet…" : "✦ Generate from deck"}</Btn>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <Btn onClick={download}>⤓ Download .html</Btn>
              <Btn v="soft" onClick={generate} disabled={busy}>{busy ? "Regenerating…" : "↻ Regenerate"}</Btn>
              <span style={{ fontSize: 11, color: C.dim, marginLeft: "auto" }}>Preview below · review before publishing</span>
            </div>
            <iframe
              title="Revision booklet preview"
              srcDoc={html}
              style={{ width: "100%", height: "60vh", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff" }}
            />
          </>
        )}

        {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.redS, color: C.red, fontSize: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
