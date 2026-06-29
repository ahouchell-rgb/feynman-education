"use client";
import { useEffect, useState } from "react";
import { useAuth, sk } from "@/lib/sk";
import { ms } from "@/lib/ms";
import { google } from "@/lib/google";
import { C } from "@/lib/theme";
import { Btn, Inp, Card } from "@/lib/primitives";
import { useDialog } from "@/lib/useDialog";

// Keep in sync with src/app/api/chat-with-lesson/route.js
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;
const GBP_PER_USD = 0.79;
const DAILY_CAP_GBP = Number(process.env.NEXT_PUBLIC_AI_DAILY_CAP_GBP) || 0; // £/day; 0 = unlimited (set NEXT_PUBLIC_AI_DAILY_CAP_GBP to show a cap)

function costGBP(input, output) {
  return (input / 1e6) * INPUT_USD_PER_MTOK * GBP_PER_USD
       + (output / 1e6) * OUTPUT_USD_PER_MTOK * GBP_PER_USD;
}

export function Settings({ onClose }) {
  const { profile, setProfile } = useAuth();
  const [form, setForm] = useState({ full_name: profile?.full_name || "", retrieval_email: profile?.retrieval_email || "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [usage, setUsage] = useState(null);
  const [msStatus, setMsStatus] = useState(null); // null = loading, {connected:false} = not, {connected:true,...} = yes
  const [msBusy, setMsBusy] = useState(false);
  const [gStatus, setGStatus] = useState(null); // Google Drive connection status (same shape as msStatus)
  const [gBusy, setGBusy] = useState(false);

  // Focus trap + Escape + focus restore on close (keyboard parity with the
  // click-outside backdrop). Replaces the previous Escape-only handler.
  const dialogRef = useDialog(onClose);

  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const r = await sk.q("daily_token_usage", {
          params: { teacher_id: `eq.${profile.id}`, day: `eq.${today}` },
        });
        if (alive) setUsage((r && r[0]) || { input_tokens: 0, output_tokens: 0, request_count: 0 });
      } catch {
        if (alive) setUsage({ input_tokens: 0, output_tokens: 0, request_count: 0 });
      }
    })();
    return () => { alive = false; };
  }, [profile?.id]);

  // Microsoft 365 connection status
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    (async () => {
      const s = await ms.getStatus(profile.id);
      if (alive) setMsStatus(s || { connected: false });
    })();
    return () => { alive = false; };
  }, [profile?.id]);

  const connectMicrosoft = () => {
    if (!profile?.id) return;
    window.location.href = ms.startUrl(profile.id);
  };

  const disconnectMicrosoft = async () => {
    if (!profile?.id) return;
    if (!confirm("Disconnect your Microsoft account? Any PowerPoint files in OneDrive stay there, but you won't be able to edit them inside Houchell until you reconnect.")) return;
    setMsBusy(true);
    try {
      await ms.disconnect(profile.id);
      setMsStatus({ connected: false });
    } catch (e) {
      alert("Couldn't disconnect: " + (e.message || "unknown error"));
    }
    setMsBusy(false);
  };

  // Google Drive connection status
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    (async () => {
      const s = await google.getStatus(profile.id);
      if (alive) setGStatus(s || { connected: false });
    })();
    return () => { alive = false; };
  }, [profile?.id]);

  const connectGoogle = () => {
    if (!profile?.id) return;
    window.location.href = google.startUrl(profile.id);
  };

  const disconnectGoogle = async () => {
    if (!profile?.id) return;
    if (!confirm("Disconnect your Google account? Your files in Drive stay there, but you won't be able to import from or save to Drive inside Houchell until you reconnect.")) return;
    setGBusy(true);
    try {
      await google.disconnect(profile.id);
      setGStatus({ connected: false });
    } catch (e) {
      alert("Couldn't disconnect: " + (e.message || "unknown error"));
    }
    setGBusy(false);
  };

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await sk.q("profiles", { method: "PATCH", params: { id: `eq.${profile.id}` }, body: form });
      setMsg("Saved ✓"); setProfile({ ...profile, ...form });
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const used = usage ? costGBP(usage.input_tokens, usage.output_tokens) : 0;
  const pct = DAILY_CAP_GBP > 0 ? Math.min(100, (used / DAILY_CAP_GBP) * 100) : 0;
  const barColor = pct >= 90 ? C.red : pct >= 70 ? C.amb : C.grn;

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, padding: 24, outline: "none" }}>
        <div id="settings-title" style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, marginBottom: 20 }}>Settings</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 6 }}>Display name</div>
          <Inp value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 4 }}>Your role</div>
          <div style={{ padding: "8px 12px", borderRadius: 6, background: C.bg, fontSize: 13, fontFamily: C.mono, color: C.text }}>{profile?.role}</div>
        </div>

        {/* Today's Claude usage */}
        <div style={{ marginBottom: 16, padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, letterSpacing: "0.04em" }}>
              Today's Claude usage
            </div>
            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.dim }}>
              {DAILY_CAP_GBP > 0 ? `£${used.toFixed(3)} / £${DAILY_CAP_GBP.toFixed(2)}` : `£${used.toFixed(3)} · no limit`}
            </div>
          </div>
          {DAILY_CAP_GBP > 0 && (
            <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width .2s" }} />
            </div>
          )}
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.dim, display: "flex", gap: 12 }}>
            <span>{usage?.input_tokens?.toLocaleString() ?? 0} input tok</span>
            <span>{usage?.output_tokens?.toLocaleString() ?? 0} output tok</span>
            <span>{usage?.request_count ?? 0} request{usage?.request_count === 1 ? "" : "s"}</span>
          </div>
        </div>

        {/* Microsoft 365 connection */}
        <div style={{ marginBottom: 16, padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, letterSpacing: "0.04em", marginBottom: 8 }}>
            Microsoft 365 (for PowerPoint editing)
          </div>
          {msStatus === null ? (
            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.dim }}>Loading…</div>
          ) : msStatus.connected ? (
            <>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.grn }} />
                {msStatus.name || "Connected"}
              </div>
              {msStatus.email && (
                <div style={{ fontSize: 11, fontFamily: C.mono, color: C.dim, marginBottom: 10 }}>{msStatus.email}</div>
              )}
              <Btn v="ghost" disabled={msBusy} onClick={disconnectMicrosoft} style={{ fontSize: 11, padding: "4px 10px", color: C.red, borderColor: "rgba(185,90,60,0.25)" }}>
                {msBusy ? "Disconnecting…" : "Disconnect"}
              </Btn>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, fontFamily: C.mono, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
                Connect your school Microsoft account to edit PowerPoints directly inside Houchell. Files are stored in your own OneDrive.
              </div>
              <Btn v="ghost" onClick={connectMicrosoft} style={{ fontSize: 12, padding: "6px 12px" }}>
                Connect Microsoft account →
              </Btn>
            </>
          )}
        </div>

        {/* Google Drive connection */}
        <div style={{ marginBottom: 16, padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, letterSpacing: "0.04em", marginBottom: 8 }}>
            Google Drive (import Slides / save .pptx)
          </div>
          {gStatus === null ? (
            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.dim }}>Loading…</div>
          ) : gStatus.connected ? (
            <>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.grn }} />
                {gStatus.name || "Connected"}
              </div>
              {gStatus.email && (
                <div style={{ fontSize: 11, fontFamily: C.mono, color: C.dim, marginBottom: 10 }}>{gStatus.email}</div>
              )}
              <Btn v="ghost" disabled={gBusy} onClick={disconnectGoogle} style={{ fontSize: 11, padding: "4px 10px", color: C.red, borderColor: "rgba(185,90,60,0.25)" }}>
                {gBusy ? "Disconnecting…" : "Disconnect"}
              </Btn>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, fontFamily: C.mono, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
                Connect your Google account to import Google Slides (and PowerPoint files) straight from Drive, and save decks back as .pptx. Houchell only ever sees the files you pick.
              </div>
              <Btn v="ghost" onClick={connectGoogle} style={{ fontSize: 12, padding: "6px 12px" }}>
                Connect Google account →
              </Btn>
            </>
          )}
        </div>

        {msg &&<div style={{ padding: "8px 10px", borderRadius: 6, background: msg.startsWith("Error") ? C.redS : C.grnS, color: msg.startsWith("Error") ? C.red : C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{msg}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={save} disabled={busy} style={{ flex: 1 }}>{busy ? "Saving..." : "Save"}</Btn>
          <Btn v="ghost" onClick={onClose}>Close</Btn>
        </div>
      </Card>
    </div>
  );
}
