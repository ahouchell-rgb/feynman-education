"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { sb } from "../../../lib/supabase";
import { C } from "../../../lib/theme";
import { WEEKLY_TARGET } from "../../../lib/week";

/* First-party parent progress report. A parent opens a revocable link
 * (/parent/<token>); we read just that pupil's progress via the SECURITY DEFINER
 * parent_report RPC (no account needed). Print-friendly so it doubles as the
 * printable parent report for parents' evening. */
export default function ParentReport() {
  const { token } = useParams();
  const [data, setData] = useState(undefined); // undefined = loading, null = invalid
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try { setData(await sb.rpc("parent_report", { p_token: token })); }
      catch (e) { setErr(e.message || "Could not load this report"); setData(null); }
    })();
  }, [token]);

  const wrap = { minHeight: "100dvh", background: C.bg, fontFamily: "var(--font-plex), -apple-system, sans-serif", color: C.txt, padding: "32px 16px" };
  const center = (msg) => <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: C.mid, fontSize: 14 }}>{msg}</div></div>;

  if (data === undefined) return center("Loading report…");
  if (err || data === null) return center("This report link is no longer valid. Please ask the school for a new one.");

  const total = data.total_answered || 0;
  const correct = data.total_correct || 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const week = data.week_answered || 0;
  const last = data.last_answered_at ? new Date(data.last_answered_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const recent = Array.isArray(data.recent) ? data.recent : [];

  const card = { background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 6, padding: "18px 16px", textAlign: "center", flex: "1 1 0" };
  const big = { fontFamily: C.serif, fontSize: 34, fontWeight: 500, lineHeight: 1 };
  const lab = { fontSize: 10, color: C.mid, marginTop: 8, textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 };

  return (
    <div style={wrap}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } @page { margin: 16mm; } }`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Feynman<span style={{ color: C.pri }}> Education</span></div>
            <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: 13, color: C.dim, marginTop: 2 }}>Retrieval practice — progress report</div>
          </div>
          <button className="no-print" onClick={() => window.print()} style={{ padding: "9px 16px", borderRadius: 3, border: `1px solid ${C.bdr}`, background: C.card, color: C.txt, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", letterSpacing: ".06em" }}>Print / Save PDF</button>
        </div>

        <div style={{ borderTop: `2px solid ${C.bdr}`, paddingTop: 16, marginBottom: 22 }}>
          <div style={{ fontFamily: C.serif, fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em" }}>{data.student_name || "Pupil"}</div>
          <div style={{ fontSize: 13, color: C.mid, marginTop: 2 }}>{data.class_name || "Science"}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          <div style={card}><div style={big}>{total}</div><div style={lab}>Questions answered</div></div>
          <div style={card}><div style={{ ...big, color: accuracy >= 70 ? C.grn : accuracy >= 50 ? C.amb : C.red }}>{accuracy}%</div><div style={lab}>Accuracy</div></div>
          <div style={card}><div style={{ ...big, color: week >= WEEKLY_TARGET ? C.grn : C.txt }}>{week}<span style={{ fontSize: 16, color: C.dim }}>/{WEEKLY_TARGET}</span></div><div style={lab}>This week</div></div>
        </div>

        <div style={{ fontSize: 13, color: C.mid, marginBottom: 8, fontWeight: 600 }}>Recent activity</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: C.dim }}>No practice recorded yet.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 18 }}>
            {recent.map((r, i) => (
              <span key={i} title={r.answered_at ? new Date(r.answered_at).toLocaleDateString("en-GB") : ""}
                style={{ width: 14, height: 14, borderRadius: 3, background: r.is_correct ? C.grn : C.red, opacity: 0.85 }} />
            ))}
          </div>
        )}

        <div style={{ fontSize: 12, color: C.dim, marginTop: 18, lineHeight: 1.6, borderTop: `1px solid ${C.bdr}`, paddingTop: 14 }}>
          Last practised: {last}. Each square is one answered question — <span style={{ color: C.grn }}>green</span> correct,
          <span style={{ color: C.red }}> red</span> needs another look. Spaced repetition automatically brings back the
          questions your child finds hardest. Questions? Contact the school.
        </div>
      </div>
    </div>
  );
}
