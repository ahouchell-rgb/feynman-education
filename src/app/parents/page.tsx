"use client";
import { useEffect, useMemo, useState } from "react";
import { sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Inp, Badge } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

// Teacher-facing management for the Weekly Parent Progress Report (strategy Build 1).
// Add guardian↔pupil links per class, capture consent, and preview / send a report.
// Consent gates everything: the weekly cron only sends links with status "granted".

const CONSENT = {
  pending: { label: "Pending", color: C.amb, bg: C.ambS },
  granted: { label: "Consented", color: C.grn, bg: C.grnS },
  revoked: { label: "Revoked", color: C.red, bg: C.redS },
} as const;
type ConsentStatus = keyof typeof CONSENT;

interface Cls { id: string; name: string; year_group?: number; retrieval_class_ids?: string[]; }
interface Link {
  id: string; student_name: string; student_id: string | null; class_id: string | null;
  consent_status: ConsentStatus; guardian_id: string;
  guardian?: { email?: string; full_name?: string };
}
interface Report { id: string; student_name?: string; class_label?: string; week_start: string; emailed: boolean; html: string; created_at: string; }

function ReportModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.5)", display: "flex", flexDirection: "column", alignItems: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, width: "min(640px,100%)", maxHeight: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, flex: 1 }}>Report preview</span>
          <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={onClose}>Close ×</Btn>
        </div>
        {/* sandbox with NO allow-scripts — email HTML, rendered inertly. */}
        <iframe title="Parent report preview" srcDoc={html} sandbox="" style={{ width: "100%", height: "70vh", border: "none", background: "#fff" }} />
      </div>
    </div>
  );
}

