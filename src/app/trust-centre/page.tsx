// Public Trust Centre (NOW plan E3). Procurement-facing: security posture,
// data principles, and the sub-processor list a school's DPO asks for first.
// Outside the auth gate — a URL you can hand to procurement.
//
// Primary data region: UK (London). The security/DPO contact is env-driven
// (NEXT_PUBLIC_SECURITY_CONTACT) so it can be pointed at a monitored inbox per
// deployment without a code change; it defaults to security@feynman.education.

const SECURITY_CONTACT = process.env.NEXT_PUBLIC_SECURITY_CONTACT || "security@feynman.education";

// `dim` darkened #888 → #5f5f5f for WCAG AA contrast (4.5:1) on the light bg.
const COL = { bg: "#f4f4f2", card: "#fff", border: "#e5e5e0", text: "#1a1a1a", mut: "#555", dim: "#5f5f5f", grn: "#1a7f5a" };
const wrap: React.CSSProperties = { fontFamily: "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif", color: COL.text, background: COL.bg, minHeight: "100dvh" };

// Provider, purpose, data shared, processing region, and a link to the vendor's
// security / DPA page so a DPO can verify each sub-processor directly.
const SUBPROCESSORS: [string, string, string, string, string][] = [
  ["Supabase", "Database, authentication, file storage", "Pupil/teacher/parent records (encrypted at rest)", "UK (London)", "https://supabase.com/security"],
  ["Anthropic (Claude)", "AI generation (lessons, feedforward, reports)", "Lesson/assessment content sent per request; not used to train models", "US", "https://www.anthropic.com/legal/commercial-terms"],
  ["Stripe", "Payments (optional, paid plans only)", "Billing details — no card data touches our servers", "EU/US", "https://stripe.com/gb/privacy"],
  ["Resend", "Parent-report email delivery (optional)", "Parent/teacher email addresses + report content", "EU/US", "https://resend.com/legal/dpa"],
  ["Wonde", "MIS sync (optional, per-school)", "Roster + contact data synced from the school MIS", "UK", "https://www.wonde.com/security"],
  ["Google", "Drive / Slides import (optional, per-teacher OAuth)", "Only files a teacher explicitly picks (drive.file scope)", "Global", "https://workspace.google.com/terms/dpa_terms.html"],
  ["Microsoft", "Slides / PowerPoint import (optional, per-teacher OAuth)", "Only files a teacher explicitly picks", "Global", "https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA"],
  ["Vercel", "Application hosting / CDN", "Request metadata; no primary data store", "Global edge", "https://vercel.com/legal/dpa"],
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

const H2 = ({ children }: any) => <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>{children}</h2>;
const P = ({ children, style }: any) => <p style={{ color: COL.mut, fontSize: 13.5, lineHeight: 1.6, margin: "0 0 8px", ...style }}>{children}</p>;

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
          <H2>How we handle data</H2>
          {PRINCIPLES.map(([h, d]) => (
            <div key={h} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{h}</div>
              <div style={{ color: COL.mut, fontSize: 13.5, lineHeight: 1.55 }}>{d}</div>
            </div>
          ))}
        </Card>

        <Card>
          <H2>Data we hold &amp; who controls it</H2>
          <P>
            <strong>Teacher accounts</strong> (name, email, school role), <strong>classes &amp; curriculum</strong>, <strong>guardian</strong> contact and consent records, and <strong>pupil practice / mastery at cohort level</strong> (per-objective results, not free-text surveillance). Billing details for paid plans are held by Stripe; we never store card numbers.
          </P>
          <P>
            <strong>Controller / processor split.</strong> For pupil records the <strong>school is the data controller</strong> and ScienceKit / Feynman Education is the <strong>processor</strong>, acting only on the school's documented instructions. For teachers' and parents' own account data we are the controller.
          </P>
        </Card>

        <Card>
          <H2>Data residency</H2>
          <P>
            Primary data (the database, authentication and file storage) is hosted on Supabase in the <strong>UK (London)</strong> region. Content sent for AI generation is processed by Anthropic in the US per request and is not retained for model training. Other sub-processors are listed below with their regions.
          </P>
        </Card>

        <Card>
          <H2>Pupil data &amp; AI</H2>
          <P>
            Some features send lesson, assessment or gap content to our AI provider (Anthropic) to generate teaching material, feedforward and parent reports. Inputs are processed per request.
          </P>
          <P style={{ fontWeight: 600, color: COL.text }}>
            Pupil practice data is not used to train AI models. Under Anthropic's commercial terms, prompts and pupil data sent to the API are not used to train their models.
          </P>
        </Card>

        <Card>
          <H2>Sub-processors</H2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", color: COL.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>
                <th style={{ padding: "6px 8px" }}>Provider</th><th style={{ padding: "6px 8px" }}>Purpose</th><th style={{ padding: "6px 8px" }}>Data</th><th style={{ padding: "6px 8px" }}>Region</th>
              </tr></thead>
              <tbody>
                {SUBPROCESSORS.map((r) => (
                  <tr key={r[0]} style={{ borderTop: `1px solid ${COL.border}` }}>
                    <td style={{ padding: "8px", fontWeight: 600 }}><a href={r[4]} target="_blank" rel="noopener noreferrer" style={{ color: COL.grn, textDecoration: "none" }}>{r[0]} ↗</a></td>
                    <td style={{ padding: "8px", color: COL.mut }}>{r[1]}</td>
                    <td style={{ padding: "8px", color: COL.mut }}>{r[2]}</td>
                    <td style={{ padding: "8px", color: COL.mut, whiteSpace: "nowrap" }}>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P style={{ marginTop: 12, fontSize: 12, color: COL.dim }}>
            Provider links go to each vendor's security or data-processing page. Optional integrations (Stripe, Resend, Wonde, Google, Microsoft) only process data once a school or teacher enables them.
          </P>
        </Card>

        <Card>
          <H2>Security measures</H2>
          <ul style={{ margin: 0, paddingLeft: 18, color: COL.mut, fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Encryption in transit (TLS) and at rest (Supabase-managed encryption).</li>
            <li>Row-Level Security on every table; least-privilege, role-gated access.</li>
            <li>Audit logging of privileged actions (data exports, role changes, MIS sync).</li>
            <li>Server-side secrets only; signed webhooks; no client-held service keys.</li>
            <li>UK GDPR + DfE data-protection alignment; AADC for under-18 users.</li>
          </ul>
        </Card>

        <Card>
          <H2>Certifications</H2>
          <P>
            We follow UK GDPR and the ICO Age-Appropriate Design Code, and align our controls with recognised standards (encryption, access control, audit logging, least privilege). We do not currently hold ISO 27001 or Cyber Essentials certification.
          </P>
          <P>
            Our data-protection documentation, security overview and DPA are available on request. Independent certification and penetration testing are on our roadmap.
          </P>
        </Card>

        <Card>
          <H2>Your rights &amp; requests</H2>
          <P>
            <strong>Export.</strong> Signed-in users can export their own data from the app, or via the in-app{" "}
            <a href="/account" style={{ color: COL.grn }}>account page</a> ("Export my data"). The export is a JSON bundle of the caller's owner-scoped records.
          </P>
          <P>
            <strong>Retention &amp; deletion.</strong> We keep data for as long as the school's contract requires, then delete or anonymise it. A pupil leaving triggers deletion of their personal data. Schools and individuals can request export or deletion at any time; we action verified requests and confirm completion.
          </P>
          <P>
            <strong>Parent unsubscribe.</strong> Every parent report email carries an unsubscribe link; parents can also stop emails per child from the parent portal at any time.
          </P>
          <P>
            For a DPA, sub-processor updates, or a data-subject request, contact{" "}
            <a href="mailto:privacy@feynman.education" style={{ color: COL.grn }}>privacy@feynman.education</a>.
          </P>
          <a href="/privacy" style={{ color: COL.grn, fontSize: 13.5 }}>Read the privacy notice →</a>
        </Card>

        <Card>
          <H2>Incident response &amp; contact</H2>
          <P>
            We maintain an incident-response process and will notify affected schools without undue delay on becoming aware of a personal-data breach. Where a breach is reportable, we commit to supporting the controller school's notification to the ICO within <strong>72 hours</strong> as required by UK GDPR.
          </P>
          <P>
            Security &amp; data-protection contact:{" "}
            <a href={`mailto:${SECURITY_CONTACT}`} style={{ color: COL.grn }}>{SECURITY_CONTACT}</a>.
          </P>
        </Card>

        <p style={{ textAlign: "center", color: COL.dim, fontSize: 12, marginTop: 28 }}>
          <a href="/" style={{ color: COL.dim }}>← Back to app</a>
        </p>
      </div>
    </div>
  );
}
