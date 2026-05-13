"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth, sk } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { Btn, Badge, Card } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";
import { FileUpload } from "@/components/FileUpload";
import { ResourceItem, ResourceViewer } from "@/components/Resources";
import { LessonSection } from "@/components/LessonSection";
import { MarkTaughtModal } from "@/components/MarkTaughtModal";

function LessonContent() {
  const router = useRouter();
  const params = useParams();
  const { unitId, lessonId } = params;
  const { profile } = useAuth();
  const [unit, setUnit] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [resources, setResources] = useState([]);
  const [teacherContent, setTeacherContent] = useState({});
  const [mapEntry, setMapEntry] = useState(null);
  const [viewingResource, setViewingResource] = useState(null);
  const [markingTaught, setMarkingTaught] = useState(false);
  const [taughtLog, setTaughtLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const isAdmin = profile?.role === "admin";
  const isTeacher = profile?.role === "teacher" || isAdmin;

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [lessonId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [u, l] = await Promise.all([
        sk.q("units", { params: { id: `eq.${unitId}` }, single: true }),
        sk.q("lessons", { params: { id: `eq.${lessonId}` }, single: true }),
      ]);
      if (!u || !l) { setNotFound(true); setLoading(false); return; }
      setUnit(u); setLesson(l);
      await loadLessonData(l.id);
    } catch { setNotFound(true); }
    setLoading(false);
  };

  const loadLessonData = async (lid) => {
    const [res, tc, map, log] = await Promise.all([
      sk.q("resources", { params: { lesson_id: `eq.${lid}`, select: "*", order: "created_at.asc" } }).catch(() => []),
      sk.q("lesson_teacher_content", { params: { lesson_id: `eq.${lid}`, teacher_id: `eq.${profile.id}` }, single: true }).catch(() => null),
      sk.q("lesson_retrieval_map", { params: { lesson_id: `eq.${lid}` } }).catch(() => []),
      sk.q("taught_log", { params: { lesson_id: `eq.${lid}`, teacher_id: `eq.${profile.id}`, order: "taught_at.desc", limit: "5" } }).catch(() => []),
    ]);
    setResources(res || []);
    setTeacherContent(tc || {});
    setMapEntry(map?.[0] || null);
    setTaughtLog(log || []);
  };

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
    await sk.del("resources", { id: `eq.${res.id}` });
    await sk.storageDelete(res.file_path);
    loadLessonData(lessonId);
  };

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
      {markingTaught && <MarkTaughtModal lesson={lesson} mapEntry={mapEntry} profile={profile} onClose={() => setMarkingTaught(false)} onSuccess={() => loadLessonData(lessonId)} />}

      <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={() => router.push(`/unit/${unitId}`)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: C.mono, fontSize: 11, marginBottom: 16, padding: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          ← {unit.title}
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
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
        {taughtLog.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.dim, fontFamily: C.mono, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Last taught · {new Date(taughtLog[0].taught_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}
      </div>

      {lesson.keywords?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {lesson.keywords.map((k, i) => <Badge key={i} color={d.color} bg={d.bg}>{k}</Badge>)}
        </div>
      )}

      {(resources.length > 0 || isAdmin || isTeacher) && (
        <Card style={{ padding: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Resources</div>
          {resources.map(r => (
            <ResourceItem key={r.id} resource={r} isAdmin={isAdmin || r.uploaded_by === profile.id}
              onView={(res, url) => setViewingResource({ resource: res, url })}
              onDelete={deleteResource} />
          ))}
          {(isAdmin || isTeacher) && <FileUpload unitId={unitId} lessonId={lessonId} onUploaded={() => loadLessonData(lessonId)} />}
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
    </div>
  );
}

export default function LessonPage() {
  return <AppShell><LessonContent /></AppShell>;
}
