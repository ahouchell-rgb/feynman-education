"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { C } from "@/lib/theme";

/* Lightweight presenter-notes pop-out (item 6). A teacher running laptop +
   projector pops this out to their laptop screen to read speaker notes off the
   projected image. It mirrors the main Present window via localStorage (read
   once on open, so it shows the latest immediately) + BroadcastChannel (for live
   updates as the teacher advances). It does NOT control the deck — it's a passive
   mirror, so it can never desync the live show. */
export default function PresenterNotesPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id || "");
  const [state, setState] = useState(null);

  useEffect(() => {
    const KEY = `sk_present_notes:${id}`;
    const apply = (raw) => { try { if (raw) setState(JSON.parse(raw)); } catch {} };
    // initial read
    try { apply(localStorage.getItem(KEY)); } catch {}
    // live updates via BroadcastChannel, with a storage-event fallback for
    // browsers/contexts where the channel isn't delivered.
    let ch;
    try { ch = new BroadcastChannel(KEY); ch.onmessage = (e) => apply(e.data); } catch {}
    const onStorage = (e) => { if (e.key === KEY) apply(e.newValue); };
    window.addEventListener("storage", onStorage);
    document.title = "Presenter notes";
    return () => { try { ch?.close(); } catch {} window.removeEventListener("storage", onStorage); };
  }, [id]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#141414", color: "#e8e8e8",
                  fontFamily: "system-ui, sans-serif", padding: 24, display: "flex", flexDirection: "column", gap: 18, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#777" }}>Presenter notes</div>
        <div style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 13, color: "#888" }}>
          {state ? `slide ${state.n}/${state.total}` : "—"}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ fontSize: 22, lineHeight: 1.55, whiteSpace: "pre-wrap", color: state?.notes ? "#f0f0f0" : C.muted }}>
          {state ? (state.notes || "No notes for this slide.") : "Waiting for the presentation…"}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#777", marginBottom: 6 }}>Next</div>
        <div style={{ fontSize: 17, color: state?.isEnd ? C.muted : "#cfe4ef" }}>
          {state ? (state.isEnd ? "End of deck" : (state.next || "—")) : "—"}
        </div>
      </div>
    </div>
  );
}
