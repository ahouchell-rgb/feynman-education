"use client";
import { useState } from "react";
import { useAuth, sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Inp, Card } from "@/lib/primitives";

export function Settings({ onClose }) {
  const { profile, setProfile } = useAuth();
  const [form, setForm] = useState({ full_name: profile?.full_name || "", retrieval_email: profile?.retrieval_email || "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await sk.q("profiles", { method: "PATCH", params: { id: `eq.${profile.id}` }, body: form });
      setMsg("Saved ✓"); setProfile({ ...profile, ...form });
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 400, padding: 24 }}>
        <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, marginBottom: 20 }}>Settings</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 6 }}>Display name</div>
          <Inp value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 4 }}>Your role</div>
          <div style={{ padding: "8px 12px", borderRadius: 6, background: C.bg, fontSize: 13, fontFamily: C.mono, color: C.text }}>{profile?.role}</div>
        </div>
        {msg && <div style={{ padding: "8px 10px", borderRadius: 6, background: msg.startsWith("Error") ? C.redS : C.grnS, color: msg.startsWith("Error") ? C.red : C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={save} disabled={busy} style={{ flex: 1 }}>{busy ? "Saving..." : "Save"}</Btn>
          <Btn v="ghost" onClick={onClose}>Close</Btn>
        </div>
      </Card>
    </div>
  );
}
