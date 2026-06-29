"use client";
import { useState } from "react";
import { sb } from "../lib/supabase";
import { C } from "../lib/theme";
import { Btn, Card, Inp } from "./ui";

/* Self-service account settings: change display name and password. Opened from
 * the header for any signed-in user (teacher or pupil). */
export function AccountModal({ user, onClose, onUpdated }) {
  const [name, setName] = useState(user?.profile?.display_name || user?.user_metadata?.display_name || "");
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const saveName = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try { await sb.auth.updateName(name.trim()); onUpdated?.(name.trim()); setMsg("Name updated."); }
    catch (e) { setErr(e.message || "Could not update name"); }
    setBusy(false);
  };
  const savePw = async () => {
    setErr(""); setMsg("");
    if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try { await sb.auth.updatePassword(pw); setPw(""); setPw2(""); setMsg("Password changed."); }
    catch (e) { setErr(e.message || "Could not change password"); }
    setBusy(false);
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "var(--font-plex), -apple-system, sans-serif" }}>
      <Card onMouseDown={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.txt }}>Account</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 18, color: C.dim, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: C.mid, marginBottom: 18 }}>{user?.email}</div>

        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: C.dim, marginBottom: 8 }}>Display name</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <Inp value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
          <Btn onClick={saveName} disabled={busy || !name.trim()} style={{ whiteSpace: "nowrap" }}>Save</Btn>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: C.dim, marginBottom: 8 }}>Change password</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Inp type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (min 6)" />
          <Inp type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" onKeyDown={e => e.key === "Enter" && savePw()} />
          <Btn onClick={savePw} disabled={busy || !pw || !pw2}>Change password</Btn>
        </div>

        {msg && <div style={{ color: C.grn, fontSize: 13, padding: "10px 12px", background: C.grnS, borderRadius: 8, marginTop: 14 }}>{msg}</div>}
        {err && <div style={{ color: C.red, fontSize: 13, padding: "10px 12px", background: C.redS, borderRadius: 8, marginTop: 14 }}>{err}</div>}
      </Card>
    </div>
  );
}
