"use client";
import { useEffect, useState } from "react";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

// MIS (Wonde) integration admin — strategy Build 3. SLT runs the sync; any
// teacher can import their class's staged parent contacts as guardian links
// for the weekly report. Env-gated server-side; this screen reflects status.

interface Status {
  configured: boolean;
  connection: { mis_school_id: string; status: string; last_full_sync_at: string | null; last_error: string | null } | null;
  counts: { students: number; contacts: number; contactsWithEmail: number };
  writeback?: { pending: number; sent: number; error: number };
  runs: { kind: string; status: string; counts: any; error: string | null; started_at: string; finished_at: string | null }[];
}

// Parse a simple CSV of (student_mis_id, value) — skips a header row if present.
function parseWritebackCsv(text: string): { student_mis_id: string; value: string }[] {
  const out: { student_mis_id: string; value: string }[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 2 || !cols[0]) return;
    if (i === 0 && /[a-z]/i.test(cols[1]) && /id|student|upn/i.test(cols[0])) return; // header
    out.push({ student_mis_id: cols[0], value: cols[1] });
  });
  return out;
}

function IntegrationsContent() {
  const { profile } = useAuth();
  const isSlt = profile?.school_role === "slt";
  const [status, setStatus] = useState<Status | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [importClass, setImportClass] = useState("");
  const [wbAspect, setWbAspect] = useState("Science predicted grade");

  const token = () => sk.auth.getToken();
  const load = async () => {
    try {
      const r = await fetch("/api/mis/status", { headers: { authorization: `Bearer ${token()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load status");
      setStatus(d);
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => {
    load();
    sk.q("classes", { params: { select: "id,name,year_group", archived: "eq.false", order: "name.asc" } }).then(setClasses).catch(() => {});
  }, []);

  const runSync = async () => {
    setBusy("sync"); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/mis/sync", { method: "POST", headers: { authorization: `Bearer ${token()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sync failed");
      setMsg(`Synced ${d.counts?.students ?? 0} pupils and ${d.counts?.contacts ?? 0} contacts.`);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  };

  const onWbCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!wbAspect.trim()) { setErr("Enter the MIS aspect (marksheet column) first."); return; }
    setBusy("wbqueue"); setMsg(""); setErr("");
    try {
      const items = parseWritebackCsv(await file.text());
      if (!items.length) throw new Error("No (student id, value) rows found in that CSV.");
      const r = await fetch("/api/mis/writeback/enqueue", {
        method: "POST", headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
        body: JSON.stringify({ aspect: wbAspect.trim(), source: "csv", items }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Enqueue failed");
      setMsg(`Queued ${d.enqueued} value${d.enqueued === 1 ? "" : "s"} for "${wbAspect.trim()}". Push them to the MIS below.`);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  };

  const runWriteback = async () => {
    setBusy("wbrun"); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/mis/writeback/run", { method: "POST", headers: { authorization: `Bearer ${token()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Push failed");
      setMsg(`Pushed ${d.sent} value${d.sent === 1 ? "" : "s"} to the MIS${d.failed ? `, ${d.failed} failed` : ""}.`);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  };

  const runImport = async () => {
    if (!importClass) { setErr("Choose a class to import into."); return; }
    setBusy("import"); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/mis/import-guardians", { method: "POST", headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" }, body: JSON.stringify({ classId: importClass }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Import failed");
      setMsg(d.note || `Imported ${d.imported} guardian link${d.imported === 1 ? "" : "s"} into ${d.className} (${d.skipped} skipped). Set consent on the Parents screen.`);
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  };

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>School · Integrations</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Your <em style={{ fontStyle: "italic", color: C.grn }}>MIS</em>, connected.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: "54ch", lineHeight: 1.55 }}>
        Sync class lists and parent contacts straight from SIMS / Arbor / Bromcom via Wonde — then turn contacts into weekly-report guardians in one click.
      </p>

      {err && <Note color={C.red} bg={C.redS}>{err}</Note>}
      {msg && <Note color={C.grn} bg={C.grnS}>{msg}</Note>}

      {!status ? <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 12 }}>Loading…</div> : !status.configured ? (
        <Card>
          <H>Not connected yet</H>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            To connect, request app approval for your school in the Wonde dashboard, then set
            <Code>WONDE_TOKEN</Code> and <Code>WONDE_SCHOOL_ID</Code> in the server environment. This screen activates once they're set.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <StatusDot status={status.connection?.status || "pending"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Wonde · {status.connection?.mis_school_id || "—"}</div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>
                  {status.connection?.last_full_sync_at ? `Last sync ${new Date(status.connection.last_full_sync_at).toLocaleString("en-GB")}` : "Never synced"}
                </div>
              </div>
              {isSlt && <Btn onClick={runSync} disabled={busy === "sync"}>{busy === "sync" ? "Syncing…" : "Sync now"}</Btn>}
            </div>
            {status.connection?.last_error && <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>{status.connection.last_error}</div>}
            <div style={{ display: "flex", gap: 24, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.rule}` }}>
              <Stat n={status.counts.students} label="pupils" />
              <Stat n={status.counts.contacts} label="contacts" />
              <Stat n={status.counts.contactsWithEmail} label="with email" />
            </div>
            {!isSlt && <p style={{ fontSize: 11, color: C.dim, marginTop: 12 }}>Only senior leaders can run the sync.</p>}
          </Card>

          <div style={{ height: 18 }} />
          <Card>
            <H>Import parents into a class</H>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
              Creates guardian links (consent <strong>pending</strong>) from the synced contacts for that class's year group. Set consent and send on the Parents screen.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select value={importClass} onChange={(e) => setImportClass(e.target.value)}
                style={{ fontFamily: C.mono, fontSize: 13, padding: "9px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, minWidth: 200 }}>
                <option value="">Choose a class…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.year_group ? ` · Y${c.year_group}` : ""}</option>)}
              </select>
              <Btn onClick={runImport} disabled={busy === "import" || !importClass}>{busy === "import" ? "Importing…" : "Import guardians"}</Btn>
              <a href="/parents" style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, textDecoration: "none" }}>Go to Parents →</a>
            </div>
          </Card>

          {isSlt && (
            <>
              <div style={{ height: 18 }} />
              <Card>
                <H>Attainment write-back</H>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
                  Push grades back to the MIS marksheet. Upload a CSV of <Code>student_mis_id,value</Code> for an aspect, then push. Write-back is provider-gated — confirm your MIS supports it with Wonde.
                </p>
                <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                  <Stat n={status.writeback?.pending ?? 0} label="queued" />
                  <Stat n={status.writeback?.sent ?? 0} label="sent" />
                  <Stat n={status.writeback?.error ?? 0} label="errors" />
                </div>
                <label style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dim }}>MIS aspect (marksheet column)</label>
                <input value={wbAspect} onChange={(e) => setWbAspect(e.target.value)} placeholder="e.g. Science predicted grade"
                  style={{ width: "100%", margin: "6px 0 14px", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 13, background: C.bg, color: C.text, outline: "none" }} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ ...labelBtn(busy === "wbqueue") }}>
                    {busy === "wbqueue" ? "Queuing…" : "Upload grades CSV"}
                    <input type="file" accept=".csv,text/csv" onChange={onWbCsv} disabled={busy === "wbqueue"} style={{ display: "none" }} />
                  </label>
                  <Btn onClick={runWriteback} disabled={busy === "wbrun" || !(status.writeback?.pending)}>{busy === "wbrun" ? "Pushing…" : "Push pending to MIS"}</Btn>
                </div>
              </Card>
            </>
          )}

          {status.runs.length > 0 && (
            <>
              <div style={{ height: 28 }} />
              <SectionLabel>Sync log</SectionLabel>
              <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
                {status.runs.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
                    <StatusDot status={r.status === "ok" ? "active" : "error"} small />
                    <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{r.kind} sync</span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
                      {r.status === "ok" ? `${r.counts?.students ?? 0} pupils · ${r.counts?.contacts ?? 0} contacts` : (r.error || "error").slice(0, 48)}
                    </span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{new Date(r.started_at).toLocaleString("en-GB")}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const Card = ({ children }: { children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, padding: 20, background: C.surface }}>{children}</div>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>{children}</div>
);
const Code = ({ children }: { children: React.ReactNode }) => (
  <code style={{ fontFamily: C.mono, fontSize: 12, background: C.bg, padding: "1px 5px", borderRadius: 3, margin: "0 3px" }}>{children}</code>
);
// A file-input <label> styled like the soft button variant.
const labelBtn = (disabled: boolean): React.CSSProperties => ({
  display: "inline-block", padding: "8px 16px", borderRadius: 6, fontFamily: C.mono, fontSize: 12, fontWeight: 500,
  background: C.bg, color: C.text, border: `1px solid ${C.border}`, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
});
const Note = ({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) => (
  <div style={{ padding: "10px 14px", background: bg, border: `1px solid ${color}`, borderRadius: 6, color, fontSize: 13, marginBottom: 18 }}>{children}</div>
);
const Stat = ({ n, label }: { n: number; label: string }) => (
  <div><div style={{ fontFamily: C.serif, fontSize: 26, color: C.text, lineHeight: 1 }}>{n}</div><div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>{label}</div></div>
);
const StatusDot = ({ status, small }: { status: string; small?: boolean }) => {
  const map: any = { active: C.grn, pending: C.amb, error: C.red, disabled: C.dim };
  const c = map[status] || C.dim;
  const s = small ? 7 : 10;
  return <span style={{ width: s, height: s, borderRadius: "50%", background: c, flexShrink: 0 }} title={status} />;
};
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}>
    <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} /><span>{children}</span><span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
  </div>
);

export default function IntegrationsPage() {
  return <AppShell><IntegrationsContent /></AppShell>;
}
