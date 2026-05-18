"use client";
import { useEffect, useState } from "react";
import { sk } from "@/lib/sk";
import { C, DISC } from "@/lib/theme";
import { Btn, Card } from "@/lib/primitives";

/**
 * Modal for setting (or clearing) a lesson as the "current lesson" for one or
 * more of the teacher's classes. The homepage uses class_progress.current_lesson_id
 * to populate each class's "next lesson" card.
 *
 * Props:
 * - lesson    — the lesson being viewed
 * - unitId    — the unit this lesson belongs to (so we set both current_unit_id and current_lesson_id)
 * - profile   — current user profile (for teacher_id scoping)
 * - onClose   — fired when the modal is dismissed
 */
export function SetCurrentLessonModal({ lesson, unitId, profile, onClose }) {
  const [classes, setClasses] = useState([]);
  // class_id -> { current_unit_id, current_lesson_id, has_row }
  const [progressMap, setProgressMap] = useState({});
  const [busy, setBusy] = useState(null); // class_id currently being updated
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cls = await sk.q("classes", {
          params: { teacher_id: `eq.${profile.id}`, archived: `eq.false`, order: "name.asc" },
        });
        const activeIds = (cls || []).map(c => c.id);
        let progress = [];
        if (activeIds.length) {
          progress = await sk.q("class_progress", {
            params: {
              class_id: `in.(${activeIds.join(",")})`,
              select: "class_id,current_unit_id,current_lesson_id",
            },
          }).catch(() => []);
        }
        setClasses(cls || []);
        const map = {};
        (progress || []).forEach(p => { map[p.class_id] = { ...p, has_row: true }; });
        setProgressMap(map);
      } catch (e) {
        console.error("Failed to load classes/progress:", e);
      }
      setLoading(false);
    })();
  }, [profile]);

  const setCurrent = async (classId) => {
    setBusy(classId);
    try {
      const existing = progressMap[classId];
      if (existing?.has_row) {
        await sk.q("class_progress", {
          method: "PATCH",
          params: { class_id: `eq.${classId}` },
          body: { current_unit_id: unitId, current_lesson_id: lesson.id },
        });
      } else {
        await sk.q("class_progress", {
          method: "POST",
          body: { class_id: classId, current_unit_id: unitId, current_lesson_id: lesson.id },
        });
      }
      // Optimistic local update so checkmark flips immediately
      setProgressMap(p => ({
        ...p,
        [classId]: { class_id: classId, current_unit_id: unitId, current_lesson_id: lesson.id, has_row: true },
      }));
    } catch (e) {
      alert("Couldn't set current lesson: " + (e.message || "unknown error"));
    }
    setBusy(null);
  };

  const clearCurrent = async (classId) => {
    setBusy(classId);
    try {
      await sk.q("class_progress", {
        method: "PATCH",
        params: { class_id: `eq.${classId}` },
        body: { current_lesson_id: null },
      });
      setProgressMap(p => ({
        ...p,
        [classId]: { ...(p[classId] || { class_id: classId }), current_lesson_id: null, has_row: true },
      }));
    } catch (e) {
      alert("Couldn't clear: " + (e.message || "unknown error"));
    }
    setBusy(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 480, padding: 24, maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Set as current lesson</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>{lesson.title}</div>

        <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
          Marks this lesson as the next one for the selected class on your homepage. Doesn&apos;t affect taught history or anything else.
        </div>

        {loading ? (
          <div style={{ color: C.dim, fontSize: 12, padding: "20px 0", fontFamily: C.mono }}>Loading classes…</div>
        ) : classes.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 12, padding: "20px 0", fontFamily: C.mono }}>No active classes. Add one in Manage.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {classes.map(c => {
              const d = DISC[c.discipline] || DISC.combined;
              const isCurrent = progressMap[c.id]?.current_lesson_id === lesson.id;
              const isBusy = busy === c.id;
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, background: isCurrent ? `${d.color}10` : C.bg, border: `1px solid ${isCurrent ? d.color : C.border}` }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{c.name}</span>
                  {isCurrent ? (
                    <Btn v="ghost" disabled={isBusy} onClick={() => clearCurrent(c.id)} style={{ fontSize: 11, padding: "5px 10px", color: C.grn, borderColor: C.grn }}>
                      {isBusy ? "…" : "✓ Current — clear"}
                    </Btn>
                  ) : (
                    <Btn v="ghost" disabled={isBusy} onClick={() => setCurrent(c.id)} style={{ fontSize: 11, padding: "5px 10px" }}>
                      {isBusy ? "…" : "Set as current"}
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Btn v="ghost" onClick={onClose}>Close</Btn>
        </div>
      </Card>
    </div>
  );
}
