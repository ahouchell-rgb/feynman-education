// Public privacy notice (NOW plan E3). Plain-English, accurate to the product.
// Outside the auth gate. Not legal advice — a starting point for counsel to finalise.

const COL = { bg: "#f4f4f2", card: "#fff", border: "#e5e5e0", text: "#1a1a1a", mut: "#555", dim: "#888", grn: "#1a7f5a" };

const SECTIONS: [string, string][] = [
  ["Who we are", "Houchell Education provides planning, practice and analytics tools to schools. For pupil data we act as a data processor on the school's instructions; the school is the data controller. For teachers' and parents' own account data we are the controller."],
  ["What we collect", "Teacher accounts (name, email, school role). Class and curriculum data. Pupil practice and assessment data as per-objective results. Parent/guardian contact and consent. Optional MIS roster data (when a school connects it). Billing details for paid plans (handled by Stripe — we never store card numbers)."],
  ["Why, and our lawful basis", "To deliver the service the school has contracted (performance of contract / public task for the school). Parent communications rely on consent, which a parent can withdraw at any time via the unsubscribe link. We do not sell data or use pupil data to train AI models."],
  ["AI processing", "Some features send lesson, assessment or gap content to our AI provider (Anthropic) to generate teaching material or reports. Inputs are processed per request and are not used to train their models."],
  ["Sharing", "Only with the sub-processors listed in our Trust Centre, each under a data-processing agreement, strictly to run the service."],
  ["Retention", "We keep data for as long as the school's contract requires, then delete or anonymise it. A pupil leaving triggers deletion of their personal data. Schools can request export or deletion at any time."],
  ["Your rights", "Access, correction, deletion, restriction, portability and objection under UK GDPR. Signed-in users can export their own data in-app. To exercise rights relating to pupil data, contact the school (controller); we will assist them."],
  ["Children", "Pupil-facing features are designed against the ICO Age-Appropriate Design Code. We collect the minimum necessary and default to the most protective settings."],
  ["Contact", "privacy@houchelleducation.com — for data requests, our DPO, or a copy of our DPA."],
];

export default function Privacy() {
  return (
    <div style={{ fontFamily: "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif", color: COL.text, background: COL.bg, minHeight: "100dvh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 64px" }}>
        <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: COL.dim, marginBottom: 6 }}>Houchell Education</div>
        <h1 style={{ fontSize: 32, margin: "0 0 6px" }}>Privacy notice</h1>
        <p style={{ color: COL.dim, fontSize: 13, margin: "0 0 28px" }}>Plain-English summary — to be finalised with counsel before launch.</p>
        {SECTIONS.map(([h, d]) => (
          <div key={h} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>{h}</h2>
            <p style={{ color: COL.mut, fontSize: 14, lineHeight: 1.65, margin: 0 }}>{d}</p>
          </div>
        ))}
        <p style={{ textAlign: "center", color: COL.dim, fontSize: 12, marginTop: 24 }}>
          <a href="/trust-centre" style={{ color: COL.grn }}>Trust Centre</a> · <a href="/" style={{ color: COL.dim }}>Back to app</a>
        </p>
      </div>
    </div>
  );
}
