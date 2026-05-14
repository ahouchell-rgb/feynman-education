"use client";
import { useEffect, useState } from "react";
import { useAuth, sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Inp, Card } from "@/lib/primitives";

// Keep in sync with src/app/api/chat-with-lesson/route.js
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;
const GBP_PER_USD = 0.79;
const DAILY_CAP_GBP = 1.0;

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

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await sk.q("profiles", { method: "PATCH", params: { id: `eq.${profile.id}` }, body: form });
      setMsg("Saved ✓"); setProfile({ ...profile, ...form });
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const used = usage ? costGBP(usage.input_tokens, usage.output_tokens) : 0;
  const pct = Math.min(100, (used / DAILY_CAP_GBP) * 100);
  const barColor = pct >= 90 ? C.red : pct >= 70 ? C.amb : C.grn;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 440, padding: 24 }}>
        <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, marginBottom: 20 }}>Settings</div>

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
              £{used.toFixed(3)} / £{DAILY_CAP_GBP.toFixed(2)}
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width .2s" }} />
          </div>
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.dim, display: "flex", gap: 12 }}>
            <span>{usage?.input_tokens?.toLocaleString() ?? 0} input tok</span>
            <span>{usage?.output_tokens?.toLocaleString() ?? 0} output tok</span>
            <span>{usage?.request_count ?? 0} request{usage?.request_count === 1 ? "" : "s"}</span>
          </div>
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
