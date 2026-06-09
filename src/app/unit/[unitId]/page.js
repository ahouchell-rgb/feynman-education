"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth, sk } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { Btn, Card, RichEditor } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";
import { FileUpload } from "@/components/FileUpload";
import { ResourceItem, ResourceViewer } from "@/components/Resources";

function UnitContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const unitId = params.unitId;
  const classId = searchParams.get("class"); // preserve class context through to lessons
  const { profile } = useAuth();
  const [unit, setUnit] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [decks, setDecks] = useState([]);
  const [viewingResource, setViewingResource] = useState(null);
  const [editingSOW, setEditingSOW] = useState(false);
  const [sowDraft, setSowDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const isAdmin = profile?.role === "admin";

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [unitId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const u = await sk.q("units", { params: { id: `eq.${unitId}` }, single: true });
      if (!u) { setNotFound(true); setLoading(false); return; }
      setUnit(u); setSowDraft(u.scheme_of_work || "");
      const [ls, rs, dk] = await Promise.all([
        sk.q("lessons", { params: { unit_id: `eq.${unitId}`, select: "*", order: "sort_order.asc,lesson_number.asc" } }).catch(() => []),
        sk.q("resources", { params: { unit_id: `eq.${unitId}`, lesson_id: "is.null", select: "*", order: "created_at.asc" } }).catch(() => []),
        sk.q("decks", { params: { unit_id: `eq.${unitId}`, select: "id,title,slides,lesson_id,updated_at", order: "updated_at.desc" } }).catch(() => []),
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

  const lessonHref = (lessonId) => {
    const q = classId ? `?class=${classId}` : "";
    return `/unit/${unitId}/lesson/${lessonId}${q}`;
  };

  if (loading) return <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 12, padding: 40 }}>Loading unit…</div>;
  if (notFound || !unit) return <div style={{ color: C.red, fontFamily: C.mono, fontSize: 12, padding: 40 }}>Unit not found.</div>;

  const d = DISC[unit.discipline] || DISC.combined;
  const termLabel = unit.term ? unit.term.charAt(0).toUpperCase() + unit.term.slice(1) : "";

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
        <div style={{ display: "flex", alignItems: "center", marginBottom: decks.length ? 12 : 0 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flex: 1 }}>Your slides</div>
          <Btn v="ghost" onClick={newSlides} style={{ fontSize: 11, padding: "4px 10px" }}>+ New slides</Btn>
        </div>
        {decks.length === 0 ? (
          <div style={{ fontSize: 13, color: C.dim, fontStyle: "italic" }}>No slides for this unit yet — click “New slides” to build a deck. It saves here automatically.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {decks.map((dk) => (
              <button key={dk.id} onClick={() => router.push(`/slides?deck=${dk.id}`)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.borderStrong}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <span style={{ fontSize: 14 }}>🖥</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.text }}>{dk.title}</span>
                <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{dk.slides?.length || 0} slide{(dk.slides?.length || 0) === 1 ? "" : "s"}</span>
                <span style={{ color: C.dim, fontSize: 14 }}>→</span>
              </button>
            ))}
          </div>
        )}
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
          <div style={{ fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: unit.scheme_of_work }} />
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
