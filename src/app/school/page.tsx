"use client";
import { useEffect, useMemo, useState } from "react";
import { sk, useAuth } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { Btn, Inp } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

// SLT / Head-of-Department dashboard (strategy Build 2). Cohort mastery across
// every class in the school: the objectives the cohort is weakest on, and a
// per-class grid. Framed as support — aggregates only, no per-pupil surveillance.

interface WeakRow { topic_id: string; topic_name: string; pct_correct: number; marked: number | null; students: number | null; }
interface ClassRow { class_id: string; name: string; year_group: number; discipline: string; tier: string; teacher_name: string; linked: boolean; weak: WeakRow[]; }
interface Overview { enabled: boolean; role: string; school?: { name: string }; joinCode?: string | null; trust?: { linked: boolean; name?: string }; years?: number[]; classes?: ClassRow[]; }

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

function SchoolContent() {
  const { profile, setProfile } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [members, setMembers] = useState<{ id: string; full_name: string; school_role: string }[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [discFilter, setDiscFilter] = useState<string>("all");

  const loadMembers = () => sk.rpc("school_members", {}).then(setMembers).catch(() => {});
  const load = async () => {
    try {
      const r = await fetch("/api/school/overview", { headers: { authorization: `Bearer ${sk.auth.getToken()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      setData(d);
      if (d.enabled && d.role === "slt") loadMembers();
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
    return [...m.values()].map((e) => ({ topic_name: e.topic_name, avg: Math.round(e.sum / e.n), classes: e.classes, pupils: e.pupils }))
      .sort((a, b) => a.avg - b.avg);
  }, [filtered]);

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.08em" }}>Loading school data…</div>;
  if (err) return <div style={{ padding: 40, color: C.red, fontFamily: C.mono, fontSize: 12 }}>Error: {err}</div>;

  if (!data?.enabled) return <SchoolOnboarding onDone={onboarded} />;

  const years = data.years || [];

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

      {data.role === "slt" && <TrustManage trust={data.trust} onDone={onboarded} />}
      {data.role === "slt" && members.length > 0 && <StaffRoster members={members} selfId={profile?.id} reload={loadMembers} />}

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
        {filtered.length === 0 ? <Empty>No classes match the filter.</Empty> : filtered.map((c, i) => {
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
