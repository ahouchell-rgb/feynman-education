"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sk } from "@/lib/sk";
import { C, DISC, DAYS, isoDate } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";

function NextLessonCard({ lesson, onClick }) {
  const d = DISC[lesson.discipline] || DISC.combined;
  return (
    <button onClick={onClick} style={{ width: "100%", padding: "24px 28px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 20, transition: "all .12s", position: "relative" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = d.color}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      <span style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: d.color, borderRadius: "8px 0 0 8px" }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.18em", color: d.color, fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>
          {new Date(lesson.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })} · {lesson.period_label}{lesson.room ? ` · ${lesson.room}` : ""}
        </div>
        <div style={{ fontFamily: C.serif, fontSize: 28, lineHeight: 1.05, color: C.text, marginBottom: 6 }}>{lesson.class_name}</div>
        <div style={{ fontSize: 13, color: C.muted }}>{lesson.lesson_title || lesson.unit_title || "—"}</div>
      </div>
      <span style={{ color: d.color, fontSize: 20 }}>→</span>
    </button>
  );
}

function LessonRow({ lesson, onClick }) {
  const d = DISC[lesson.discipline] || DISC.combined;
  return (
    <button onClick={onClick} style={{ padding: "8px 12px", borderRadius: 4, background: lesson.already_taught ? "transparent" : d.bg, border: `1px solid ${lesson.already_taught ? C.border : "transparent"}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10, opacity: lesson.already_taught ? 0.55 : 1, transition: "all .1s" }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: d.color, fontWeight: 600, minWidth: 24, letterSpacing: "0.06em" }}>{lesson.period_label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{lesson.class_name}</span>
      <span style={{ fontSize: 12, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson.lesson_title || lesson.unit_title || "—"}</span>
      {lesson.room && <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{lesson.room}</span>}
      {lesson.already_taught && <span style={{ fontSize: 11, color: C.grn, fontFamily: C.mono }}>✓ taught</span>}
    </button>
  );
}

function HomeContent() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const result = await sk.rpc("get_teaching_week", {});
        if (result?.error === "no_calendar_configured") {
          router.replace("/setup");
          return;
        }
        setData(result);
      } catch (e) { setErr(e.message); }
      setLoading(false);
    })();
  }, [router]);

  // Navigate to the lesson if there is one (with class context), else the unit
  const openLessonOrUnit = (l) => {
    if (!l?.current_unit_id) return;
    const classParam = l.class_id ? `?class=${l.class_id}` : "";
    if (l.current_lesson_id) {
      router.push(`/unit/${l.current_unit_id}/lesson/${l.current_lesson_id}${classParam}`);
    } else {
      router.push(`/unit/${l.current_unit_id}${classParam}`);
    }
  };

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.08em" }}>Loading this week...</div>;
  if (err) return <div style={{ padding: 40, color: C.red, fontFamily: C.mono, fontSize: 12 }}>Error: {err}</div>;
  if (!data || data.error) return null;

  const todayStr = isoDate(new Date());
  const weekStart = new Date(data.week_start + "T00:00:00");
  const byDate = {};
  (data.lessons || []).forEach(l => { (byDate[l.date] = byDate[l.date] || []).push(l); });

  let nextLesson = null;
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    const ds = isoDate(d);
    if (ds < todayStr) continue;
    const candidate = (byDate[ds] || []).find(l => !l.already_taught);
    if (candidate) { nextLesson = candidate; break; }
  }

  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    const ds = isoDate(d);
    days.push({ date: ds, dow: DAYS[i], lessons: byDate[ds] || [], isToday: ds === todayStr });
  }

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>This week · {data.academic_year}</span>
      </div>

      {nextLesson ? (
        <>
          <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Next: <em style={{ fontStyle: "italic", color: DISC[nextLesson.discipline]?.color || C.text }}>{nextLesson.unit_title || "Untitled"}</em>
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "52ch", lineHeight: 1.55 }}>Tap to open.</p>
          <NextLessonCard lesson={nextLesson} onClick={() => openLessonOrUnit(nextLesson)} />
        </>
      ) : (
        <>
          <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
            {(data.lessons || []).length === 0 ? "Nothing scheduled." : "All caught up."}
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "52ch", lineHeight: 1.55 }}>
            {(data.lessons || []).length === 0 ? "Add classes and timetable slots to see your week here." : "Every lesson this week is marked taught."}
          </p>
          {(data.lessons || []).length === 0 && <Btn onClick={() => router.push("/setup")}>Open setup →</Btn>}
        </>
      )}

      <div style={{ marginTop: 48 }}>
        <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 14px", display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} />
          <span>Week of {weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</span>
          <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
        </div>
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden", background: C.surface }}>
          {days.map((day, i) => (
            <div key={day.date} style={{ display: "grid", gridTemplateColumns: "100px 1fr", borderTop: i === 0 ? "none" : `1px solid ${C.rule}`, background: day.isToday ? C.bg : C.surface }}>
              <div style={{ padding: "16px 14px", borderRight: `1px solid ${C.rule}` }}>
                <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.18em", color: day.isToday ? C.text : C.dim, fontWeight: 600, textTransform: "uppercase" }}>{day.dow.short}</div>
                <div style={{ fontFamily: C.serif, fontSize: 24, color: day.isToday ? C.text : C.muted, marginTop: 2 }}>{new Date(day.date + "T00:00:00").getDate()}</div>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                {day.lessons.length === 0
                  ? <div style={{ fontSize: 12, color: C.faint, fontFamily: C.mono, fontStyle: "italic", padding: "4px 0" }}>—</div>
                  : day.lessons.map((l, j) => <LessonRow key={j} lesson={l} onClick={() => openLessonOrUnit(l)} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return <AppShell><HomeContent /></AppShell>;
}
