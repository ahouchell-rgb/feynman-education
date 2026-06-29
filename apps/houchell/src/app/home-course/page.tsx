"use client";
import { useEffect, useMemo, useState } from "react";
import { sk } from "@/lib/sk";
import { AppShell } from "@/components/AppShell";

// Teacher view of the home-learning course (public/learn/springboard.html).
// Lists pupils' synced progress (crowns / XP / streak) and lets a teacher mint a
// personal course link per pupil. Links are tied to the pupil's existing
// student_id where possible, so progress joins to the same pupil the parent
// portal already shows. Auth: teacher JWT via sk; data via /api/springboard/*.

const COL = { card: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)", text: "#f5f7fb", muted: "#9aa8bc", dim: "#7d8aa0", green: "#58e0c2", navy: "#7aa7ff", surf: "rgba(255,255,255,0.04)" };

interface Cls { id: string; name: string }
interface Pupil { studentId: string; name: string; classId: string | null; token: string; xp: number; crowns: number; streak: number; words: number; updatedAt: string | null }
interface RosterPupil { student_id: string | null; student_name: string; class_id: string | null; guardian?: { email?: string; full_name?: string } | null }

function heat(crowns: number) { return crowns > 0 ? COL.green : COL.dim; }
function ago(iso: string | null) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
}

function HomeCourseContent() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [roster, setRoster] = useState<RosterPupil[]>([]);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const linkFor = (token: string) => `${typeof location !== "undefined" ? location.origin : ""}/learn?t=${token}`;
  // Map a pupil's student_id → their parent's email (first guardian with one).
  const emailByStudent = useMemo(() => {
    const m = new Map<string, string>();
    roster.forEach((r) => { if (r.student_id && r.guardian?.email && !m.has(r.student_id)) m.set(r.student_id, r.guardian.email!); });
    return m;
  }, [roster]);
  // Open the teacher's own mail client with a pre-filled draft (they review + send).
  const emailHref = (to: string, name: string, link: string) =>
    `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`${name}'s home science course`)}` +
    `&body=${encodeURIComponent(`Hi,\n\nHere is ${name}'s personal link to our home science course. It works on any device — phone, tablet or laptop — and their progress saves automatically:\n\n${link}\n\nThey just open the link and start; no login or app to install.\n\nBest wishes`)}`;

  async function load() {
    try {
      const token = sk.auth.getToken();
      const r = await fetch("/api/springboard/class", { headers: { authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't load progress.");
      setClasses(d.classes || []);
      setPupils(d.pupils || []);
      if (!classId && d.classes?.[0]) setClassId(d.classes[0].id);
    } catch (e: any) { setErr(e.message); }
    // Roster of the teacher's pupils (for the "add" picker + parent email); best-effort under RLS.
    try {
      const rows = await sk.q("guardian_student", { params: { select: "student_id,student_name,class_id,guardian:guardians(email,full_name)", order: "student_name.asc" } });
      setRoster(Array.isArray(rows) ? rows : []);
    } catch { /* picker just falls back to free text */ }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function mint() {
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try {
      const token = sk.auth.getToken();
      const r = await fetch("/api/springboard/mint", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentName: name.trim(), classId: classId || undefined, studentId: studentId || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't create link.");
      setName(""); setStudentId("");
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function copy(token: string, who: string) {
    try { await navigator.clipboard.writeText(linkFor(token)); setCopied(who); setTimeout(() => setCopied(""), 1800); } catch { /* clipboard blocked */ }
  }

  const input: React.CSSProperties = { padding: "9px 11px", borderRadius: 8, border: `1px solid ${COL.border}`, fontSize: 14, background: "rgba(255,255,255,0.05)", color: COL.text };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: COL.dim, marginBottom: 6 }}>Houchell · Home course</div>
      <h1 style={{ fontSize: 28, margin: "0 0 6px" }}>Home-learning course</h1>
      <p style={{ color: COL.muted, margin: "0 0 24px", fontSize: 15 }}>
        Create a personal link for each pupil. They learn at home; their progress syncs back here automatically — no pupil login needed.
      </p>

      {err && <div style={{ background: "rgba(255,107,138,0.13)", border: "1px solid rgba(255,107,138,0.3)", color: "#ff6b8a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{err}</div>}

      {/* Create a link */}
      <div style={{ background: COL.surf, border: `1px solid ${COL.border}`, borderRadius: 12, padding: 18, marginBottom: 26 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Create a pupil link</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {roster.length > 0 && (
            <select style={input} value={studentId} onChange={(e) => {
              const id = e.target.value; setStudentId(id);
              const r = roster.find((x) => x.student_id === id);
              if (r) { setName(r.student_name); if (r.class_id) setClassId(r.class_id); }
            }}>
              <option value="">Pick a pupil (or type a name) …</option>
              {roster.filter((r) => r.student_id).map((r) => <option key={r.student_id!} value={r.student_id!}>{r.student_name}</option>)}
            </select>
          )}
          <input style={{ ...input, minWidth: 180 }} placeholder="Pupil name" value={name} onChange={(e) => { setName(e.target.value); setStudentId(""); }} />
          {classes.length > 0 && (
            <select style={input} value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button onClick={mint} disabled={busy || !name.trim()}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: COL.navy, color: "#06101e", fontWeight: 600, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy || !name.trim() ? 0.6 : 1 }}>
            {busy ? "Creating…" : "Create link"}
          </button>
        </div>
      </div>

      {/* Pupils + progress */}
      {pupils.length === 0 ? (
        <p style={{ color: COL.muted, fontSize: 14 }}>No pupil links yet. Create one above and share it — progress will appear here once they start.</p>
      ) : (
        <div style={{ border: `1px solid ${COL.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr .8fr .8fr .8fr 1.2fr", gap: 0, background: COL.surf, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: COL.dim, padding: "10px 14px" }}>
            <div>Pupil</div><div>Crowns</div><div>XP</div><div>Streak</div><div>Last active / link</div>
          </div>
          {pupils.map((p) => (
            <div key={p.studentId} style={{ display: "grid", gridTemplateColumns: "1.6fr .8fr .8fr .8fr 1.2fr", gap: 0, alignItems: "center", padding: "12px 14px", borderTop: `1px solid ${COL.border}`, fontSize: 14 }}>
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              <div style={{ color: heat(p.crowns), fontWeight: 600 }}>👑 {p.crowns}</div>
              <div>💎 {p.xp}</div>
              <div>🔥 {p.streak}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: COL.dim, fontSize: 12.5 }}>{ago(p.updatedAt)}</span>
                <button onClick={() => copy(p.token, p.studentId)} style={{ fontSize: 12.5, color: COL.navy, background: "none", border: `1px solid ${COL.border}`, borderRadius: 6, padding: "4px 9px", cursor: "pointer" }}>
                  {copied === p.studentId ? "Copied ✓" : "Copy link"}
                </button>
                {emailByStudent.get(p.studentId) && (
                  <a href={emailHref(emailByStudent.get(p.studentId)!, p.name, linkFor(p.token))}
                    title={`Email link to ${emailByStudent.get(p.studentId)}`}
                    style={{ fontSize: 12.5, color: COL.navy, textDecoration: "none", border: `1px solid ${COL.border}`, borderRadius: 6, padding: "4px 9px" }}>
                    Email parent
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomeCoursePage() {
  return <AppShell><HomeCourseContent /></AppShell>;
}
