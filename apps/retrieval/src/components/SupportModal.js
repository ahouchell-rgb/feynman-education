"use client";
import { useState } from "react";
import { sb } from "../lib/supabase";
import { roleOf } from "../lib/roles";
import { C } from "../lib/theme";
import { Btn, Card, TA } from "./ui";

/* In-app "Help & support". Any signed-in user can send a message; it lands in
 * public.support_tickets and surfaces in Admin → Support for a moderator to
 * action. Self-contained — opened from the header Help button. */
export function SupportModal({ user, onClose }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true); setErr("");
    try {
      await sb.q("support_tickets", { method: "POST", body: {
        user_id: user?.id,
        email: user?.email || null,
        display_name: user?.profile?.display_name || user?.user_metadata?.display_name || null,
        role: roleOf(user),
        page: typeof window !== "undefined" ? window.location.pathname : null,
        message: message.trim(),
      } });
      setSent(true);
    } catch (e) { setErr(e.message || "Couldn't send — please email schools@houchelleducation.com"); }
    setBusy(false);
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "var(--font-plex), -apple-system, sans-serif" }}>
      <Card onMouseDown={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.txt }}>Help &amp; support</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 18, color: C.dim, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>
        {sent ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ color: C.grn, fontSize: 14, padding: "12px 14px", background: C.grnS, borderRadius: 8, lineHeight: 1.5 }}>Thanks — your message is with our team. We'll reply by email{user?.email ? ` to ${user.email}` : ""}.</div>
            <Btn onClick={onClose} style={{ width: "100%" }}>Done</Btn>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: C.mid, marginBottom: 14, lineHeight: 1.5 }}>
              Found a bug, stuck, or have a question? Send us a message — or email <strong style={{ color: C.txt }}>schools@houchelleducation.com</strong>.
            </div>
            <TA value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="What's happening? Include the class or question if relevant." />
            {err && <div style={{ color: C.red, fontSize: 13, padding: "10px 12px", background: C.redS, borderRadius: 8, marginTop: 12 }}>{err}</div>}
            <Btn onClick={send} disabled={busy || !message.trim()} style={{ width: "100%", marginTop: 14 }}>{busy ? "Sending..." : "Send message"}</Btn>
          </>
        )}
      </Card>
    </div>
  );
}
