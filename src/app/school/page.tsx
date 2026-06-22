"use client";
import { useEffect, useMemo, useState } from "react";
import { sk, useAuth } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { Btn, Inp } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";
import { ObjectiveMasteryPanel, type BlendedObjectiveRow } from "@/components/ObjectiveMasteryPanel";
import {
  overallTrend, objectiveDeltas, mostImproved, stillStuck, impactNarrative,
  type Snapshot, type CohortOutcome,
} from "@/lib/impact";

// SLT / Head-of-Department dashboard (strategy Build 2). Cohort mastery across
// every class in the school: the objectives the cohort is weakest on, and a
// per-class grid. Framed as support — aggregates only, no per-pupil surveillance.

interface WeakRow { topic_id: string; topic_name: string; pct_correct: number; marked: number | null; students: number | null; }
interface ClassRow { class_id: string; name: string; year_group: number; discipline: string; tier: string; teacher_name: string; linked: boolean; weak: WeakRow[]; }
interface Overview { enabled: boolean; role: string; school?: { name: string }; joinCode?: string | null; homeSponsored?: boolean; trust?: { linked: boolean; name?: string }; years?: number[]; classes?: ClassRow[]; objectiveMastery?: BlendedObjectiveRow[]; cohort?: { topic_name: string; avg: number; classes?: number }[]; meta?: { source: "snapshot" | "live"; takenOn?: string; staleDays?: number | null }; }

