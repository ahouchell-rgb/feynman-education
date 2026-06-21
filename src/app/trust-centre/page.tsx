// Public Trust Centre (NOW plan E3). Procurement-facing: security posture,
// data principles, and the sub-processor list a school's DPO asks for first.
// Outside the auth gate — a URL you can hand to procurement.

const COL = { bg: "#f4f4f2", card: "#fff", border: "#e5e5e0", text: "#1a1a1a", mut: "#555", dim: "#888", grn: "#1a7f5a" };
const wrap: React.CSSProperties = { fontFamily: "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif", color: COL.text, background: COL.bg, minHeight: "100dvh" };

const SUBPROCESSORS = [
  ["Supabase", "Database, auth, file storage", "Pupil/teacher/parent records (encrypted at rest)", "EU"],
  ["Anthropic (Claude)", "AI generation (lessons, feedforward, reports)", "Lesson/assessment content sent per request; not used to train models", "US/EU"],
  ["Resend", "Transactional email", "Parent/teacher email addresses + report content", "EU/US"],
  ["Wonde", "MIS integration (optional)", "Roster + contact data synced from the school MIS", "UK"],
  ["Stripe", "Payments (optional)", "Billing details — no card data touches our servers", "EU/US"],
  ["Vercel", "Application hosting / CDN", "Request metadata; no primary data store", "Global edge"],
];

const PRINCIPLES = [
  ["Data minimisation", "We collect only what a feature needs. Pupil practice is per-objective aggregates, not surveillance."],
  ["Owner-scoped by default", "Row-Level Security scopes every record to its owner. Cross-teacher/-school/-trust reads go through a single, role-gated function — never widened table access."],
  ["Consent for parents", "Parent reports are sent only to guardians with recorded consent; every email carries an unsubscribe link. Designed against the ICO Age-Appropriate Design Code for under-18s."],
  ["No client-held secrets", "Service-role keys, AI keys and integration tokens live server-side only. Roles are never client-self-assignable."],
  ["Retention & deletion", "Data follows a defined lifecycle; a pupil leaving triggers deletion. Schools can export or request deletion at any time."],
];

const Card = ({ children, style }: any) => (
  <div style={{ background: COL.card, border: `1px solid ${COL.border}`, borderRadius: 12, padding: 24, marginBottom: 20, ...style }}>{children}</div>
);

export default function TrustCentre() {
  return (
    <div style={wrap}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 64px" }}>
        <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: COL.dim, marginBottom: 6 }}>Feynman Education · Trust Centre</div>
        <h1 style={{ fontSize: 34, margin: "0 0 8px" }}>Security, privacy &amp; data protection</h1>
        <p style={{ color: COL.mut, fontSize: 15, lineHeight: 1.6, margin: "0 0 28px" }}>
          We process pupil, teacher and parent data on behalf of schools as a <strong>data processor</strong>. This page is for procurement and Data Protection Officers; a signed DPA and full sub-processor list are available on request.
        </p>

        <Card>
          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>How we handle data</h2>
          {PRINCIPLES.map(([h, d]) => (
            <div key={h} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{h}</div>
              <div style={{ color: COL.mut, fontSize: 13.5, lineHeight: 1.55 }}>{d}</div>
            </div>
          ))}
        </Card>

        <Card>
          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Sub-processors</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", color: COL.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>
                <th style={{ padding: "6px 8px" }}>Provider</th><th style={{ padding: "6px 8px" }}>Purpose</th><th style={{ padding: "6px 8px" }}>Data</th><th style={{ padding: "6px 8px" }}>Region</th>
              </tr></thead>
              <tbody>
                {SUBPROCESSORS.map((r) => (
                  <tr key={r[0]} style={{ borderTop: `1px solid ${COL.border}` }}>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{r[0]}</td>
                    <td style={{ padding: "8px", color: COL.mut }}>{r[1]}</td>
                    <td style={{ padding: "8px", color: COL.mut }}>{r[2]}</td>
                    <td style={{ padding: "8px", color: COL.mut, whiteSpace: "nowrap" }}>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Security measures</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: COL.mut, fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Encryption in transit (TLS) and at rest.</li>
            <li>Row-Level Security on every table; least-privilege, role-gated access.</li>
            <li>Server-side secrets only; signed webhooks; audited privileged actions.</li>
            <li>UK GDPR + DfE data-protection alignment; AADC for under-18 users.</li>
            <li><strong>On the roadmap:</strong> Cyber Essentials (+ Plus), ISO 27001, independent penetration testing.</li>
          </ul>
        </Card>

        <Card>
          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Your rights &amp; requests</h2>
          <p style={{ color: COL.mut, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 8px" }}>
            Schools and individuals can request data export or deletion at any time. Signed-in users can export their own data from the app. For a DPA, sub-processor updates, or a data request, contact <a href="mailto:privacy@feynman.education" style={{ color: COL.grn }}>privacy@feynman.education</a>.
          </p>
          <a href="/privacy" style={{ color: COL.grn, fontSize: 13.5 }}>Read the privacy notice →</a>
        </Card>

        <p style={{ textAlign: "center", color: COL.dim, fontSize: 12, marginTop: 28 }}>
          <a href="/" style={{ color: COL.dim }}>← Back to app</a>
        </p>
      </div>
    </div>
  );
}
