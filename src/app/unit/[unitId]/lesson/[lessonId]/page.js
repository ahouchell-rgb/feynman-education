"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth, sk, pubUrl, officeUrl, RET_URL, RET_KEY } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { Btn, Badge, Card } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";
import { FileUpload } from "@/components/FileUpload";
import { ResourceItem, ResourceViewer } from "@/components/Resources";
import { LessonSection } from "@/components/LessonSection";
import { MarkTaughtModal } from "@/components/MarkTaughtModal";
import { WidgetBlock, WidgetFullscreen } from "@/components/WidgetBlock";
import { WidgetEditor } from "@/components/WidgetEditor";

const PIN_KEY = (lessonId) => `sk_pinned_resource_${lessonId}`;

/* ─── Pinned resource inline viewer ─── */
function PinnedResource({ resource, onUnpin, onOpenFullscreen }) {
  if (!resource) return null;
  const ext = resource.file_name?.split(".").pop()?.toLowerCase() || "";
  const isOffice = ["pptx","ppt","docx","doc","xlsx","xls"].includes(ext);
  const isPdf = ext === "pdf";
  const isImg = ["jpg","jpeg","png","gif","webp"].includes(ext);
  const fileUrl = pubUrl(resource.file_path);

  return (
    <Card style={{ padding: 0, marginBottom: 24, overflow: "hidden", border: `1px solid ${C.borderStrong}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.grn, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>📌 Pinned</span>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resource.title}</span>
        <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => onOpenFullscreen(resource, fileUrl)}>Fullscreen</Btn>
        <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={onUnpin}>Unpin ×</Btn>
      </div>
      <div style={{ height: 480, background: "#fff" }}>
        {isOffice ? (
          <iframe src={officeUrl(fileUrl)} style={{ width: "100%", height: "100%", border: "none" }} title={resource.title} />
        ) : isPdf ? (
          <iframe src={fileUrl} style={{ width: "100%", height: "100%", border: "none" }} title={resource.title} />
        ) : isImg ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: C.bg }}>
            <img src={fileUrl} alt={resource.title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.dim, fontFamily: C.mono, fontSize: 12 }}>
            Cannot preview this file type — click Fullscreen or download.
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Sticky lesson header (appears on scroll) ─── */
function StickyHeader({ visible, lesson, contextClass, mapEntry, onMarkTaught, discColor }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 240, right: 0, zIndex: 90,
      background: C.surface, borderBottom: `1px solid ${C.border}`,
      padding: "10px 32px",
      transform: visible ? "translateY(0)" : "translateY(-100%)",
      opacity: visible ? 1 : 0,
      transition: "transform .18s ease, opacity .18s ease",
      pointerEvents: visible ? "auto" : "none",
      boxShadow: visible ? "0 2px 8px rgba(0,0,0,0.04)" : "none",
    }}>
      <div style={{ maxWidth: 836, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: discColor, flexShrink: 0 }} />
        {contextClass && (
          <span style={{ fontFamily: C.serif, fontSize: 18, color: C.text, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
            {contextClass.name}
          </span>
        )}
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.08em" }}>L{lesson.lesson_number}</span>
        <span style={{ fontSize: 13, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson.title}</span>
        {mapEntry && (
          <Btn onClick={onMarkTaught} style={{ background: C.grn, color: "#fff", border: "none", fontSize: 12 }}>
            ✓ Mark as taught
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ─── Taught history (expandable) ─── */
function TaughtHistory({ log, retrievalClassNameMap }) {
  const [expanded, setExpanded] = useState(false);
  if (!log || log.length === 0) return null;

  const last = log[0];
  const classNames = (last.retrieval_class_ids || []).map(id => retrievalClassNameMap.get(id) || "?").filter(Boolean);
  const lastClassDesc = classNames.length ? classNames.join(", ") : "—";

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: C.mono, color: C.muted, letterSpacing: "0.04em" }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.grn }} />
        <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Last taught</span>
        <span style={{ color: C.text }}>
          {new Date(last.taught_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        </span>
        <span style={{ color: C.dim }}>to {lastClassDesc}</span>
        {log.length > 1 && (
          <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 11, fontFamily: C.mono, padding: 0, marginLeft: "auto", letterSpacing: "0.04em" }}>
            {expanded ? "Hide history" : `+ ${log.length - 1} more`}
          </button>
        )}
      </div>
      {expanded && log.length > 1 && (
        <div style={{ marginTop: 8, padding: "10px 14px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          {log.slice(1).map((entry, i) => {
            const names = (entry.retrieval_class_ids || []).map(id => retrievalClassNameMap.get(id) || "?").join(", ");
            return (
              <div key={i} style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, display: "flex", gap: 10 }}>
                <span style={{ color: C.text, minWidth: 80 }}>
                  {new Date(entry.taught_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
                </span>
                <span style={{ color: C.dim }}>to {names || "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main ─── */
function LessonContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { unitId, lessonId } = params;
  const classId = searchParams.get("class"); // sk classes.id from homepage
  const { profile } = useAuth();

  const [unit, setUnit] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [allLessons, setAllLessons] = useState([]); // for prev/next
  const [resources, setResources] = useState([]);
  const [teacherContent, setTeacherContent] = useState({});
  const [mapEntry, setMapEntry] = useState(null);
  const [contextClass, setContextClass] = useState(null); // the sk class (if ?class=)
  const [retClassNameMap, setRetClassNameMap] = useState(new Map());
  const [viewingResource, setViewingResource] = useState(null);
  const [markingTaught, setMarkingTaught] = useState(false);
  const [taughtLog, setTaughtLog] = useState([]);
  const [pinnedResource, setPinnedResource] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [widgetEditorOpen, setWidgetEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState(null);
  const [widgetSaving, setWidgetSaving] = useState(false);
  const [fullscreenWidget, setFullscreenWidget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const titleRef = useRef(null);

  const isAdmin = profile?.role === "admin";
  const isTeacher = profile?.role === "teacher" || isAdmin;

  /* ── Load everything ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [u, l] = await Promise.all([
          sk.q("units", { params: { id: `eq.${unitId}` }, single: true }),
          sk.q("lessons", { params: { id: `eq.${lessonId}` }, single: true }),
        ]);
        if (!alive) return;
        if (!u || !l) { setNotFound(true); setLoading(false); return; }
        setUnit(u); setLesson(l);

        // siblings for prev/next
        const siblings = await sk.q("lessons", { params: { unit_id: `eq.${unitId}`, select: "id,title,lesson_number,sort_order", order: "sort_order.asc,lesson_number.asc" } }).catch(() => []);
        if (!alive) return;
        setAllLessons(siblings || []);

        // lesson-scoped data
        await loadLessonData(l.id);
      } catch { setNotFound(true); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [lessonId, unitId]);

  /* ── Load class context if ?class= ── */
  useEffect(() => {
    if (!classId) { setContextClass(null); return; }
    (async () => {
      try {
        const c = await sk.q("classes", { params: { id: `eq.${classId}` }, single: true });
        setContextClass(c);
      } catch { setContextClass(null); }
    })();
  }, [classId]);

  /* ── Load retrieval class names for taught-history display ── */
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const ids = profile.retrieval_class_ids || [];
        if (!ids.length) { setRetClassNameMap(new Map()); return; }
        const r = await fetch(`${RET_URL}/rest/v1/classes?select=id,name`, {
          headers: { apikey: RET_KEY, Authorization: `Bearer ${RET_KEY}` }
        });
        const all = r.ok ? await r.json() : [];
        const m = new Map();
        (all || []).forEach(c => m.set(c.id, c.name));
        setRetClassNameMap(m);
      } catch {}
    })();
  }, [profile]);

  /* ── Restore pin from localStorage when lesson loads ── */
  useEffect(() => {
    if (!lesson || !resources.length) return;
    try {
      const stored = localStorage.getItem(PIN_KEY(lesson.id));
      if (!stored) { setPinnedResource(null); return; }
      const r = resources.find(x => x.id === stored);
      setPinnedResource(r || null);
    } catch { setPinnedResource(null); }
  }, [lesson, resources]);

  /* ── Sticky header on scroll past title ── */
  useEffect(() => {
    const onScroll = () => {
      if (!titleRef.current) return;
      const rect = titleRef.current.getBoundingClientRect();
      setShowSticky(rect.bottom < 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [lesson]);

  const loadLessonData = useCallback(async (lid) => {
    const [res, tc, map, log, wgs] = await Promise.all([
      sk.q("resources", { params: { lesson_id: `eq.${lid}`, select: "*", order: "created_at.asc" } }).catch(() => []),
      sk.q("lesson_teacher_content", { params: { lesson_id: `eq.${lid}`, teacher_id: `eq.${profile.id}` }, single: true }).catch(() => null),
      sk.q("lesson_retrieval_map", { params: { lesson_id: `eq.${lid}` } }).catch(() => []),
      sk.q("taught_log", { params: { lesson_id: `eq.${lid}`, teacher_id: `eq.${profile.id}`, order: "taught_at.desc", limit: "5" } }).catch(() => []),
      sk.q("lesson_widgets", { params: { lesson_id: `eq.${lid}`, teacher_id: `eq.${profile.id}`, select: "*", order: "position.asc,created_at.asc" } }).catch(() => []),
    ]);
    setResources(res || []);
    setTeacherContent(tc || {});
    setMapEntry(map?.[0] || null);
    setTaughtLog(log || []);
    setWidgets(wgs || []);
  }, [profile]);

  /* ── Save helpers ── */
  const saveSystem = async (field, value) => {
    await sk.q(`lessons?id=eq.${lessonId}`, { method: "PATCH", body: { [field]: value } });
    setLesson(p => ({ ...p, [field]: value }));
  };

  const saveTeacher = async (field, value) => {
    if (teacherContent?.id) {
      await sk.q("lesson_teacher_content", { method: "PATCH", params: { lesson_id: `eq.${lessonId}`, teacher_id: `eq.${profile.id}` }, body: { [field]: value, updated_at: new Date().toISOString() } });
    } else {
      const result = await sk.q("lesson_teacher_content", { method: "POST", body: { lesson_id: lessonId, teacher_id: profile.id, [field]: value } });
      const row = Array.isArray(result) ? result[0] : result;
      if (row) setTeacherContent(row);
    }
    setTeacherContent(p => ({ ...p, [field]: value }));
  };

  const addRetLink = async () => {
    const topicId = prompt("Enter retrieval. topic ID:");
    const topicName = topicId ? prompt("Enter topic name (for display):") : null;
    if (!topicId || !topicName) return;
    await sk.q("lesson_retrieval_map", { method: "POST", body: { lesson_id: lessonId, retrieval_topic_id: topicId, retrieval_topic_name: topicName, created_by: profile.id } });
    loadLessonData(lessonId);
  };

  const deleteResource = async (res) => {
    if (!confirm(`Delete "${res.title}"?`)) return;
    if (pinnedResource?.id === res.id) unpinResource();
    await sk.del("resources", { id: `eq.${res.id}` });
    await sk.storageDelete(res.file_path);
    loadLessonData(lessonId);
  };

  /* ── Pin / unpin ── */
  const pinResource = (res) => {
    try { localStorage.setItem(PIN_KEY(lessonId), res.id); } catch {}
    setPinnedResource(res);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const unpinResource = () => {
    try { localStorage.removeItem(PIN_KEY(lessonId)); } catch {}
    setPinnedResource(null);
  };

  /* ── Widgets ── */
  const openWidgetEditor = (widget = null) => {
    setEditingWidget(widget);
    setWidgetEditorOpen(true);
  };
  const closeWidgetEditor = () => {
    setWidgetEditorOpen(false);
    setEditingWidget(null);
  };

  const saveWidget = async ({ title, html, default_height }) => {
    setWidgetSaving(true);
    try {
      if (editingWidget) {
        await sk.q("lesson_widgets", {
          method: "PATCH",
          params: { id: `eq.${editingWidget.id}`, teacher_id: `eq.${profile.id}` },
          body: { title, html, default_height, updated_at: new Date().toISOString() },
        });
      } else {
        const nextPos = widgets.length
          ? Math.max(...widgets.map(w => Number(w.position) || 0)) + 1
          : 1;
        await sk.q("lesson_widgets", {
          method: "POST",
          body: {
            lesson_id: lessonId,
            teacher_id: profile.id,
            title, html, default_height,
            position: nextPos,
          },
        });
      }
      await loadLessonData(lessonId);
      closeWidgetEditor();
    } catch (e) {
      alert(`Couldn't save widget: ${e.message || "unknown error"}`);
    } finally {
      setWidgetSaving(false);
    }
  };

  const deleteWidget = async (widget) => {
    if (!confirm(`Delete widget "${widget.title || "Widget"}"?`)) return;
    try {
      await sk.del("lesson_widgets", { id: `eq.${widget.id}`, teacher_id: `eq.${profile.id}` });
      await loadLessonData(lessonId);
    } catch (e) {
      alert(`Couldn't delete: ${e.message || "unknown error"}`);
    }
  };

  // Reorder by swapping `position` with the neighbour. RLS scopes writes to owner.
  const swapWidgetPositions = async (a, b) => {
    try {
      // Optimistic update so the UI feels instant.
      setWidgets(prev => {
        const next = [...prev];
        const ia = next.findIndex(w => w.id === a.id);
        const ib = next.findIndex(w => w.id === b.id);
        if (ia < 0 || ib < 0) return prev;
        next[ia] = { ...next[ia], position: b.position };
        next[ib] = { ...next[ib], position: a.position };
        return next.sort((x, y) => Number(x.position) - Number(y.position));
      });
      await Promise.all([
        sk.q("lesson_widgets", { method: "PATCH", params: { id: `eq.${a.id}`, teacher_id: `eq.${profile.id}` }, body: { position: b.position } }),
        sk.q("lesson_widgets", { method: "PATCH", params: { id: `eq.${b.id}`, teacher_id: `eq.${profile.id}` }, body: { position: a.position } }),
      ]);
    } catch (e) {
      // Re-fetch on failure so we don't show a misleading order.
      await loadLessonData(lessonId);
      alert(`Couldn't reorder: ${e.message || "unknown error"}`);
    }
  };

  const moveWidgetUp = (widget) => {
    const i = widgets.findIndex(w => w.id === widget.id);
    if (i <= 0) return;
    swapWidgetPositions(widgets[i], widgets[i - 1]);
  };
  const moveWidgetDown = (widget) => {
    const i = widgets.findIndex(w => w.id === widget.id);
    if (i < 0 || i >= widgets.length - 1) return;
    swapWidgetPositions(widgets[i], widgets[i + 1]);
  };

  /* ── Prev / next ── */
  const idx = allLessons.findIndex(l => l.id === lessonId);
  const prev = idx > 0 ? allLessons[idx - 1] : null;
  const next = idx >= 0 && idx < allLessons.length - 1 ? allLessons[idx + 1] : null;
  const classQuery = classId ? `?class=${classId}` : "";

  if (loading) return <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 12, padding: 40 }}>Loading lesson…</div>;
  if (notFound || !lesson || !unit) return <div style={{ color: C.red, fontFamily: C.mono, fontSize: 12, padding: 40 }}>Lesson not found.</div>;

  const d = DISC[unit.discipline] || DISC.combined;
  const sectionFields = [
    { key: "objectives", title: "Learning objectives" },
    { key: "starter", title: "Starter activity" },
    { key: "main_activities", title: "Main activities" },
    { key: "afl_checkpoint", title: "AFL checkpoint" },
    { key: "plenary", title: "Plenary" },
    { key: "differentiation", title: "Differentiation" },
    { key: "modelling_notes", title: "Modelling notes" },
    { key: "misconception_alerts", title: "Misconception alerts" },
  ];

  return (
    <div>
      {viewingResource && <ResourceViewer resource={viewingResource.resource} fileUrl={viewingResource.url} onClose={() => setViewingResource(null)} />}
      {fullscreenWidget && <WidgetFullscreen widget={fullscreenWidget} onClose={() => setFullscreenWidget(null)} />}
      {widgetEditorOpen && (
        <WidgetEditor
          widget={editingWidget}
          saving={widgetSaving}
          onClose={closeWidgetEditor}
          onSave={saveWidget}
        />
      )}
      {markingTaught && (
        <MarkTaughtModal
          lesson={lesson} mapEntry={mapEntry} profile={profile}
          onClose={() => setMarkingTaught(false)}
          onSuccess={() => loadLessonData(lessonId)}
          preselectedRetrievalIds={contextClass?.retrieval_class_ids || null}
          confirmOnly={!!contextClass && (contextClass.retrieval_class_ids || []).length > 0}
        />
      )}

      <StickyHeader
        visible={showSticky}
        lesson={lesson}
        contextClass={contextClass}
        mapEntry={mapEntry}
        onMarkTaught={() => setMarkingTaught(true)}
        discColor={d.color}
      />

      <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={() => router.push(classId ? "/" : `/unit/${unitId}`)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: C.mono, fontSize: 11, marginBottom: 16, padding: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          ← {classId ? "This week" : unit.title}
        </button>

        {contextClass && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: `${d.color}10`, border: `1px solid ${d.color}33`, marginBottom: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color }} />
            <span style={{ fontFamily: C.mono, fontSize: 11, color: d.color, fontWeight: 600, letterSpacing: "0.04em" }}>
              Teaching: {contextClass.name}
            </span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }} ref={titleRef}>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: d.color, marginBottom: 10 }}>
              L{lesson.lesson_number} · {d.label}{lesson.duration ? ` · ${lesson.duration}` : ""}
            </div>
            <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 38, lineHeight: 1.1, letterSpacing: "-0.015em", color: C.text }}>{lesson.title}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8 }}>
            {mapEntry ? (
              <Btn onClick={() => setMarkingTaught(true)} style={{ background: C.grn, borderColor: C.grn, color: "#fff", fontSize: 12 }}>
                ✓ Mark as taught
              </Btn>
            ) : isAdmin ? (
              <Btn v="ghost" onClick={addRetLink} style={{ fontSize: 12 }}>Link retrieval. topic</Btn>
            ) : null}
          </div>
        </div>

        {mapEntry && (
          <div style={{ marginTop: 14, fontSize: 12, color: C.grn, fontFamily: C.mono, letterSpacing: "0.04em" }}>
            ↻ Linked to retrieval. topic: <span style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: 14 }}>{mapEntry.retrieval_topic_name}</span>
          </div>
        )}

        <TaughtHistory log={taughtLog} retrievalClassNameMap={retClassNameMap} />
      </div>

      {lesson.keywords?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {lesson.keywords.map((k, i) => <Badge key={i} color={d.color} bg={d.bg}>{k}</Badge>)}
        </div>
      )}

      <PinnedResource
        resource={pinnedResource}
        onUnpin={unpinResource}
        onOpenFullscreen={(res, url) => setViewingResource({ resource: res, url })}
      />

      {(resources.length > 0 || isAdmin || isTeacher) && (
        <Card style={{ padding: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Resources</div>
          {resources.map(r => {
            const isPinned = pinnedResource?.id === r.id;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <ResourceItem
                    resource={r}
                    isAdmin={isAdmin || r.uploaded_by === profile.id}
                    onView={(res, url) => setViewingResource({ resource: res, url })}
                    onDelete={deleteResource}
                  />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <Btn v={isPinned ? "soft" : "ghost"}
                    onClick={() => isPinned ? unpinResource() : pinResource(r)}
                    style={{ fontSize: 11, padding: "5px 10px", ...(isPinned ? { color: C.grn, borderColor: C.grn } : {}) }}>
                    {isPinned ? "📌 Pinned" : "Pin"}
                  </Btn>
                </div>
              </div>
            );
          })}
          {(isAdmin || isTeacher) && <FileUpload unitId={unitId} lessonId={lessonId} onUploaded={() => loadLessonData(lessonId)} />}
        </Card>
      )}

      {/* Widgets — pasted HTML blocks (Claude-built or hand-written), per-teacher */}
      {(widgets.length > 0 || isTeacher) && (
        <Card style={{ padding: 16, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flex: 1 }}>
              Widgets
            </div>
            {isTeacher && (
              <Btn v="ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => openWidgetEditor(null)}>
                + Add widget
              </Btn>
            )}
          </div>
          {widgets.length === 0 ? (
            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, padding: "8px 2px" }}>
              No widgets yet. Paste an HTML widget Claude built for you.
            </div>
          ) : (
            widgets.map((w, i) => (
              <WidgetBlock
                key={w.id}
                widget={w}
                isAdmin={isTeacher}
                canMoveUp={i > 0}
                canMoveDown={i < widgets.length - 1}
                onEdit={openWidgetEditor}
                onDelete={deleteWidget}
                onMoveUp={moveWidgetUp}
                onMoveDown={moveWidgetDown}
                onFullscreen={(widget) => setFullscreenWidget(widget)}
              />
            ))
          )}
        </Card>
      )}

      <Card style={{ padding: 20 }}>
        {sectionFields.map(({ key, title }) => (
          <LessonSection key={key} title={title}
            sysValue={lesson[key]} teacherValue={teacherContent[key]}
            fieldKey={key} isAdmin={isAdmin} isTeacher={isTeacher}
            onSaveSystem={saveSystem} onSaveTeacher={saveTeacher} />
        ))}
        {(lesson.rich_content || isAdmin) && (
          <LessonSection title="Extended notes" sysValue={lesson.rich_content}
            teacherValue={teacherContent.notes} fieldKey={isAdmin ? "rich_content" : "notes"}
            isAdmin={isAdmin} isTeacher={isTeacher}
            onSaveSystem={saveSystem} onSaveTeacher={saveTeacher} />
        )}
      </Card>

      {/* Prev / next lesson nav */}
      {(prev || next) && (
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <button
            onClick={() => prev && router.push(`/unit/${unitId}/lesson/${prev.id}${classQuery}`)}
            disabled={!prev}
            style={{ padding: "14px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: prev ? C.surface : "transparent", cursor: prev ? "pointer" : "default", textAlign: "left", fontFamily: "inherit", opacity: prev ? 1 : 0.35, transition: "all .12s" }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>← Previous</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {prev ? `L${prev.lesson_number}: ${prev.title}` : "—"}
            </div>
          </button>
          <button
            onClick={() => next && router.push(`/unit/${unitId}/lesson/${next.id}${classQuery}`)}
            disabled={!next}
            style={{ padding: "14px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: next ? C.surface : "transparent", cursor: next ? "pointer" : "default", textAlign: "right", fontFamily: "inherit", opacity: next ? 1 : 0.35, transition: "all .12s" }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Next →</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {next ? `L${next.lesson_number}: ${next.title}` : "—"}
            </div>
          </button>
        </div>
      )}

      {/* "Lesson X of Y" indicator */}
      {allLessons.length > 0 && (
        <div style={{ marginTop: 16, textAlign: "center", fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Lesson {idx + 1} of {allLessons.length}
        </div>
      )}
    </div>
  );
}

export default function LessonPage() {
  return <AppShell><LessonContent /></AppShell>;
}