// Staff roster with role + remove controls (slt only).
const ROLE_LABEL: Record<string, string> = { member: "Teacher", hod: "Head of Dept", slt: "Senior leader" };
function StaffRoster({ members, selfId, reload }: { members: { id: string; full_name: string; school_role: string }[]; selfId?: string; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const setRole = async (id: string, role: string) => {
    setBusy(id); setErr("");
    try { await sk.rpc("set_school_member_role", { p_target: id, p_role: role }); await reload(); }
    catch (e: any) { setErr(e.message); }
    setBusy("");
  };
  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the school?`)) return;
    setBusy(id); setErr("");
    try { await sk.rpc("remove_school_member", { p_target: id }); await reload(); }
    catch (e: any) { setErr(e.message); }
    setBusy("");
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, padding: 0 }}>
        {open ? "▾" : "▸"} Staff · {members.length}
      </button>
      {open && (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginTop: 12 }}>
          {err && <div style={{ padding: "8px 16px", color: C.red, fontSize: 12, fontFamily: C.mono }}>{err}</div>}
          {members.map((m, i) => (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 150px 70px", gap: 12, alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <span style={{ fontSize: 13, color: C.text }}>{m.full_name || "—"}{m.id === selfId && <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}> · you</span>}</span>
              {m.id === selfId ? (
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{ROLE_LABEL[m.school_role]}</span>
              ) : (
                <select value={m.school_role} disabled={busy === m.id} onChange={(e) => setRole(m.id, e.target.value)}
                  style={{ fontFamily: C.mono, fontSize: 11, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, cursor: "pointer" }}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
              {m.id !== selfId && (
                <button onClick={() => remove(m.id, m.full_name)} disabled={busy === m.id} title="Remove from school" style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 14, textAlign: "right" }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Admin activity trail for a school's slt — who changed roles / membership, when.
// Lazy-loaded on open from the slt-gated school_audit() RPC.
const AUDIT_LABEL: Record<string, string> = {
  "role.change": "Role changed", "member.remove": "Member removed",
  "school.create": "School created", "school.join": "Joined school", "school.leave": "Left school",
  "trust.create": "Trust created", "trust.link": "Linked to trust",
};
function AuditTrail() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");

  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && rows === null) {
      try { setRows(await sk.rpc("school_audit", { p_limit: 50 }) || []); }
      catch (e: any) { setErr(e.message); setRows([]); }
    }
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <button onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, padding: 0 }}>
        {open ? "▾" : "▸"} Admin activity
      </button>
      {open && (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginTop: 12 }}>
          {err && <div style={{ padding: "8px 16px", color: C.red, fontSize: 12, fontFamily: C.mono }}>{err}</div>}
          {rows === null ? (
            <div style={{ padding: "12px 16px", color: C.dim, fontFamily: C.mono, fontSize: 12 }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "12px 16px", color: C.dim, fontFamily: C.mono, fontSize: 12 }}>No recorded admin actions yet.</div>
          ) : rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 150px", gap: 12, alignItems: "center", padding: "9px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text, fontWeight: 500 }}>{AUDIT_LABEL[r.action] || r.action}</span>
              <span style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                by {r.actor_name || "—"}{r.detail?.to ? ` → ${r.detail.to}` : ""}{r.detail?.name ? ` · ${r.detail.name}` : ""}
              </span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, textAlign: "right" }}>{r.at ? new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Trust (MAT) membership management for a school's slt.
function TrustManage({ trust, onDone }: { trust?: { linked: boolean; name?: string }; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  if (trust?.linked) {
    return (
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginBottom: 24 }}>
        Part of <span style={{ color: C.text }}>{trust.name || "a trust"}</span>. <a href="/trust" style={{ color: C.muted }}>Open trust dashboard →</a>
      </div>
    );
  }

  const create = async () => {
    if (!name.trim()) { setErr("Enter a trust name."); return; }
    setBusy("create"); setErr("");
    try { await sk.rpc("create_trust", { p_name: name.trim() }); onDone(); }
    catch (e: any) { setErr(e.message || "Couldn't create the trust."); setBusy(""); }
  };
  const link = async () => {
    if (!code.trim()) { setErr("Enter a trust code."); return; }
    setBusy("link"); setErr("");
    try { await sk.rpc("link_school_to_trust", { p_code: code.trim() }); onDone(); }
    catch (e: any) { setErr(e.message?.includes("invalid") ? "That trust code wasn't recognised." : (e.message || "Couldn't link.")); setBusy(""); }
  };

  if (!open) {
    return (
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => setOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 12, color: C.muted, padding: 0 }}>+ Add this school to a trust (MAT)</button>
      </div>
    );
  }
  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 16, background: C.surface, marginBottom: 24 }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Trust (MAT)</div>
      {err && <div style={{ padding: "8px 12px", background: C.redS, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 12, marginBottom: 12 }}>{err}</div>}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 240 }}>
          <Inp placeholder="New trust name" value={name} onChange={(e) => setName(e.target.value)} />
          <Btn onClick={create} disabled={busy === "create"} style={{ whiteSpace: "nowrap" }}>{busy === "create" ? "…" : "Create"}</Btn>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 240 }}>
          <Inp placeholder="…or join code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: "0.1em" }} />
          <Btn v="soft" onClick={link} disabled={busy === "link"} style={{ whiteSpace: "nowrap" }}>{busy === "link" ? "…" : "Link"}</Btn>
        </div>
      </div>
    </div>
  );
}

// Self-serve onboarding shown when the teacher isn't linked to a school yet.
function SchoolOnboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const create = async () => {
    if (!name.trim()) { setErr("Enter a school name."); return; }
    setBusy("create"); setErr("");
    try { await sk.rpc("create_school", { p_name: name.trim() }); onDone(); }
    catch (e: any) { setErr(e.message || "Couldn't create the school."); setBusy(""); }
  };
  const join = async () => {
    if (!code.trim()) { setErr("Enter a join code."); return; }
    setBusy("join"); setErr("");
    try { await sk.rpc("join_school", { p_code: code.trim() }); onDone(); }
    catch (e: any) { setErr(e.message?.includes("invalid") ? "That join code wasn't recognised." : (e.message || "Couldn't join.")); setBusy(""); }
  };

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} /><span>School</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        See your <em style={{ fontStyle: "italic", color: C.grn }}>whole school</em>.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "52ch", lineHeight: 1.55 }}>
        Set up your school to see cohort mastery across every class, or join your colleagues' school with a code.
      </p>
      {err && <div style={{ padding: "10px 14px", background: C.redS, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 13, marginBottom: 18 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 20, background: C.surface }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Create a school</div>
          <p style={{ fontSize: 12, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>You become the senior leader and get a code to invite your team.</p>
          <Inp placeholder="School name" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />
          <Btn onClick={create} disabled={busy === "create"}>{busy === "create" ? "Creating…" : "Create school"}</Btn>
        </div>
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 20, background: C.surface }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Join a school</div>
          <p style={{ fontSize: 12, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>Enter the code a colleague shared with you.</p>
          <Inp placeholder="Join code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ marginBottom: 10, letterSpacing: "0.1em" }} />
          <Btn v="soft" onClick={join} disabled={busy === "join"}>{busy === "join" ? "Joining…" : "Join school"}</Btn>
        </div>
      </div>
    </div>
  );
}

// Colour a 0–100% mastery reading: red (weak) → amber → green (secure).
function heat(pct: number) {
  if (pct < 40) return { bg: C.redS, fg: C.red };
  if (pct < 65) return { bg: C.ambS, fg: C.amb };
  return { bg: C.grnS, fg: C.grn };
}

function Bar({ pct }: { pct: number }) {
  const h = heat(pct);
  return (
    <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden", minWidth: 64 }}>
      <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: h.fg, opacity: 0.7 }} />
    </div>
  );
}

// Compact inline school-average sparkline used by the headline trend strip.
function Sparkline({ points, w = 200, ht = 38 }: { points: number[]; w?: number; ht?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = Math.max(1, max - min);
  const xs = (i: number) => (i / (points.length - 1)) * (w - 4) + 2;
  const ys = (v: number) => ht - 4 - ((v - min) / span) * (ht - 8);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg width={w} height={ht} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={heat(last).fg} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs(points.length - 1)} cy={ys(last)} r={3} fill={heat(last).fg} />
    </svg>
  );
}

// A labelled school-average trend chart with axis-ish ticks (extends the bare
// sparkline) — the first-vs-latest delta is shown by the caller's headline.
function TrendChart({ points, w = 360, ht = 110 }: { points: { taken_on: string; avg: number }[]; w?: number; ht?: number }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.avg);
  const min = Math.max(0, Math.min(...vals) - 5), max = Math.min(100, Math.max(...vals) + 5), span = Math.max(1, max - min);
  const padL = 26, padB = 16;
  const xs = (i: number) => padL + (i / (points.length - 1)) * (w - padL - 6);
  const ys = (v: number) => ht - padB - ((v - min) / span) * (ht - padB - 6);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.avg).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <svg width={w} height={ht} style={{ display: "block", overflow: "visible" }}>
      {[min, Math.round((min + max) / 2), max].map((g) => (
        <g key={g}>
          <line x1={padL} y1={ys(g)} x2={w - 6} y2={ys(g)} stroke={C.rule} strokeWidth={1} />
          <text x={padL - 5} y={ys(g) + 3} textAnchor="end" fontFamily={C.mono} fontSize={9} fill={C.faint}>{g}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke={heat(last.avg).fg} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={xs(i)} cy={ys(p.avg)} r={i === points.length - 1 ? 3.5 : 2} fill={heat(p.avg).fg} />)}
      <text x={xs(0)} y={ht - 3} textAnchor="start" fontFamily={C.mono} fontSize={9} fill={C.faint}>{fmtDate(points[0].taken_on)}</text>
      <text x={w - 6} y={ht - 3} textAnchor="end" fontFamily={C.mono} fontSize={9} fill={C.faint}>{fmtDate(last.taken_on)}</text>
    </svg>
  );
}

// PRIORITY #1 — Impact / progress-over-time. Built entirely from the EXISTING
// school_benchmark_snapshots history: overall trend + delta, and per-objective
// most-improved / still-stuck. Degrades gracefully when history is too thin.
function ImpactSection({ snaps, outcomes }: { snaps: Snapshot[]; outcomes: CohortOutcome[] }) {
  const trend = useMemo(() => overallTrend(snaps), [snaps]);
  const deltas = useMemo(() => objectiveDeltas(snaps), [snaps]);
  const improved = useMemo(() => mostImproved(deltas, 5), [deltas]);
  const stuck = useMemo(() => stillStuck(deltas, 5), [deltas]);

  if (snaps.length === 0) return null;

  return (
    <>
      <SectionLabel>Impact — progress over the term</SectionLabel>
      {!trend.enough ? (
        <Empty>Not enough snapshot history yet to show a trend — check back after a couple more weekly snapshots.</Empty>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", padding: "16px 18px", border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, marginBottom: 20 }}>
          <div style={{ minWidth: 160 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim }}>School mastery</div>
            <div style={{ fontFamily: C.serif, fontSize: 38, color: heat(trend.latest || 0).fg, lineHeight: 1.05 }}>{trend.latest}%</div>
            {trend.delta != null && (
              <div style={{ fontFamily: C.mono, fontSize: 13, color: trend.delta >= 0 ? C.grn : C.red }}>
                {trend.delta >= 0 ? "▲ +" : "▼ "}{trend.delta} pts since {new Date(trend.points[0].taken_on + "T00:00:00").toLocaleDateString("en-GB", { month: "long" })}
              </div>
            )}
          </div>
          <TrendChart points={trend.points} />
        </div>
      )}

      {(improved.length > 0 || stuck.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 32 }}>
          <DeltaList title="Most improved" rows={improved} mode="delta" empty="No measured improvement yet." />
          <DeltaList title="Still stuck" rows={stuck} mode="level" empty="No persistently weak objectives." />
        </div>
      )}
      {outcomes.length > 0 && trend.enough && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: -16, marginBottom: 28, lineHeight: 1.5 }}>
          {impactNarrative(trend, deltas, outcomes)}
        </div>
      )}
    </>
  );
}

function DeltaList({ title, rows, mode, empty }: { title: string; rows: { key: string; label: string; first: number | null; latest: number; delta: number | null }[]; mode: "delta" | "level"; empty: string }) {
  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>{title}</div>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
        {rows.length === 0 ? <Empty>{empty}</Empty> : rows.map((r, i) => (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "9px 14px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
            <span style={{ fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            {mode === "delta" && r.delta != null ? (
              <span style={{ fontFamily: C.mono, fontSize: 12, color: r.delta >= 0 ? C.grn : C.red, fontWeight: 600 }}>
                {r.delta >= 0 ? "+" : ""}{r.delta} pts <span style={{ color: C.faint, fontWeight: 400 }}>({r.first}→{r.latest})</span>
              </span>
            ) : (
              <span style={{ fontFamily: C.mono, fontSize: 12, color: heat(r.latest).fg, fontWeight: 600 }}>{r.latest}%{r.delta != null && <span style={{ color: r.delta >= 0 ? C.grn : C.red, fontWeight: 400, marginLeft: 6 }}>{r.delta >= 0 ? "+" : ""}{r.delta}</span>}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// PRIORITY #2 — minimal SLT-only cohort-outcomes recorder. A table + add form;
// writes go straight to the RLS-gated cohort_outcomes table under the SLT's JWT.
function OutcomesPanel({ schoolId, selfId, outcomes, reload }: { schoolId: string; selfId?: string; outcomes: CohortOutcome[]; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [term, setTerm] = useState("");
  const [metric, setMetric] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = async () => {
    const v = Number(value);
    if (!label.trim()) { setErr("Enter a label, e.g. \"Y11 mock pass rate\"."); return; }
    if (!value.trim() || Number.isNaN(v)) { setErr("Enter a numeric value."); return; }
    setBusy(true); setErr("");
    try {
      await sk.q("cohort_outcomes", { method: "POST", body: {
        school_id: schoolId, label: label.trim(), term: term.trim() || null,
        metric: metric.trim() || null, value: v, recorded_by: selfId || null,
      } });
      setLabel(""); setTerm(""); setMetric(""); setValue("");
      reload();
    } catch (e: any) { setErr(e.message || "Couldn't save."); }
    setBusy(false);
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this outcome?")) return;
    try { await sk.del("cohort_outcomes", { id: `eq.${id}` }); reload(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionLabel>Cohort outcomes — recorded results</SectionLabel>
      {outcomes.length > 0 && (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 12 }}>
          {outcomes.map((o, i) => (
            <div key={(o as any).id || i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 28px", gap: 12, alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <span style={{ fontSize: 13, color: C.text }}>{o.label}{o.metric ? <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}> · {o.metric}</span> : null}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{o.term || "—"}</span>
              <span style={{ fontFamily: C.mono, fontSize: 14, color: C.text, fontWeight: 600, textAlign: "right" }}>{o.value}</span>
              {(o as any).id ? <button onClick={() => remove((o as any).id)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 14, textAlign: "right" }}>×</button> : <span />}
            </div>
          ))}
        </div>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 12, color: C.muted, padding: 0 }}>+ Record a cohort outcome</button>
      ) : (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 16, background: C.surface }}>
          {err && <div style={{ padding: "8px 12px", background: C.redS, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 12, marginBottom: 12 }}>{err}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 90px auto", gap: 8, alignItems: "center" }}>
            <Inp placeholder="Label (e.g. Y11 mock pass rate)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Inp placeholder="Term (e.g. Spring)" value={term} onChange={(e) => setTerm(e.target.value)} />
            <Inp placeholder="Metric (e.g. % 4+)" value={metric} onChange={(e) => setMetric(e.target.value)} />
            <Inp placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
            <Btn onClick={add} disabled={busy} style={{ whiteSpace: "nowrap" }}>{busy ? "…" : "Add"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function SchoolContent() {
  const { profile, setProfile } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [members, setMembers] = useState<{ id: string; full_name: string; school_role: string }[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  // Chronological school-average snapshots — drives the compact headline trend strip.
  const trend = useMemo(
    () => [...snaps].filter((s) => s.school_avg != null).sort((a, b) => a.taken_on.localeCompare(b.taken_on)),
    [snaps],
  );
  const [outcomes, setOutcomes] = useState<CohortOutcome[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [discFilter, setDiscFilter] = useState<string>("all");

  const [hydrating, setHydrating] = useState(false);
  const loadMembers = () => sk.rpc("school_members", {}).then(setMembers).catch(() => {});
  const loadOutcomes = () => sk.q("cohort_outcomes", { params: { select: "id,label,term,metric,value,recorded_at", order: "recorded_at.desc", limit: "50" } }).then(setOutcomes).catch(() => {});
  const load = async (live = false) => {
    try {
      const r = await fetch(`/api/school/overview${live ? "?live=1" : ""}`, { headers: { authorization: `Bearer ${sk.auth.getToken()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      setData(d);
      if (d.enabled && d.role === "slt") loadMembers();
      if (d.enabled) {
        loadOutcomes();
        sk.q("school_benchmark_snapshots", { params: { select: "taken_on,school_avg,payload", order: "taken_on.asc", limit: "16" } })
          .then((rows) => setSnaps(rows || [])).catch(() => {});
        // Snapshot-first paint, then hydrate the live per-class grid in the background.
        if (d.enabled && d.meta?.source === "snapshot") {
          setHydrating(true);
          fetch("/api/school/overview?live=1", { headers: { authorization: `Bearer ${sk.auth.getToken()}` } })
            .then((res) => res.json()).then((live) => { if (live?.enabled) setData(live); }).catch(() => {})
            .finally(() => setHydrating(false));
        }
      }
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // After self-serve create/join, refresh the profile (role/nav) and reload.
  const onboarded = async () => {
    try {
      const p = await sk.q("profiles", { params: { id: `eq.${profile.id}`, select: "*" }, single: true });
      setProfile(p);
    } catch { /* non-fatal */ }
    setLoading(true); await load();
  };

  const filtered = useMemo(() => {
    const cs = data?.classes || [];
    return cs.filter((c) => (yearFilter === "all" || c.year_group === yearFilter) && (discFilter === "all" || c.discipline === discFilter));
  }, [data, yearFilter, discFilter]);

  // Cohort roll-up: merge weak objectives across the filtered classes.
  const cohort = useMemo(() => {
    const m = new Map<string, { topic_name: string; sum: number; n: number; classes: number; pupils: number }>();
    for (const c of filtered) {
      for (const w of c.weak) {
        const e = m.get(w.topic_id) || { topic_name: w.topic_name, sum: 0, n: 0, classes: 0, pupils: 0 };
        e.sum += w.pct_correct; e.n += 1; e.classes += 1; e.pupils += w.students || 0;
        m.set(w.topic_id, e);
      }
    }
    const live = [...m.values()].map((e) => ({ topic_name: e.topic_name, avg: Math.round(e.sum / e.n), classes: e.classes, pupils: e.pupils }))
      .sort((a, b) => a.avg - b.avg);
    // Snapshot mode (no live classes yet): use the route's snapshot cohort.
    if (live.length === 0 && (data?.cohort || []).length) {
      return (data!.cohort || []).map((o: any) => ({ topic_name: o.topic_name, avg: o.avg, classes: o.classes || 0, pupils: 0 }))
        .sort((a, b) => a.avg - b.avg);
    }
    return live;
  }, [filtered, data]);

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.08em" }}>Loading school data…</div>;
  if (err) return <div style={{ padding: 40, color: C.red, fontFamily: C.mono, fontSize: 12 }}>Error: {err}</div>;

  if (!data?.enabled) return <SchoolOnboarding onDone={onboarded} />;

  const years = data.years || [];
  // Data-quality: classes not linked to retrieval contribute nothing to mastery.
  // Surface them so SLT know the numbers are a partial view, not a verdict.
  const unlinked = (data.classes || []).filter((c) => !c.linked);

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span style={{ flex: 1 }}>{data.school?.name} · {data.role === "slt" ? "Leadership" : "Department"}</span>
        {data.role === "slt" && <a href="/school/intervention" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.muted, textDecoration: "none", marginRight: 14 }}>Interventions →</a>}
        <a href="/school/integrations" style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.muted, textDecoration: "none" }}>Integrations →</a>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Where the cohort is <em style={{ fontStyle: "italic", color: C.red }}>weakest</em>.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: "54ch", lineHeight: 1.55 }}>
        Aggregated across every class — to target support, not to rank teachers. {filtered.length} classes shown.
      </p>

      {data.meta?.source === "snapshot" && data.meta.staleDays != null && (
        <p style={{ fontFamily: C.mono, fontSize: 11, color: data.meta.staleDays > 9 ? C.red : C.faint, marginTop: -16, marginBottom: 24 }}>
          {data.meta.staleDays > 9 ? "⚠ Snapshot stale — " : "Updated "}
          {data.meta.staleDays === 0 ? "today" : `${data.meta.staleDays} day${data.meta.staleDays === 1 ? "" : "s"} ago`}
          {data.meta.staleDays > 9 ? " (the weekly snapshot may have stopped running)" : ""}
        </p>
      )}

      {unlinked.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 16px", border: `1px solid ${C.amb}33`, borderRadius: 8, background: C.ambS, marginBottom: 24 }}>
          <span style={{ fontSize: 14, lineHeight: 1.4, color: C.amb }}>⚠</span>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 600 }}>{unlinked.length} {unlinked.length === 1 ? "class isn't" : "classes aren't"} linked to retrieval practice yet</strong> — {unlinked.length === 1 ? "its" : "their"} pupils won't appear in the mastery numbers above until linked.
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {unlinked.map((c) => c.name).join(", ")}
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 6 }}>
              Link a class to its retrieval group on <a href="/school/integrations" style={{ color: C.amb }}>Integrations →</a>
            </div>
          </div>
        </div>
      )}

      {trend.length >= 2 && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim }}>School average · trend</div>
            <div style={{ fontFamily: C.serif, fontSize: 28, color: heat(trend[trend.length - 1].school_avg || 0).fg, lineHeight: 1.1 }}>
              {trend[trend.length - 1].school_avg}%
              {(() => { const delta = (trend[trend.length - 1].school_avg || 0) - (trend[0].school_avg || 0); return <span style={{ fontFamily: C.mono, fontSize: 12, color: delta >= 0 ? C.grn : C.red, marginLeft: 8 }}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts</span>; })()}
            </div>
          </div>
          <Sparkline points={trend.map((s) => s.school_avg || 0)} />
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginLeft: "auto" }}>{trend.length} weekly snapshots</div>
        </div>
      )}

      <ImpactSection snaps={snaps} outcomes={outcomes} />

      {data.role === "slt" && profile?.school_id && (
        <>
          <OutcomesPanel schoolId={profile.school_id} selfId={profile?.id} outcomes={outcomes} reload={loadOutcomes} />
          <div style={{ marginTop: -20, marginBottom: 28 }}>
            <a href="/school/impact/print" style={{ fontFamily: C.mono, fontSize: 12, color: C.grn, textDecoration: "none" }}>Governors / Ofsted summary →</a>
          </div>
        </>
      )}

      {data.role === "slt" && data.joinCode && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 16px", border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: C.muted }}>
            Invite your science team — share this join code:
            <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: "0.12em", marginLeft: 10, padding: "3px 10px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>{data.joinCode}</span>
          </div>
          {members.length > 0 && (
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginLeft: "auto" }}>
              {members.length} staff · {members.filter((m) => m.school_role !== "member").length} leader{members.filter((m) => m.school_role !== "member").length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {data.role === "slt" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", border: `1px solid ${C.rule}`, borderRadius: 8, background: C.surface, marginBottom: 24 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Home for parents {data.homeSponsored ? <span style={{ fontFamily: C.mono, fontSize: 10, color: C.grn }}>· SPONSORED</span> : ""}</div>
            <div style={{ fontSize: 11, color: C.dim }}>Make the parent Home product (practice + target tracking) free for your parents.</div>
          </div>
          <Btn v={data.homeSponsored ? "ghost" : "pri"} onClick={async () => { try { await sk.rpc("set_school_home_sponsored", { p_on: !data.homeSponsored }); await load(); } catch (e: any) { setErr(e.message); } }}>
            {data.homeSponsored ? "Turn off" : "Sponsor Home"}
          </Btn>
        </div>
      )}

      {data.role === "slt" && <TrustManage trust={data.trust} onDone={onboarded} />}
      {data.role === "slt" && members.length > 0 && <StaffRoster members={members} selfId={profile?.id} reload={loadMembers} />}
      {data.role === "slt" && <AuditTrail />}

      {/* filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, paddingBottom: 18, borderBottom: `1px solid ${C.rule}` }}>
        {(["all", ...years] as (number | "all")[]).map((y) => {
          const active = yearFilter === y;
          return (
            <button key={String(y)} onClick={() => setYearFilter(y)}
              style={{ background: active ? C.accent : "transparent", color: active ? C.accentFg : C.muted, border: `1px solid ${active ? C.accent : C.border}`, cursor: "pointer", padding: "6px 14px", fontFamily: C.mono, fontSize: 12, borderRadius: 999 }}>
              {y === "all" ? "All years" : `Year ${y}`}
            </button>
          );
        })}
        <span style={{ width: 1, background: C.rule, margin: "0 4px" }} />
        {["all", "biology", "chemistry", "physics"].map((dz) => {
          const active = discFilter === dz;
          const col = dz === "all" ? null : DISC[dz as keyof typeof DISC]?.color;
          return (
            <button key={dz} onClick={() => setDiscFilter(dz)}
              style={{ background: active ? C.accent : "transparent", color: active ? C.accentFg : C.muted, border: `1px solid ${active ? C.accent : C.border}`, cursor: "pointer", padding: "6px 14px", fontFamily: C.mono, fontSize: 11, borderRadius: 999, textTransform: "capitalize", display: "flex", alignItems: "center", gap: 6 }}>
              {col && <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />}{dz}
            </button>
          );
        })}
      </div>

      {/* per-objective mastery, blended across retrieval + assessment QLA */}
      {(data.objectiveMastery || []).length > 0 && (
        <>
          <SectionLabel>Per-objective mastery — retrieval + assessment</SectionLabel>
          <ObjectiveMasteryPanel rows={data.objectiveMastery} drillBase={data.role === "slt" ? "/school/intervention" : undefined} />
        </>
      )}

      {/* cohort weakest objectives */}
      <SectionLabel>Weakest objectives — cohort</SectionLabel>
      {cohort.length === 0 ? (
        <Empty>No retrieval data yet for this selection.</Empty>
      ) : (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 32 }}>
          {cohort.slice(0, 12).map((o, i) => {
            const h = heat(o.avg);
            return (
              <div key={o.topic_name + i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 70px", gap: 14, alignItems: "center", padding: "11px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
                <span style={{ fontSize: 14, color: C.text }}>{o.topic_name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Bar pct={o.avg} />
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: h.fg, fontWeight: 600, minWidth: 34, textAlign: "right" }}>{o.avg}%</span>
                </div>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, textAlign: "right" }}>{o.classes} {o.classes === 1 ? "class" : "classes"}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* per-class grid */}
      <SectionLabel>By class</SectionLabel>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
        {filtered.length === 0 && hydrating ? (
          <Empty>Loading the live class breakdown…</Empty>
        ) : filtered.length === 0 && data.meta?.source === "snapshot" ? (
          <Empty>Showing the latest snapshot{data.meta.takenOn ? ` (${new Date(data.meta.takenOn + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })})` : ""}. <button onClick={() => { setHydrating(true); load(true).finally(() => setHydrating(false)); }} style={{ background: "none", border: "none", color: C.grn, cursor: "pointer", fontFamily: C.mono, fontSize: 12, textDecoration: "underline", padding: 0 }}>Load live breakdown</button></Empty>
        ) : filtered.length === 0 ? <Empty>No classes match the filter.</Empty> : filtered.map((c, i) => {
          const d = DISC[c.discipline as keyof typeof DISC] || DISC.combined;
          const weakest = c.weak[0];
          const avg = c.weak.length ? Math.round(c.weak.reduce((s, w) => s + w.pct_correct, 0) / c.weak.length) : null;
          return (
            <div key={c.class_id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 130px", gap: 14, alignItems: "center", padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{c.name}</span>
                  {c.year_group ? <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>Y{c.year_group}</span> : null}
                </div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginTop: 3, paddingLeft: 15 }}>{c.teacher_name || "—"}</div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {!c.linked ? <span style={{ color: C.faint, fontStyle: "italic" }}>not linked to retrieval</span>
                  : weakest ? <>Weakest: <span style={{ color: C.text }}>{weakest.topic_name}</span></>
                  : <span style={{ color: C.faint }}>no data yet</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                {avg != null ? <><Bar pct={avg} /><span style={{ fontFamily: C.mono, fontSize: 12, color: heat(avg).fg, fontWeight: 600, minWidth: 34, textAlign: "right" }}>{avg}%</span></> : <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}>
    <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} />
    <span>{children}</span>
    <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
  </div>
);
const Empty = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "20px", color: C.dim, fontFamily: C.mono, fontSize: 12 }}>{children}</div>
);

export default function SchoolPage() {
  return <AppShell><SchoolContent /></AppShell>;
}
