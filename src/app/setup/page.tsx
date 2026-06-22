"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, sk, ret } from "@/lib/sk";
import { C, DISC, DAYS, PERIODS } from "@/lib/theme";
import { Btn, Inp, Card } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";
import { TimetablePhotoImport } from "@/components/TimetablePhotoImport";
import { matchClassName } from "@/lib/timetableMatch";

function TimetableGrid({ classes, slots, onChange }) {
  const cycleThrough = (key) => {
    const ids = classes.map(c => c.id);
    if (!ids.length) return null;
    const current = slots[key];
    if (!current) return ids[0];
    const idx = ids.indexOf(current);
    return idx === ids.length - 1 ? null : ids[idx + 1];
  };
  const cls = (id) => classes.find(c => c.id === id);
  const colorOf = (id) => DISC[cls(id)?.discipline]?.color || C.muted;

  const renderWeek = (week) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: C.dim, marginBottom: 8 }}>
        Week {week === 1 ? "A" : "B"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "60px repeat(5, 1fr)", gap: 1, background: C.rule, border: `1px solid ${C.rule}`, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ background: C.surface }} />
        {DAYS.map(d => (
          <div key={d.num} style={{ padding: "8px 6px", background: C.surface, fontFamily: C.mono, fontSize: 10, fontWeight: 600, color: C.muted, textAlign: "center", letterSpacing: "0.1em", textTransform: "uppercase" }}>{d.short}</div>
        ))}
        {PERIODS.map(p => (
          <React.Fragment key={p}>
            <div style={{ padding: "10px 6px", background: C.surface, fontFamily: C.mono, fontSize: 11, color: C.muted, textAlign: "center" }}>P{p}</div>
            {DAYS.map(d => {
              const key = `w${week}-d${d.num}-p${p}`;
              const id = slots[key];
              const color = id ? colorOf(id) : null;
              return (
                <button key={key}
                  onClick={() => onChange(s => ({ ...s, [key]: cycleThrough(key) }))}
                  onContextMenu={e => { e.preventDefault(); onChange(s => { const n = { ...s }; delete n[key]; return n; }); }}
                  style={{ padding: "12px 6px", background: id ? `${color}1a` : C.surface, border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 11, color: color || C.dim, fontWeight: 500, transition: "all .1s", minHeight: 50, borderLeft: id ? `3px solid ${color}` : "3px solid transparent", textAlign: "center" }}>
                  {id ? cls(id)?.name : ""}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  if (classes.length === 0) return <div style={{ padding: 20, color: C.dim, fontFamily: C.mono, fontSize: 12 }}>No classes to schedule.</div>;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {classes.map(c => {
          const color = DISC[c.discipline]?.color || C.muted;
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: `1px solid ${color}33`, background: `${color}10`, fontSize: 11, fontFamily: C.mono, color }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {c.name}
            </div>
          );
        })}
      </div>
      {renderWeek(1)}
      {renderWeek(2)}
    </div>
  );
}

function SetupContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [allUnits, setAllUnits] = useState([]);
  const [step, setStep] = useState(1);
  const [academicYear, setAcademicYear] = useState("2026-27");
  const [anchorDate, setAnchorDate] = useState("2026-09-07");
  const [retClasses, setRetClasses] = useState(null);
  const [classConfig, setClassConfig] = useState({});
  const [skClasses, setSkClasses] = useState([]);
  const [slots, setSlots] = useState({});
  const [singleWeek, setSingleWeek] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const units = await sk.q("units", { params: { select: "*", order: "sort_order.asc" } });
        setAllUnits(units || []);
      } catch {}
    })();
  }, []);

  const saveCalendar = async () => {
    setErr(""); setBusy(true);
    try {
      try {
        await sk.q("timetable_calendar", { method: "POST", body: { teacher_id: profile.id, academic_year: academicYear, cycle_anchor_date: anchorDate } });
      } catch {
        await sk.q("timetable_calendar", { method: "PATCH", params: { teacher_id: `eq.${profile.id}`, academic_year: `eq.${academicYear}` }, body: { cycle_anchor_date: anchorDate } });
      }
      const cls = await ret.fetchClasses();
      setRetClasses(cls);
      const cfg = {};
      cls.forEach(c => { cfg[c.id] = { include: true, year_group: 10, discipline: "", current_unit_id: "" }; });
      setClassConfig(cfg);
      setStep(2);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const saveClasses = async () => {
    setErr(""); setBusy(true);
    try {
      const toCreate = (Object.entries(classConfig) as [string, any][]).filter(([_, c]) => c.include);
      const created = [];
      for (const [retId, c] of toCreate) {
        const retCls = retClasses.find(r => r.id === retId);
        const key_stage = c.year_group < 10 ? "ks3" : "ks4";
        const result = await sk.q("classes", { method: "POST", body: {
          teacher_id: profile.id, name: retCls.name, year_group: c.year_group,
          discipline: c.discipline || null, key_stage, tier: "none", pathway: null,
          academic_year: academicYear, retrieval_class_ids: [retId],
          current_unit_id: c.current_unit_id || null,
        }});
        const row = Array.isArray(result) ? result[0] : result;
        if (row) {
          created.push(row);
          if (c.current_unit_id) {
            await sk.q("class_progress", { method: "POST", body: { class_id: row.id, current_unit_id: c.current_unit_id } });
          }
        }
      }
      setSkClasses(created);
      setStep(3);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const saveTimetable = async () => {
    setErr(""); setBusy(true);
    try {
      const rows = Object.entries(slots).filter(([_, v]) => v).map(([k, classId]) => {
        const m = k.match(/w(\d+)-d(\d+)-p(\d+)/);
        return { class_id: classId, week_in_cycle: Number(m[1]), day_of_week: Number(m[2]), period: Number(m[3]) };
      });
      if (rows.length) await sk.q("class_timetable_slots", { method: "POST", body: rows });
      router.replace("/");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // AI photo import → merge parsed entries into the grid for review. Existing
  // manual entries win; the AI only fills empty slots. Nothing is saved until
  // the teacher clicks "Finish setup".
  const applyParsed = (entries, singleWeek) => {
    setSingleWeek(!!singleWeek);
    setSlots(prev => {
      const next = { ...prev };
      entries.forEach(e => {
        const classId = matchClassName(e.class, skClasses);
        if (!classId) return;
        const key = `w${e.week}-d${e.day}-p${e.period}`;
        if (!next[key]) next[key] = classId; // keep manual entries
      });
      return next;
    });
  };

  // Mirror every Week A slot into Week B (handy for single-week timetables).
  const copyWeekAtoB = () => {
    setSlots(prev => {
      const next = { ...prev };
      Object.entries(prev).forEach(([k, v]) => {
        const m = k.match(/^w1-(d\d+-p\d+)$/);
        if (m && v) next[`w2-${m[1]}`] = v;
      });
      return next;
    });
  };

  const unitsFor = (year_group, discipline) => allUnits.filter(u => {
    // If a discipline is specified, filter by it. If empty/null, show all units in the year group.
    if (discipline && u.discipline !== discipline) return false;
    if (year_group >= 10) return u.group_id?.startsWith("gcse_");
    if (year_group === 9) return u.group_id?.startsWith("gcse_") || u.group_id === "y9";
    if (year_group === 8) return u.group_id === "y8";
    if (year_group === 7) return u.group_id === "y7";
    return true;
  });

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>Setup · Step {step} of 3</span>
      </div>

      {step === 1 && (
        <>
          <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Your <em style={{ fontStyle: "italic", color: C.grn }}>academic year</em>.
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "52ch", lineHeight: 1.55 }}>
            Feynman needs to know your school&apos;s 2-week cycle. Pick the Monday that is Week A of the year — typically the first day back in September.
          </p>
          <Card style={{ padding: 24, maxWidth: 480 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 6 }}>Academic year</div>
              <Inp value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="2026-27" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 6 }}>First Monday of Week A</div>
              <Inp type="date" value={anchorDate} onChange={e => setAnchorDate(e.target.value)} />
            </div>
            {err && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={saveCalendar} disabled={busy} style={{ width: "100%" }}>{busy ? "Saving..." : "Continue →"}</Btn>
          </Card>
        </>
      )}

      {step === 2 && (
        <>
          <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Your <em style={{ fontStyle: "italic", color: C.grn }}>classes</em>.
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "52ch", lineHeight: 1.55 }}>
            {retClasses?.length
              ? "Pulled from retrieval. Tell Feynman what year, discipline, and starting unit each class is on."
              : "No retrieval classes found. Set them up in retrieval first, then come back."}
          </p>
          {retClasses?.length === 0 ? (
            <Btn v="ghost" onClick={() => router.replace("/")}>Skip for now</Btn>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {retClasses.map(rc => {
                  const cfg = classConfig[rc.id] || {};
                  const units = unitsFor(cfg.year_group, cfg.discipline);
                  return (
                    <Card key={rc.id} style={{ padding: 16, opacity: cfg.include ? 1 : 0.5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: cfg.include ? 12 : 0 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={cfg.include} onChange={e => setClassConfig(p => ({ ...p, [rc.id]: { ...p[rc.id], include: e.target.checked } }))} style={{ accentColor: C.accent }} />
                          <span style={{ fontFamily: C.serif, fontSize: 22 }}>{rc.name}</span>
                          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{rc.join_code}</span>
                        </label>
                      </div>
                      {cfg.include && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, marginBottom: 4 }}>Year group</div>
                            <select value={cfg.year_group} onChange={e => setClassConfig(p => ({ ...p, [rc.id]: { ...p[rc.id], year_group: Number(e.target.value), current_unit_id: "" } }))}
                              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
                              {[7,8,9,10,11,12,13].map(y => <option key={y} value={y}>Year {y}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, marginBottom: 4 }}>Discipline</div>
                            <select value={cfg.discipline || ""} onChange={e => setClassConfig(p => ({ ...p, [rc.id]: { ...p[rc.id], discipline: e.target.value, current_unit_id: "" } }))}
                              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
                              <option value="">Science (any)</option>
                              <option value="biology">Biology</option>
                              <option value="chemistry">Chemistry</option>
                              <option value="physics">Physics</option>
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, marginBottom: 4 }}>Starting unit</div>
                            <select value={cfg.current_unit_id || ""} onChange={e => setClassConfig(p => ({ ...p, [rc.id]: { ...p[rc.id], current_unit_id: e.target.value } }))}
                              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
                              <option value="">— select —</option>
                              {units.map(u => <option key={u.id} value={u.id}>{u.title}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
              {err && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn v="ghost" onClick={() => setStep(1)}>← Back</Btn>
                <Btn onClick={saveClasses} disabled={busy}>{busy ? "Saving..." : "Continue →"}</Btn>
              </div>
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Your <em style={{ fontStyle: "italic", color: C.grn }}>timetable</em>.
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "52ch", lineHeight: 1.55 }}>
            Tap a slot to assign your next class. Tap again to cycle. Right-click to clear.
          </p>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
            📷 Snap a photo of your timetable and we&apos;ll fill it in.
          </div>
          <TimetablePhotoImport classes={skClasses} onParsed={applyParsed} />
          {singleWeek && (
            <div style={{ marginBottom: 12 }}>
              <Btn v="ghost" onClick={copyWeekAtoB} style={{ fontSize: 11, padding: "5px 12px" }}>Copy Week A → Week B</Btn>
            </div>
          )}
          <TimetableGrid classes={skClasses} slots={slots} onChange={setSlots} />
          {err && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, fontFamily: C.mono, marginBottom: 12, marginTop: 16 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <Btn v="ghost" onClick={() => setStep(2)}>← Back</Btn>
            <Btn onClick={saveTimetable} disabled={busy}>{busy ? "Saving..." : "Finish setup →"}</Btn>
          </div>
        </>
      )}
    </div>
  );
}

export default function SetupPage() {
  return <AppShell><SetupContent /></AppShell>;
}
