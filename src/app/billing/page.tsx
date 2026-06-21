"use client";
import { useEffect, useState, Suspense } from "react";
import { sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

// Billing & plans (NOW plan E2). Stripe-backed when configured; otherwise plans
// show but checkout is disabled. AI spend today surfaced for cost governance.

interface Plan { slug: string; name: string; price_pence: number; interval: string; audience: string; features: Record<string, any>; stripe_price_id: string | null; }
interface Status { configured: boolean; plans: Plan[]; entitlement: { plan: string; active: boolean; features: Record<string, any> }; usage: { todayGBP: number; dailyCapGBP?: number | null; orgMonthGBP?: number | null; orgMonthlyCapGBP?: number | null }; }

const price = (p: Plan) => p.price_pence === 0 ? "Free" : `£${(p.price_pence / 100).toFixed(2)}/${p.interval === "month" ? "mo" : p.interval}`;

function BillingContent() {
  const [data, setData] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => fetch("/api/billing/status", { headers: { authorization: `Bearer ${sk.auth.getToken()}` } })
    .then((r) => r.json()).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const go = async (body: any, key: string) => {
    setBusy(key); setErr("");
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { authorization: `Bearer ${sk.auth.getToken()}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Checkout failed");
      window.location.href = d.url;
    } catch (e: any) { setErr(e.message); setBusy(""); }
  };

  if (!data) return <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12 }}>{err ? `Error: ${err}` : "Loading…"}</div>;
  const current = data.entitlement;

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} /><span>Billing</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Your <em style={{ fontStyle: "italic", color: C.grn }}>plan</em>.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: "52ch", lineHeight: 1.55 }}>
        On <strong>{current.plan}</strong>{current.active ? "" : " (free)"}. AI used today: <strong>£{data.usage.todayGBP.toFixed(2)}</strong>
        {data.usage.dailyCapGBP ? <> / £{data.usage.dailyCapGBP.toFixed(2)} cap</> : null}.
        {data.usage.orgMonthGBP != null && (
          <> Your school this month: <strong>£{data.usage.orgMonthGBP.toFixed(2)}</strong>
            {data.usage.orgMonthlyCapGBP ? <> / £{data.usage.orgMonthlyCapGBP.toFixed(0)} budget</> : null}.</>
        )}
        {current.active && <> · <button onClick={() => go({ portal: true }, "portal")} disabled={busy === "portal"} style={{ background: "none", border: "none", color: C.muted, textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Manage</button></>}
      </p>
      {data.usage.orgMonthlyCapGBP && data.usage.orgMonthGBP != null && (
        <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", maxWidth: 320, marginBottom: 24 }}>
          <div style={{ width: `${Math.min(100, Math.round((data.usage.orgMonthGBP / data.usage.orgMonthlyCapGBP) * 100))}%`, height: "100%", background: data.usage.orgMonthGBP >= data.usage.orgMonthlyCapGBP ? C.red : C.grn, opacity: 0.8 }} />
        </div>
      )}

      {!data.configured && <div style={{ padding: "10px 14px", background: C.ambS, border: `1px solid ${C.amb}`, borderRadius: 6, color: C.amb, fontSize: 13, marginBottom: 20 }}>Stripe isn't configured yet (set STRIPE_SECRET_KEY + each plan's stripe_price_id). Plans show below; checkout activates once it's set.</div>}
      {err && <div style={{ padding: "10px 14px", background: C.redS, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 13, marginBottom: 20 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
        {data.plans.map((p) => {
          const isCurrent = current.plan === p.slug;
          const canBuy = data.configured && !!p.stripe_price_id && !isCurrent;
          return (
            <div key={p.slug} style={{ border: `1px solid ${isCurrent ? C.grn : C.rule}`, borderRadius: 10, padding: 20, background: C.surface }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>{p.audience}</div>
              <div style={{ fontFamily: C.serif, fontSize: 24, color: C.text, margin: "2px 0" }}>{p.name}</div>
              <div style={{ fontFamily: C.mono, fontSize: 14, color: C.text, marginBottom: 12 }}>{price(p)}</div>
              <ul style={{ margin: "0 0 16px", padding: "0 0 0 16px", fontSize: 12.5, color: C.muted, lineHeight: 1.7 }}>
                {Object.entries(p.features).filter(([, v]) => v).map(([k]) => <li key={k}>{k.replace(/_/g, " ")}</li>)}
              </ul>
              {isCurrent ? <div style={{ fontFamily: C.mono, fontSize: 12, color: C.grn }}>✓ Current plan</div>
                : p.audience === "school" ? <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>Contact us — per-pupil</div>
                : <Btn onClick={() => go({ plan: p.slug }, p.slug)} disabled={!canBuy || busy === p.slug} title={canBuy ? "" : "Checkout not available yet"}>{busy === p.slug ? "…" : "Choose"}</Btn>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 36, paddingTop: 18, borderTop: `1px solid ${C.rule}`, display: "flex", gap: 16, flexWrap: "wrap", fontFamily: C.mono, fontSize: 11.5, color: C.dim }}>
        <a href={`/api/account/export`} onClick={(e) => { e.preventDefault(); fetch("/api/account/export", { headers: { authorization: `Bearer ${sk.auth.getToken()}` } }).then((r) => r.blob()).then((b) => { const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "feynman-data-export.json"; a.click(); URL.revokeObjectURL(u); }); }} style={{ color: C.muted, textDecoration: "none", cursor: "pointer" }}>⬇ Export my data</a>
        <a href="/trust-centre" style={{ color: C.muted, textDecoration: "none" }}>Trust Centre</a>
        <a href="/privacy" style={{ color: C.muted, textDecoration: "none" }}>Privacy</a>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return <AppShell><Suspense fallback={null}><BillingContent /></Suspense></AppShell>;
}