function ParentsContent() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  // add-form state
  const [studentName, setStudentName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [studentId, setStudentId] = useState("");

  const selected = useMemo(() => classes.find(c => c.id === selectedId) || null, [classes, selectedId]);
  const retLinked = !!(selected?.retrieval_class_ids || []).length;

  useEffect(() => {
    (async () => {
      try {
        const cs = await sk.q("classes", { params: { select: "id,name,year_group,retrieval_class_ids", archived: "eq.false", order: "name.asc" } });
        setClasses(cs || []);
        if (cs?.length) setSelectedId(cs[0].id);
      } catch (e: any) { setErr(e.message); }
      setLoading(false);
    })();
  }, []);

  const loadLinks = async (classId: string) => {
    try {
      const [ls, rs] = await Promise.all([
        sk.q("guardian_student", { params: { class_id: `eq.${classId}`, select: "id,student_name,student_id,class_id,consent_status,guardian_id,guardian:guardians(email,full_name)", order: "student_name.asc" } }),
        sk.q("parent_reports", { params: { order: "created_at.desc", limit: "30" } }),
      ]);
      setLinks(ls || []);
      setReports(rs || []);
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { if (selectedId) loadLinks(selectedId); }, [selectedId]);

  const addLink = async () => {
    setErr("");
    const name = studentName.trim(), email = guardianEmail.trim().toLowerCase();
    if (!name || !email || !selectedId) { setErr("Student name and guardian email are required."); return; }
    setBusy("add");
    try {
      // Reuse a guardian row for this email if it exists, else create one.
      let gid: string;
      const existing = await sk.q("guardians", { params: { email: `eq.${email}`, select: "id", limit: "1" } });
      if (existing?.length) gid = existing[0].id;
      else {
        const made = await sk.q("guardians", { method: "POST", body: { email, full_name: guardianName.trim() || null } });
        gid = made[0].id;
      }
      await sk.q("guardian_student", { method: "POST", body: {
        guardian_id: gid, class_id: selectedId, student_name: name,
        student_id: studentId.trim() || null,
      } });
      setStudentName(""); setGuardianEmail(""); setGuardianName(""); setStudentId("");
      await loadLinks(selectedId);
    } catch (e: any) { setErr(e.message || "Couldn't add that link"); }
    setBusy(null);
  };

  const setConsent = async (link: Link, status: ConsentStatus) => {
    setBusy(link.id);
    try {
      await sk.q("guardian_student", {
        method: "PATCH", params: { id: `eq.${link.id}` },
        body: { consent_status: status, consent_at: status === "granted" ? new Date().toISOString() : null },
      });
      setLinks(ls => ls.map(l => l.id === link.id ? { ...l, consent_status: status } : l));
    } catch (e: any) { setErr(e.message); }
    setBusy(null);
  };

  const removeLink = async (link: Link) => {
    if (!confirm(`Remove ${link.student_name}'s guardian link?`)) return;
    setBusy(link.id);
    try { await sk.del("guardian_student", { id: `eq.${link.id}` }); setLinks(ls => ls.filter(l => l.id !== link.id)); }
    catch (e: any) { setErr(e.message); }
    setBusy(null);
  };

  const runReport = async (link: Link, send: boolean) => {
    setBusy(link.id); setErr("");
    try {
      const token = sk.auth.getToken();
      const res = await fetch("/api/parent-report/preview", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ linkId: link.id, send }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setPreview(data.html);
      if (send && data.emailed) await loadLinks(selectedId!);
      else if (send && !data.emailed) setErr("Generated, but email isn't configured (set RESEND_API_KEY + PARENT_REPORT_FROM). The report was saved.");
    } catch (e: any) { setErr(e.message); }
    setBusy(null);
  };

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.08em" }}>Loading…</div>;

  return (
    <div>
      {preview && <ReportModal html={preview} onClose={() => setPreview(null)} />}

      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>Parents</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 48, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Weekly <em style={{ fontStyle: "italic", color: C.grn }}>progress</em>, home.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "54ch", lineHeight: 1.55 }}>
        Link a parent to a pupil, capture their consent, and a weekly report — what the class studied plus where their child is weakest — is generated and emailed every Friday. Preview any time.
      </p>

      {err && <div style={{ padding: "10px 14px", background: C.redS, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 13, marginBottom: 18 }}>{err}</div>}

      {classes.length === 0 ? (
        <div style={{ padding: "40px 0", color: C.dim, fontFamily: C.mono, fontSize: 12 }}>No classes yet. Add classes in Manage first.</div>
      ) : (
        <>
          {/* class selector */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24, borderBottom: `1px solid ${C.rule}`, paddingBottom: 18 }}>
            {classes.map(c => {
              const active = c.id === selectedId;
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  style={{ background: active ? C.accent : "transparent", color: active ? C.accentFg : C.muted, border: `1px solid ${active ? C.accent : C.border}`, cursor: "pointer", padding: "6px 14px", fontFamily: C.mono, fontSize: 12, borderRadius: 999 }}>
                  {c.name}{c.year_group ? ` · Y${c.year_group}` : ""}
                </button>
              );
            })}
          </div>

          {!retLinked && (
            <div style={{ padding: "10px 14px", background: C.ambS, border: `1px solid ${C.amb}`, borderRadius: 6, color: C.amb, fontSize: 13, marginBottom: 18 }}>
              This class isn't linked to a retrieval class yet, so reports won't have practice data. Link it in Manage.
            </div>
          )}

          {/* links list */}
          <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface, marginBottom: 24 }}>
            {links.length === 0 ? (
              <div style={{ padding: "20px", color: C.dim, fontFamily: C.mono, fontSize: 12 }}>No guardians linked for this class yet.</div>
            ) : links.map((l, i) => {
              const cs = CONSENT[l.consent_status];
              const canSend = l.consent_status === "granted" && !!l.guardian?.email;
              return (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr auto auto", gap: 12, alignItems: "center", padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{l.student_name}</div>
                    {!l.student_id && <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono }}>class-level data</div>}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: C.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.guardian?.email}</div>
                  <select value={l.consent_status} disabled={busy === l.id}
                    onChange={e => setConsent(l, e.target.value as ConsentStatus)}
                    style={{ fontFamily: C.mono, fontSize: 11, padding: "4px 8px", borderRadius: 6, border: `1px solid ${cs.color}`, background: cs.bg, color: cs.color, cursor: "pointer" }}>
                    {(Object.keys(CONSENT) as ConsentStatus[]).map(k => <option key={k} value={k}>{CONSENT[k].label}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn v="soft" style={{ fontSize: 11, padding: "5px 10px" }} disabled={busy === l.id} onClick={() => runReport(l, false)}>{busy === l.id ? "…" : "Preview"}</Btn>
                    <Btn v="pri" style={{ fontSize: 11, padding: "5px 10px", opacity: canSend ? 1 : 0.4 }} disabled={busy === l.id || !canSend} title={canSend ? "Generate & email now" : "Needs consent + a guardian email"} onClick={() => runReport(l, true)}>Send</Btn>
                    <button onClick={() => removeLink(l)} disabled={busy === l.id} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 14 }}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* add form */}
          <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 18, background: C.surface, marginBottom: 32 }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 14 }}>Add a guardian</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Inp placeholder="Pupil name" value={studentName} onChange={e => setStudentName(e.target.value)} />
              <Inp placeholder="Guardian email" type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)} />
              <Inp placeholder="Guardian name (optional)" value={guardianName} onChange={e => setGuardianName(e.target.value)} />
              <Inp placeholder="Retrieval pupil id (optional)" value={studentId} onChange={e => setStudentId(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Btn onClick={addLink} disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add link"}</Btn>
              <span style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
                Added as <strong>Pending</strong>. Mark <strong>Consented</strong> only once the parent has opted in — reports are sent to consented links only.
              </span>
            </div>
          </div>

          {/* recent reports */}
          {reports.length > 0 && (
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} />
                <span>Recent reports</span>
                <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
              </div>
              <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
                {reports.map((r, i) => (
                  <button key={r.id} onClick={() => setPreview(r.html)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}`, background: "transparent", border: "none", cursor: "pointer" }}>
                    <span style={{ fontSize: 13, color: C.text, fontWeight: 500, flex: 1 }}>{r.student_name || "—"} <span style={{ color: C.dim, fontWeight: 400 }}>· {r.class_label}</span></span>
                    <span style={{ fontSize: 11, fontFamily: C.mono, color: C.dim }}>wk {r.week_start}</span>
                    <Badge color={r.emailed ? C.grn : C.dim} bg={r.emailed ? C.grnS : C.bg}>{r.emailed ? "Emailed" : "Saved"}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ParentsPage() {
  return <AppShell><ParentsContent /></AppShell>;
}
