"use client";
import Link from "next/link";

// Public marketing landing — shown at "/" to logged-out visitors. A faithful
// port of the sleek dark mockup, scoped under #lp so its generic class names
// (.nav, .hero, .btn…) can't leak into the app's styles.
const CSS = `
#lp { --accent:#58e0c2; --accent-2:#7aa7ff; --accent-3:#ffd166; --text:#f5f7fb; --muted:#9aa8bc; --line:rgba(255,255,255,0.12); --shadow:0 24px 70px rgba(0,0,0,0.35); color:var(--text); font-family:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif; }
#lp a { color:inherit; text-decoration:none; }
#lp .page { width:min(1180px, calc(100% - 36px)); margin:0 auto; }
#lp .nav { position:sticky; top:0; z-index:10; backdrop-filter:blur(20px); background:rgba(7,17,31,0.72); border-bottom:1px solid var(--line); }
#lp .nav-inner { width:min(1180px, calc(100% - 36px)); margin:0 auto; display:flex; align-items:center; justify-content:space-between; padding:16px 0; gap:16px; }
#lp .brand { display:flex; align-items:center; gap:11px; font-family:'Instrument Serif',Georgia,serif; font-size:1.45rem; letter-spacing:-0.01em; }
#lp .brand em { font-style:italic; color:var(--accent); }
#lp .brand-mark { width:38px; height:38px; border-radius:13px; background:linear-gradient(135deg,var(--accent),var(--accent-2)); display:grid; place-items:center; box-shadow:0 12px 35px rgba(88,224,194,0.22); color:#06101e; font-weight:900; font-family:'Instrument Serif',Georgia,serif; font-size:1.25rem; }
#lp .nav-links { display:flex; gap:6px; align-items:center; padding:5px; border:1px solid var(--line); border-radius:999px; background:rgba(255,255,255,0.045); }
#lp .nav-links a { color:var(--muted); padding:8px 14px; border-radius:999px; font-size:0.9rem; font-weight:600; transition:0.18s ease; }
#lp .nav-links a:hover, #lp .nav-links a.active { color:var(--text); background:rgba(255,255,255,0.1); }
#lp .nav-actions { display:flex; align-items:center; gap:10px; }
#lp .btn { border:1px solid var(--line); background:rgba(255,255,255,0.08); color:var(--text); border-radius:999px; padding:11px 17px; font-weight:700; font-size:0.9rem; cursor:pointer; transition:transform .18s ease, background .18s ease; display:inline-flex; align-items:center; gap:8px; }
#lp .btn:hover { transform:translateY(-1px); background:rgba(255,255,255,0.13); }
#lp .btn-primary { background:linear-gradient(135deg,var(--accent),var(--accent-2)); color:#06101e; border:0; box-shadow:0 18px 45px rgba(88,224,194,0.22); }
#lp .hero { display:grid; grid-template-columns:1.05fr 0.95fr; gap:34px; align-items:center; padding:72px 0 46px; }
#lp .eyebrow { width:fit-content; display:flex; gap:8px; align-items:center; color:#bff8ea; border:1px solid rgba(88,224,194,0.26); background:rgba(88,224,194,0.08); padding:8px 12px; border-radius:999px; font-size:0.9rem; font-weight:700; margin-bottom:22px; }
#lp .hero h1 { margin:0; font-family:'Instrument Serif',Georgia,serif; font-size:clamp(3rem,6vw,5.5rem); line-height:0.95; letter-spacing:-0.03em; }
#lp .hero h1 span { background:linear-gradient(135deg,#ffffff,#cbd8ef 55%,#95ffea); -webkit-background-clip:text; background-clip:text; color:transparent; }
#lp .hero p { color:var(--muted); font-size:1.12rem; line-height:1.7; max-width:620px; margin:24px 0 28px; }
#lp .hero-actions { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:28px; }
#lp .trust-row { display:flex; gap:18px; flex-wrap:wrap; color:var(--muted); font-size:0.92rem; }
#lp .trust-row strong { color:var(--text); }
#lp .product-shell { border:1px solid var(--line); background:linear-gradient(180deg,rgba(255,255,255,0.13),rgba(255,255,255,0.055)); border-radius:30px; padding:18px; box-shadow:var(--shadow); position:relative; overflow:hidden; }
#lp .product-shell::before { content:""; position:absolute; width:260px; height:260px; border-radius:50%; background:rgba(88,224,194,0.12); filter:blur(8px); right:-90px; top:-100px; }
#lp .dashboard { position:relative; background:rgba(4,11,22,0.74); border:1px solid var(--line); border-radius:24px; overflow:hidden; }
#lp .dash-top { display:flex; justify-content:space-between; align-items:center; padding:18px; border-bottom:1px solid var(--line); }
#lp .traffic { display:flex; gap:7px; }
#lp .dot { width:10px; height:10px; border-radius:50%; background:rgba(255,255,255,0.22); }
#lp .dash-title { color:var(--muted); font-size:0.86rem; font-weight:700; }
#lp .dash-body { display:grid; grid-template-columns:86px 1fr; min-height:440px; }
#lp .side-rail { border-right:1px solid var(--line); padding:16px 12px; display:flex; flex-direction:column; gap:10px; }
#lp .rail-item { height:54px; border-radius:17px; display:grid; place-items:center; color:var(--muted); background:rgba(255,255,255,0.045); border:1px solid transparent; font-size:1.2rem; }
#lp .rail-item.active { background:rgba(88,224,194,0.13); border-color:rgba(88,224,194,0.24); color:var(--accent); }
#lp .main-panel { padding:18px; }
#lp .lesson-card { border:1px solid var(--line); background:linear-gradient(135deg,rgba(88,224,194,0.13),rgba(122,167,255,0.1)),rgba(255,255,255,0.04); border-radius:22px; padding:18px; margin-bottom:14px; }
#lp .lesson-card h3 { margin:0 0 8px; letter-spacing:-0.02em; font-size:1.35rem; }
#lp .progress-wrap { background:rgba(255,255,255,0.12); border-radius:999px; height:10px; overflow:hidden; margin:14px 0; }
#lp .progress { width:68%; height:100%; border-radius:inherit; background:linear-gradient(90deg,var(--accent),var(--accent-2)); }
#lp .mini-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
#lp .mini-card { border:1px solid var(--line); background:rgba(255,255,255,0.055); border-radius:18px; padding:15px; }
#lp .mini-card small { color:var(--muted); font-weight:700; }
#lp .mini-card strong { display:block; font-size:1.3rem; margin-top:8px; letter-spacing:-0.03em; }
#lp .question-card { margin-top:14px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.08); border-radius:20px; padding:16px; }
#lp .option { margin-top:10px; padding:12px; border-radius:14px; background:rgba(255,255,255,0.07); color:var(--muted); border:1px solid var(--line); }
#lp .option.correct { border-color:rgba(88,224,194,0.38); background:rgba(88,224,194,0.13); color:#d7fff6; }
#lp .section { padding:50px 0; }
#lp .section-heading { display:flex; justify-content:space-between; align-items:end; gap:24px; margin-bottom:22px; }
#lp .section-heading h2 { margin:0; font-family:'Instrument Serif',Georgia,serif; font-size:clamp(2rem,4vw,3.1rem); line-height:1; letter-spacing:-0.03em; }
#lp .section-heading p { color:var(--muted); line-height:1.55; max-width:470px; margin:0; }
#lp .bento { display:grid; grid-template-columns:repeat(12,1fr); gap:16px; }
#lp .feature-card { border:1px solid var(--line); border-radius:22px; background:linear-gradient(180deg,rgba(255,255,255,0.095),rgba(255,255,255,0.045)); padding:22px; min-height:230px; position:relative; overflow:hidden; transition:transform .18s ease, border-color .18s ease; display:block; }
#lp .feature-card:hover { transform:translateY(-3px); border-color:rgba(255,255,255,0.24); }
#lp .feature-card.large { grid-column:span 6; min-height:300px; }
#lp .feature-card.medium { grid-column:span 4; }
#lp .feature-card.wide { grid-column:span 8; }
#lp .feature-card.small { grid-column:span 4; }
#lp .feature-icon { width:48px; height:48px; border-radius:16px; display:grid; place-items:center; background:rgba(255,255,255,0.09); border:1px solid var(--line); margin-bottom:18px; font-size:1.3rem; }
#lp .feature-card h3 { margin:0 0 10px; font-family:'Instrument Serif',Georgia,serif; font-size:1.7rem; letter-spacing:-0.02em; }
#lp .feature-card p { margin:0; color:var(--muted); line-height:1.6; }
#lp .pill-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:18px; }
#lp .pill { color:#cbd8ef; border:1px solid var(--line); background:rgba(255,255,255,0.055); border-radius:999px; padding:7px 10px; font-size:0.8rem; font-weight:700; }
#lp .mock-list { margin-top:20px; display:grid; gap:10px; }
#lp .mock-list div { display:flex; justify-content:space-between; gap:12px; padding:12px; border-radius:14px; background:rgba(255,255,255,0.055); border:1px solid var(--line); color:var(--muted); font-size:0.9rem; }
#lp .mock-list strong { color:var(--text); }
#lp .journey { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
#lp .journey-card { border:1px solid var(--line); background:rgba(255,255,255,0.065); border-radius:30px; padding:28px; min-height:280px; }
#lp .journey-card h3 { font-family:'Instrument Serif',Georgia,serif; font-size:1.9rem; letter-spacing:-0.02em; margin:0 0 14px; }
#lp .journey-card ol { margin:22px 0 0; padding-left:20px; color:var(--muted); line-height:1.75; }
#lp .journey-card li + li { margin-top:7px; }
#lp .cta { margin:52px 0 64px; border:1px solid rgba(88,224,194,0.26); border-radius:34px; padding:36px; background:radial-gradient(circle at 100% 0%,rgba(88,224,194,0.18),transparent 34%),linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.055)); box-shadow:var(--shadow); display:flex; justify-content:space-between; align-items:center; gap:24px; }
#lp .cta h2 { margin:0; font-family:'Instrument Serif',Georgia,serif; font-size:clamp(2rem,4vw,3.1rem); letter-spacing:-0.03em; line-height:1; }
#lp .cta p { color:var(--muted); max-width:610px; line-height:1.6; margin:14px 0 0; }
#lp .footer { border-top:1px solid var(--line); padding:26px 0 46px; color:var(--muted); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; font-size:0.9rem; }
@media (max-width:920px){ #lp .hero{ grid-template-columns:1fr; padding-top:46px; } #lp .nav-links{ display:none; } #lp .section-heading, #lp .cta{ align-items:start; flex-direction:column; } #lp .feature-card.large, #lp .feature-card.medium, #lp .feature-card.wide, #lp .feature-card.small{ grid-column:span 12; } #lp .journey{ grid-template-columns:1fr; } }
@media (max-width:620px){ #lp .nav-actions .btn.login{ display:none; } #lp .dash-body{ grid-template-columns:1fr; } #lp .side-rail{ display:none; } #lp .mini-grid{ grid-template-columns:1fr; } #lp .hero h1{ font-size:3rem; } }
`;

