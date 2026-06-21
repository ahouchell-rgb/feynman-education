"use client";
import { useEffect, useState } from "react";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

// Account & activity (NOW plan E4). One place for a user's account, a self-serve
// data export, their audit trail, and links to the admin surfaces. Gives the
// audit log a home and ties the scattered self-serve admin together.

const ACTION_LABEL: Record<string, string> = {
  "data.export": "Exported your data",
  "mis.sync": "Ran an MIS sync",
  "mis.writeback": "Pushed attainment to the MIS",
  "role.change": "Changed a staff role",
};

function AccountContent() {
  const { profile, user } = useAuth();
  const [audit, setAudit] = useState<any[]>([]);
  const isSlt = profile?.school_role === "slt";

  useEffect(() => {
    sk.q("audit_log", { params: { select: "action,target,detail,at", order: "at.desc", limit: "20" } }).then(setAudit).catch(() => {});
  }, []);

  const exportData = () => {
    fetch("/api/account/export", { headers: { authorization: `Bearer ${sk.auth.getToken()}` } })
      .then((r) => r.blob()).then((b) => { const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "feynman-data-export.json"; a.click(); URL.revokeObjectURL(u); });
  };

  const links: [string, string][] = [
    ["/billing", "Billing & plan"],
    ...(isSlt ? ([["/school", "School dashboard"], ["/school/integrations", "Integrations"]] as [string, string][]) : []),
    ["/trust-centre", "Trust Centre"],
    ["/privacy", "Privacy notice"],
  ];

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} /><span>Account</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, marginBottom: 8 }}>{profile?.full_name || "Your account"}</h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 28 }}>{user?.email} · <span style={{ fontFamily: C.mono, fontSize: 12 }}>{profile?.school_role || "teacher"}</span></p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 32 }}>
        <Btn v="soft" onClick={exportData}>⬇ Export my data</Btn>
        {links.map(([href, label]) => <a key={href} href={href} style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, textDecoration: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 14px" }}>{label} →</a>)}
      </div>

      <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 12px", display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} /><span>Your recent activity</span><span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
      </div>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
        {audit.length === 0 ? <div style={{ padding: 20, color: C.dim, fontFamily: C.mono, fontSize: 12 }}>No recorded activity yet.</div> :
          audit.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}>
              <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{ACTION_LABEL[a.action] || a.action}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{new Date(a.at).toLocaleString("en-GB")}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return <AppShell><AccountContent /></AppShell>;
}
