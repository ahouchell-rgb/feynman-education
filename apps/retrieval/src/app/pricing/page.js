"use client";
import { useState } from "react";
import { SUPA_URL, SUPA_KEY } from "../../lib/supabase";
import { C } from "../../lib/theme";

// Public pricing / marketing page (no auth). Mirrors the rate card and drops
// pilot / quote requests into the `leads` table (anon insert allowed by RLS).

const BRAND = "Feynman Education";

const TIERS = [
  { key: "free", name: "Starter", price: "Free", sub: "Try it out", href: "/?login=1",
    features: ["1 class, 1 teacher", "AI marking + retrieval practice", "Up to 2,000 marks / month"], cta: "Start free" },
  { key: "essentials", name: "Essentials", price: "£890", sub: "per school / year", href: "#contact",
    features: ["Whole science, up to 600 pupils", "Shared question bank", "Core dashboards & support"], cta: "Request a quote" },
  { key: "core", name: "Core", price: "£2.95–£4.95", sub: "per pupil / year", highlight: true, href: "#contact",
    features: ["Unlimited pupils & teachers", "Your own questions + full bank", "Leadership dashboards & MIS"], cta: "Request a quote" },
  { key: "single_cohort", name: "Single cohort", price: "£8.95", sub: "per pupil / year", href: "#contact",
    features: ["One year group (e.g. Year 11)", "Full Core features", "Easy to expand later"], cta: "Request a quote" },
];

const CORE_BANDS = [
  ["1–249", "£4.95"], ["250–599", "£4.50"], ["600–999", "£3.95"], ["1,000–1,499", "£3.50"], ["1,500+", "£2.95"],
];