export function Landing() {
  return (
    <div id="lp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="nav">
        <div className="nav-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">H</span>
            <span>Hou<em>chell</em></span>
          </Link>
          <nav className="nav-links" aria-label="Sections">
            <Link href="/" className="active">Home</Link>
            <Link href="/learn">Learn</Link>
            <Link href="/revise">Revise</Link>
            <Link href="/retrieve">Retrieve</Link>
            <Link href="/login">Teacher</Link>
            <Link href="/tools">Tools</Link>
          </nav>
          <div className="nav-actions">
            <Link className="btn login" href="/login">Log in</Link>
            <Link className="btn btn-primary" href="/login">Start free</Link>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div>
            <div className="eyebrow">⚡ KS3 &amp; GCSE science, built for real classrooms</div>
            <h1><span>Learn. Revise.<br />Retrieve. Teach.</span></h1>
            <p>One science platform where pupils build knowledge through guided lessons, interactive revision and AI-marked retrieval — and teachers plan, deliver and check understanding without juggling five tools.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/learn">Explore the platform →</Link>
              <Link className="btn" href="/login">View teacher tools</Link>
            </div>
            <div className="trust-row">
              <span><strong>KS3</strong> foundations</span>
              <span><strong>GCSE</strong> exam practice</span>
              <span><strong>AI</strong> marking</span>
              <span><strong>Teacher</strong> dashboards</span>
            </div>
          </div>

          <div className="product-shell">
            <div className="dashboard">
              <div className="dash-top">
                <div className="traffic"><span className="dot" /><span className="dot" /><span className="dot" /></div>
                <div className="dash-title">Student learning dashboard</div>
              </div>
              <div className="dash-body">
                <aside className="side-rail">
                  <div className="rail-item active">🧪</div>
                  <div className="rail-item">📘</div>
                  <div className="rail-item">🎯</div>
                  <div className="rail-item">📊</div>
                  <div className="rail-item">🛠</div>
                </aside>
                <section className="main-panel">
                  <div className="lesson-card">
                    <h3>Particles: Lesson 4</h3>
                    <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5 }}>Explain why gas pressure increases when temperature rises.</p>
                    <div className="progress-wrap"><div className="progress" /></div>
                    <small style={{ color: "var(--muted)", fontWeight: 700 }}>68% complete · 12 XP today</small>
                  </div>
                  <div className="mini-grid">
                    <div className="mini-card"><small>Retrieval streak</small><strong>9 days</strong></div>
                    <div className="mini-card"><small>Teacher feedback</small><strong>3 actions</strong></div>
                  </div>
                  <div className="question-card">
                    <strong>Hinge question</strong>
                    <p style={{ color: "var(--muted)", lineHeight: 1.5 }}>What happens to particles when a substance is heated?</p>
                    <div className="option">A. They get bigger</div>
                    <div className="option correct">B. They move faster</div>
                    <div className="option">C. They disappear</div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-heading">
            <h2>Five sections. One learning loop.</h2>
            <p>Each area has a clear job, but they connect: pupils learn content, revise it, retrieve it — and teachers see exactly what needs reteaching.</p>
          </div>
          <div className="bento">
            <Link className="feature-card large" href="/learn">
              <div className="feature-icon">🧪</div>
              <h3>Learn</h3>
              <p>Duolingo-style science lessons for KS3 and GCSE. Short explanations, low-stakes checks, XP, streaks and mastery paths.</p>
              <div className="pill-row"><span className="pill">Micro-lessons</span><span className="pill">Streaks</span><span className="pill">Hinge questions</span></div>
              <div className="mock-list">
                <div><span>Cells and organisation</span><strong>72%</strong></div>
                <div><span>Energy transfers</span><strong>Mastered</strong></div>
                <div><span>Atomic structure</span><strong>Next</strong></div>
              </div>
            </Link>
            <Link className="feature-card large" href="/revise">
              <div className="feature-icon">📘</div>
              <h3>Revise</h3>
              <p>Interactive revision that feels like a guided workbook, not a PDF. Reveal answers, self-test, and check exam technique.</p>
              <div className="pill-row"><span className="pill">Knowledge organisers</span><span className="pill">Reveal answers</span><span className="pill">Worked examples</span></div>
              <div className="mock-list">
                <div><span>Foundation revision pathway</span><strong>GCSE</strong></div>
                <div><span>6-mark structure builder</span><strong>Practice</strong></div>
                <div><span>Topic confidence tracker</span><strong>Live</strong></div>
              </div>
            </Link>
            <Link className="feature-card medium" href="/retrieve">
              <div className="feature-icon">🎯</div>
              <h3>Retrieve</h3>
              <p>AI-marked retrieval homework. Pupils answer little and often; teachers see class gaps and misconceptions instantly.</p>
              <div className="pill-row"><span className="pill">AI marking</span><span className="pill">Homework</span><span className="pill">Misconceptions</span></div>
            </Link>
            <Link className="feature-card wide" href="/login">
              <div className="feature-icon">👩‍🏫</div>
              <h3>Teacher</h3>
              <p>A curriculum-loaded planning workspace: generate and edit slides, store timetables, sequence lessons, assign retrieval and analyse performance — without jumping between five tools.</p>
              <div className="pill-row"><span className="pill">Editable slides</span><span className="pill">Curriculum map</span><span className="pill">Timetable</span><span className="pill">Class analytics</span><span className="pill">Reteach suggestions</span></div>
            </Link>
            <Link className="feature-card small" href="/tools">
              <div className="feature-icon">🛠</div>
              <h3>Tools</h3>
              <p>Interactive science tools: particle models, circuit builders, equation practice, simulations and practical walkthroughs.</p>
              <div className="pill-row"><span className="pill">Simulations</span><span className="pill">Models</span><span className="pill">Practicals</span></div>
            </Link>
          </div>
        </section>

        <section className="section">
          <div className="section-heading">
            <h2>Built around two journeys.</h2>
            <p>The platform feels different depending on whether you’re a pupil or a teacher. Same platform, different dashboard.</p>
          </div>
          <div className="journey">
            <div className="journey-card">
              <h3>For pupils</h3>
              <p style={{ color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>Simple, motivating and low-friction. They always know what to do next.</p>
              <ol>
                <li>Continue today’s Learn pathway.</li>
                <li>Complete retrieval homework.</li>
                <li>Open a revision doc before a test.</li>
                <li>Earn streaks, badges and topic mastery.</li>
              </ol>
            </div>
            <div className="journey-card">
              <h3>For teachers</h3>
              <p style={{ color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>Planning, delivery and checking understanding in one place.</p>
              <ol>
                <li>View timetable and next lesson.</li>
                <li>Edit curriculum-loaded slides.</li>
                <li>Assign retrieval to classes.</li>
                <li>Check AI-marked homework and reteach gaps.</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="cta">
          <div>
            <h2>Science learning, without the admin drag.</h2>
            <p>Engaging enough for pupils, rigorous enough for GCSE, and practical enough for busy departments — the bridge between pupil practice and teacher workload.</p>
          </div>
          <Link className="btn btn-primary" href="/login">Get started →</Link>
        </section>

        <footer className="footer">
          <span>© Houchell Education</span>
          <span>Learn · Revise · Retrieve · Teacher · Tools</span>
        </footer>
      </main>
    </div>
  );
}
