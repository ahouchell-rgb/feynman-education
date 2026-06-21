"use client";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth, sk } from "@/lib/sk";
import { C, DISC, unitAccent } from "@/lib/theme";
import { sanitizeHtml } from "@/lib/sanitize";
import { Btn, Card, RichEditor } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";
import { FileUpload } from "@/components/FileUpload";
import { ResourceItem, ResourceViewer } from "@/components/Resources";

const stripTags = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function UnitContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const unitId = params.unitId;
  const classId = searchParams.get("class"); // preserve class context through to lessons
  const { user, profile } = useAuth();
  const [unit, setUnit] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [decks, setDecks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [practicalBusy, setPracticalBusy] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [viewingResource, setViewingResource] = useState(null);
  const [editingSOW, setEditingSOW] = useState(false);
  const [sowDraft, setSowDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const isAdmin = profile?.role === "admin";
  const author = isAdmin || !!profile?.is_lead;

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [unitId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const u = await sk.q("units", { params: { id: `eq.${unitId}`, select: "*,subject:subjects(name,slug)" }, single: true });
      if (!u) { setNotFound(true); setLoading(false); return; }
      setUnit(u); setSowDraft(u.scheme_of_work || "");
      const [ls, rs, dk] = await Promise.all([
        sk.q("lessons", { params: { unit_id: `eq.${unitId}`, select: "*", order: "sort_order.asc,lesson_number.asc" } }).catch(() => []),
        sk.q("resources", { params: { unit_id: `eq.${unitId}`, lesson_id: "is.null", select: "*", order: "created_at.asc" } }).catch(() => []),
        sk.q("decks", { params: { unit_id: `eq.${unitId}`, select: "id,title,slides,lesson_id,owner,is_master,shared,updated_at", order: "updated_at.desc" } }).catch(() => []),
      ]);
      setLessons(ls || []);
      setResources(rs || []);
      setDecks(dk || []);
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  };

  const saveSOW = async () => {
    await sk.q(`units?id=eq.${unitId}`, { method: "PATCH", body: { scheme_of_work: sowDraft } });
    setUnit(u => ({ ...u, scheme_of_work: sowDraft }));
    setEditingSOW(false);
  };

  const addLesson = async () => {
    const title = prompt("Lesson title:");
    if (!title) return;
    const num = lessons.length + 1;
    await sk.q("lessons", { method: "POST", body: { unit_id: unitId, title, lesson_number: num, sort_order: num } });
    loadData();
  };

  const deleteResource = async (res) => {
    if (!confirm(`Delete "${res.title}"?`)) return;
    await sk.del("resources", { id: `eq.${res.id}` });
    await sk.storageDelete(res.file_path);
    loadData();
  };

  const newSlides = async () => {
    try {
      const [d] = await sk.q("decks", { method: "POST", body: { title: `${unit.title} — slides`, slides: [{ id: "s" + Date.now(), elements: [] }], unit_id: unitId } });
      router.push(`/slides?deck=${d.id}`);
    } catch (e) { alert("Couldn't create slides: " + e.message); }
  };

  const newOfficial = async () => {
    try {
      const [d] = await sk.q("decks", { method: "POST", body: { title: `${unit.title} — official`, slides: [{ id: "s" + Date.now(), elements: [] }], unit_id: unitId, is_master: true } });
      router.push(`/slides?deck=${d.id}`);
    } catch (e) { alert("Couldn't create official deck: " + e.message); }
  };

  const copyDeckTo = async (dk) => {
    try {
      const [c] = await sk.q("decks", { method: "POST", body: { title: `${dk.title} (my copy)`, slides: dk.slides || [], unit_id: unitId } });
      router.push(`/slides?deck=${c.id}`);
    } catch (e) { alert("Couldn't copy: " + e.message); }
  };

  const generateDeck = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const strip = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      const lessonCtx = (lessons || []).slice(0, 12).map((l) => `L${l.lesson_number} ${l.title}${l.objectives ? ` — ${strip(l.objectives)}` : ""}${l.keywords?.length ? ` [keywords: ${l.keywords.join(", ")}]` : ""}`).join("\n");
      const ctx = [
        `Unit: ${unit.title}${unit.discipline ? ` (${unit.discipline})` : ""}${unit.year_group ? ` · ${unit.year_group}` : ""}`,
        unit.big_idea && `Big idea: ${strip(unit.big_idea)}`,
        unit.prior_knowledge && `Prior knowledge: ${strip(unit.prior_knowledge)}`,
        unit.content && `Key content: ${strip(unit.content).slice(0, 1800)}`,
        unit.misconceptions?.length && `Common misconceptions: ${unit.misconceptions.join("; ")}`,
        unit.required_practical && `Required practical: ${strip(unit.required_practical)}`,
        lessonCtx && `Lessons in this unit:\n${lessonCtx}`,
      ].filter(Boolean).join("\n");
      const instruction = `Create a complete, ready-to-teach slide deck for this unit. Include, in order: a title slide; a learning-objectives slide; a starter / do-now; 3–6 content slides that teach the key ideas clearly with concise bullet points and key terms; a labelled-diagram slide if relevant; a few practice questions; and an exit ticket. Keep it scientifically accurate and pitched at ${unit.year_group || "KS3–GCSE"}, with clean layouts.\n\n${ctx}`;

      const token = sk.auth.getToken();
      if (!token) throw new Error("Sign in to generate slides.");
      const [d] = await sk.q("decks", { method: "POST", body: { title: `${unit.title} — slides`, slides: [{ id: "s" + Date.now(), elements: [] }], unit_id: unitId } });
      const r = await fetch("/api/slides-assistant", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ slides: d.slides, currentSlide: 0, instruction }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Generation failed");
      await sk.q("decks", { method: "PATCH", params: { id: `eq.${d.id}` }, body: { slides: data.slides } });
      router.push(`/slides?deck=${d.id}`);
    } catch (e) { alert("Generate failed: " + e.message); }
    finally { setGenerating(false); }
  };

  // Generate a printable required-practical sheet (apparatus, method, risk
  // assessment) and open it in a new tab.
  const practicalSheet = async () => {
    if (practicalBusy) return;
    setPracticalBusy(true);
    const w = window.open("", "_blank");
    if (w) w.document.write("<p style='font-family:system-ui;padding:24px;color:#666'>Writing practical sheet…</p>");
    try {
      const token = sk.auth.getToken();
      if (!token) throw new Error("Sign in first.");
      const r = await fetch("/api/practical-assistant", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ unitId }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Generation failed");
      if (w) { w.document.open(); w.document.write(data.html); w.document.close(); }
    } catch (e) { if (w) w.close(); alert("Practical sheet failed: " + e.message); }
    finally { setPracticalBusy(false); }
  };

  // Generate a printable revision booklet for the unit and open it in a new tab.
  const revisionPack = async () => {
    if (revisionBusy) return;
    setRevisionBusy(true);
    const w = window.open("", "_blank");
    if (w) w.document.write("<p style='font-family:system-ui;padding:24px;color:#666'>Writing revision pack…</p>");
    try {
      const token = sk.auth.getToken();
      if (!token) throw new Error("Sign in first.");
      const r = await fetch("/api/revision-pack", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ unitId }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Generation failed");
      if (w) { w.document.open(); w.document.write(data.html); w.document.close(); }
    } catch (e) { if (w) w.close(); alert("Revision pack failed: " + e.message); }
    finally { setRevisionBusy(false); }
  };

  const lessonHref = (lessonId) => {
    const q = classId ? `?class=${classId}` : "";
    return `/unit/${unitId}/lesson/${lessonId}${q}`;
  };

  if (loading) return <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 12, padding: 40 }}>Loading unit…</div>;
  if (notFound || !unit) return <div style={{ color: C.red, fontFamily: C.mono, fontSize: 12, padding: 40 }}>Unit not found.</div>;

  const d = unitAccent(unit);
  const termLabel = unit.term ? unit.term.charAt(0).toUpperCase() + unit.term.slice(1) : "";

  // Split decks into the three tiers.
  const masters = decks.filter((dk) => dk.is_master);
  const mineDecks = decks.filter((dk) => !dk.is_master && dk.owner === user?.id);
  const deptDecks = decks.filter((dk) => !dk.is_master && dk.shared && dk.owner !== user?.id);
  const subhead: CSSProperties = { fontFamily: C.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dim, marginBottom: 8 };
  const listCol: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

  const renderDeck = (dk, kind) => {
    const n = dk.slides?.length || 0;
    const editable = kind === "mine" || (kind === "master" && author);
    return (
      <div key={dk.id} style={{ width: "100%", padding: "9px 12px", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 14 }}>{kind === "master" ? "★" : "🖥"}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dk.title}</span>
        {kind === "mine" && dk.shared && <span style={{ fontSize: 10, fontFamily: C.mono, color: C.grn, border: `1px solid ${C.grn}55`, borderRadius: 3, padding: "1px 5px" }}>shared</span>}
        <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{n} slide{n === 1 ? "" : "s"}</span>
        {editable && <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => router.push(`/slides?deck=${dk.id}`)}>{kind === "master" ? "Edit" : "Open"}</Btn>}
        {kind !== "mine" && (
          <>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => router.push(`/slides/${dk.id}/present`)}>View</Btn>
            <Btn v="soft" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => copyDeckTo(dk)}>Copy</Btn>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      {viewingResource && <ResourceViewer resource={viewingResource.resource} fileUrl={viewingResource.url} onClose={() => setViewingResource(null)} />}

      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={() => router.push(classId ? "/" : "/curriculum")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: C.mono, fontSize: 11, marginBottom: 16, padding: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          ← {classId ? "This week" : "Curriculum"}
        </button>
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: d.color, marginBottom: 12 }}>
          {d.label}{termLabel ? ` · ${termLabel}` : ""}{unit.year_group ? ` · ${unit.year_group}` : ""}{unit.hours ? ` · ${unit.hours}h` : ""}
        </div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", color: C.text }}>{unit.title}</h1>
      </div>

      {(resources.length > 0 || isAdmin) && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Unit resources</div>
          {resources.map(r => (
            <ResourceItem key={r.id} resource={r} isAdmin={isAdmin || r.uploaded_by === profile.id}
              onView={(res, url) => setViewingResource({ resource: res, url })}
              onDelete={deleteResource} />
          ))}
          {isAdmin && <FileUpload unitId={unitId} lessonId={null} onUploaded={loadData} />}
        </Card>
      )}

      <Card style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flex: 1 }}>Slides</div>
          <Btn onClick={generateDeck} disabled={generating} style={{ fontSize: 11, padding: "4px 10px" }}>{generating ? "Generating…" : "✦ Generate"}</Btn>
          {author && <Btn v="ghost" onClick={newOfficial} style={{ fontSize: 11, padding: "4px 10px" }}>+ New official</Btn>}
          <Btn v="ghost" onClick={newSlides} style={{ fontSize: 11, padding: "4px 10px" }}>+ New slides</Btn>
        </div>

        {masters.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={subhead}>★ Official</div>
            <div style={listCol}>{masters.map((dk) => renderDeck(dk, "master"))}</div>
          </div>
        )}

        <div style={{ marginBottom: deptDecks.length ? 16 : 0 }}>
          <div style={subhead}>Your slides</div>
          {mineDecks.length === 0
            ? <div style={{ fontSize: 13, color: C.dim, fontStyle: "italic" }}>None yet — “New slides” to start your own, or copy an official / colleague version.</div>
            : <div style={listCol}>{mineDecks.map((dk) => renderDeck(dk, "mine"))}</div>}
        </div>

        {deptDecks.length > 0 && (
          <div>
            <div style={subhead}>Department <span style={{ color: C.faint, fontWeight: 400 }}>· shared by colleagues</span></div>
            <div style={listCol}>{deptDecks.map((dk) => renderDeck(dk, "dept"))}</div>
          </div>
        )}
      </Card>

      <Card style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>Required practical</div>
            <div style={{ fontSize: 13, color: unit.required_practical ? C.text : C.dim, marginTop: 4, fontStyle: unit.required_practical ? "normal" : "italic" }}>
              {unit.required_practical ? stripTags(unit.required_practical).slice(0, 120) : "Generate apparatus, method & a risk assessment for this topic's practical."}
            </div>
          </div>
          <Btn v="soft" onClick={revisionPack} disabled={revisionBusy} style={{ fontSize: 11, padding: "6px 12px", whiteSpace: "nowrap" }}>{revisionBusy ? "Writing…" : "📖 Revision pack"}</Btn>
          <Btn onClick={practicalSheet} disabled={practicalBusy} style={{ fontSize: 11, padding: "6px 12px", whiteSpace: "nowrap" }}>{practicalBusy ? "Writing…" : "🧪 Practical sheet"}</Btn>
        </div>
      </Card>

      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flex: 1 }}>Scheme of work</div>
          {isAdmin && !editingSOW && <Btn v="ghost" onClick={() => setEditingSOW(true)} style={{ fontSize: 11, padding: "4px 10px" }}>Edit</Btn>}
        </div>
        {editingSOW ? (
          <div>
            <RichEditor value={sowDraft} onChange={setSowDraft} minHeight={200} placeholder="Write the scheme of work for this unit..." />
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <Btn onClick={saveSOW} style={{ fontSize: 12 }}>Save</Btn>
              <Btn v="ghost" onClick={() => setEditingSOW(false)} style={{ fontSize: 12 }}>Cancel</Btn>
            </div>
          </div>
        ) : unit.scheme_of_work ? (
          <div style={{ fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(unit.scheme_of_work) }} />
        ) : (
          <div style={{ fontSize: 13, color: C.dim, fontStyle: "italic" }}>{isAdmin ? "No scheme of work yet — click Edit to add." : "No scheme of work added yet."}</div>
        )}
      </Card>

      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.muted, flex: 1 }}>LESSONS — {lessons.length} total</div>
        {isAdmin && <Btn v="ghost" onClick={addLesson} style={{ fontSize: 11, padding: "5px 12px" }}>+ Add lesson</Btn>}
      </div>
      {lessons.length === 0 ? <div style={{ fontSize: 13, color: C.dim, padding: "20px 0" }}>No lessons yet.</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {lessons.map(l => (
            <button key={l.id} onClick={() => router.push(lessonHref(l.id))}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 12, transition: "all .12s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.borderStrong}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, minWidth: 28 }}>L{l.lesson_number}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{l.title}</span>
              {l.keywords?.length > 0 && <span style={{ fontSize: 11, color: C.dim }}>{l.keywords.slice(0, 2).join(", ")}</span>}
              <span style={{ color: C.dim, fontSize: 14 }}>→</span>
            </button>
          ))}
        </div>
      }
    </div>
  );
}

export default function UnitPage() {
  return <AppShell><UnitContent /></AppShell>;
}