export default function Pricing() {
  const [form, setForm] = useState({ school_name: "", contact_name: "", email: "", role: "", pupils: "", plan_interest: "", message: "" });
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.school_name.trim()) { setState("error"); return; }
    setState("sending");
    try {
      // Direct anon insert with return=minimal: visitors can submit a lead but not
      // read the leads table (only moderators can), so we must NOT ask PostgREST to
      // return the inserted row — that would trip the SELECT policy.
      const r = await fetch(`${SUPA_URL}/rest/v1/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: "return=minimal" },
        body: JSON.stringify({ ...form, pupils: form.pupils === "" ? null : Number(form.pupils), source: "pricing_page" }),
      });
      if (!r.ok) throw new Error("lead insert failed");
      setState("done");
    } catch { setState("error"); }
  };

  const wrap = { maxWidth: 1000, margin: "0 auto", padding: "0 20px" };
  const card = { background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 14 };
  const input = { width: "100%", fontSize: 14, padding: "10px 12px", border: `1px solid ${C.bdr}`, borderRadius: 8, background: C.bg, color: C.txt, fontFamily: "inherit" };
  const label = { fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 4, display: "block" };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.txt, fontFamily: "var(--font-plex), -apple-system, sans-serif" }}>
      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${C.bdr}`, background: C.card }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ fontSize: 16, fontWeight: 800, color: C.txt, letterSpacing: -0.3, textDecoration: "none" }}>Feynman<span style={{ color: C.pri }}> Education</span></a>
          <a href="/?login=1" style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: C.pri, padding: "8px 16px", borderRadius: 8, textDecoration: "none" }}>Log in</a>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: `linear-gradient(160deg, ${C.priSoft}, transparent)`, borderBottom: `1px solid ${C.bdr}`, padding: "56px 0 48px" }}>
        <div style={wrap}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, letterSpacing: 0.5, marginBottom: 10 }}>{BRAND.toUpperCase()}</div>
          <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, lineHeight: 1.1, margin: 0, maxWidth: 620 }}>Pricing that scales with your school</h1>
          <p style={{ fontSize: 17, color: C.mid, marginTop: 14, maxWidth: 600, lineHeight: 1.5 }}>
            AI-marked science retrieval practice. Pupils get instant, fair feedback on written answers — your department gets the marking time back.
          </p>
        </div>
      </div>

      {/* Tiers */}
      <div style={{ ...wrap, marginTop: 36 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          {TIERS.map((t) => (
            <div key={t.key} style={{ ...card, padding: 20, position: "relative", border: t.highlight ? `2px solid ${C.pri}` : card.border, boxShadow: t.highlight ? `0 8px 30px ${C.priGlow || "rgba(0,0,0,.06)"}` : "none" }}>
              {t.highlight && <div style={{ position: "absolute", top: -11, left: 20, background: C.pri, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99 }}>MOST POPULAR</div>}
              <div style={{ fontSize: 13, fontWeight: 700, color: t.highlight ? C.pri : C.txt }}>{t.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{t.price}</span>
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>{t.sub}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                {t.features.map((f, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: C.mid, lineHeight: 1.35 }}>
                    <span style={{ color: C.grn || C.pri, flexShrink: 0 }}>✓</span><span>{f}</span>
                  </div>
                ))}
              </div>
              <a href={t.href} style={{ display: "block", textAlign: "center", fontSize: 13, fontWeight: 600, padding: "9px", borderRadius: 8, textDecoration: "none",
                background: t.highlight ? C.pri : "transparent", color: t.highlight ? "#fff" : C.pri, border: t.highlight ? "none" : `1px solid ${C.pri}55` }}>{t.cta}</a>
            </div>
          ))}
        </div>

        {/* Core bands */}
        <div style={{ ...card, padding: "16px 20px", marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Core — price per pupil falls with size</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, textAlign: "center" }}>
            {CORE_BANDS.map(([range, price]) => (
              <div key={range} style={{ padding: "10px 6px", background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: C.mid }}>{range}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.txt, marginTop: 2 }}>{price}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 10 }}>Per pupil in the committed science cohort · minimum £450/yr · all prices + VAT.</div>
        </div>

        {/* Included + save */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Every paid plan includes</div>
            {["AI marking of written short answers, with instant feedback", "Automatic spaced retrieval and a curriculum-mapped question bank", "Teacher, head-of-department & leadership dashboards", "Termly updates, email support, and full GDPR cover"].map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: C.mid, marginBottom: 7, lineHeight: 1.4 }}><span style={{ color: C.grn || C.pri }}>✓</span><span>{f}</span></div>
            ))}
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Ways to save</div>
            {[["Multi-academy trust", "−15% for 3–9 schools · −25% for 10+"], ["Multi-year", "−10% for 2 years · −15% for 3 years"], ["Free pilot", "One cohort or half-term, free — no card required"]].map(([h, d], i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{h}</div>
                <div style={{ fontSize: 12, color: C.mid }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact / lead form */}
        <div id="contact" style={{ ...card, padding: 24, marginTop: 24, marginBottom: 48 }}>
          {state === "done" ? (
            <div style={{ textAlign: "center", padding: "30px 10px" }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Thanks — we’ll be in touch shortly.</div>
              <div style={{ fontSize: 13, color: C.mid, marginTop: 6 }}>We’ll email {form.email} to set up your pilot or quote.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Start a free pilot or request a quote</div>
              <div style={{ fontSize: 13, color: C.mid, marginTop: 6 }}>Tell us about your school and we’ll get you set up — no card required.</div>
              <div style={{ fontSize: 13, color: C.mid, marginTop: 4, marginBottom: 18 }}>Prefer email? Write to <a href="mailto:schools@feynmaneducation.com" style={{ color: C.pri, fontWeight: 600, textDecoration: "none" }}>schools@feynmaneducation.com</a>.</div>
              <form onSubmit={submit}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><label style={label}>School name *</label><input style={input} value={form.school_name} onChange={set("school_name")} required /></div>
                  <div><label style={label}>Your name</label><input style={input} value={form.contact_name} onChange={set("contact_name")} /></div>
                  <div><label style={label}>Email *</label><input style={input} type="email" value={form.email} onChange={set("email")} required /></div>
                  <div><label style={label}>Your role</label><input style={input} value={form.role} onChange={set("role")} placeholder="e.g. Head of Science" /></div>
                  <div><label style={label}>Science pupils (approx.)</label><input style={input} type="number" min="0" value={form.pupils} onChange={set("pupils")} /></div>
                  <div><label style={label}>Plan of interest</label>
                    <select style={{ ...input, cursor: "pointer" }} value={form.plan_interest} onChange={set("plan_interest")}>
                      <option value="">Not sure yet</option>
                      <option value="essentials">Essentials</option>
                      <option value="core">Core</option>
                      <option value="single_cohort">Single cohort</option>
                      <option value="pilot">Just a pilot for now</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}><label style={label}>Anything else?</label><textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={form.message} onChange={set("message")} /></div>
                {state === "error" && <div style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>Please add at least a school name and a valid email, then try again.</div>}
                <button type="submit" disabled={state === "sending"} style={{ fontSize: 15, fontWeight: 700, padding: "12px 28px", borderRadius: 9, border: "none", background: C.pri, color: "#fff", cursor: state === "sending" ? "wait" : "pointer", fontFamily: "inherit" }}>{state === "sending" ? "Sending…" : "Request a pilot / quote"}</button>
              </form>
            </>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.bdr}`, padding: "20px 0", textAlign: "center", fontSize: 12, color: C.dim }}>
        {BRAND} · <a href="mailto:schools@feynmaneducation.com" style={{ color: C.dim }}>schools@feynmaneducation.com</a> · feynmaneducation.com<br />
        All prices exclude VAT · Prices valid for the 2026/27 academic year.
      </div>
    </div>
  );
}
