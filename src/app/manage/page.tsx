"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useAuth, sk, ret } from "@/lib/sk";
import { C, DISC, DAYS, PERIODS } from "@/lib/theme";
import { Btn, Inp, Card } from "@/lib/primitives";
import { AppShell } from "@/components/AppShell";
import { TimetablePhotoImport } from "@/components/TimetablePhotoImport";

/* ───────────────────────── CLASSES SECTION ───────────────────────── */

function ClassRow({ cls, allUnits, slotCount, onChange, onArchive, onRestore }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const d = DISC[cls.discipline] || DISC.combined;

  const startEdit = () => {
    setDraft({
      name: cls.name,
      year_group: cls.year_group,
      discipline: cls.discipline,
      tier: cls.tier || "none",
      current_unit_id: cls.current_unit_id || "",
    });
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const key_stage = draft.year_group < 10 ? "ks3" : "ks4";
      const patch = {
        name: draft.name,
        year_group: draft.year_group,
        discipline: draft.discipline || null,
        key_stage,
        tier: draft.tier,
        current_unit_id: draft.current_unit_id || null,
      };
      await sk.q("classes", { method: "PATCH", params: { id: `eq.${cls.id}` }, body: patch });
      // Keep class_progress in sync if current_unit_id changed
      if (cls.current_unit_id !== patch.current_unit_id) {
        try {
          await sk.q("class_progress", { method: "PATCH", params: { class_id: `eq.${cls.id}` }, body: { current_unit_id: patch.current_unit_id } });
        } catch {
          // No progress row yet — create one
          await sk.q("class_progress", { method: "POST", body: { class_id: cls.id, current_unit_id: patch.current_unit_id } });
        }
      }
      onChange();
      setEditing(false);
    } catch (e) { alert("Save failed: " + e.message); }
    setBusy(false);
  };

  const unitsFor = (yg, disc) => allUnits.filter(u => {
    // If a discipline is specified, filter by it. If empty/null, show all units in the year group.
    if (disc && u.discipline !== disc) return false;
    if (yg >= 10) return u.group_id?.startsWith("gcse_");
    if (yg === 9) return u.group_id?.startsWith("gcse_") || u.group_id === "y9";
    if (yg === 8) return u.group_id === "y8";
    if (yg === 7) return u.group_id === "y7";
    return true;
  });

  if (cls.archived) {
    return (
      <Card style={{ padding: 14, opacity: 0.55, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.dim, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: C.serif, fontSize: 18, color: C.muted, textDecoration: "line-through" }}>{cls.name}</div>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.04em" }}>
            Archived {cls.archived_at ? new Date(cls.archived_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
          </div>
        </div>
        <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => onRestore(cls.id)}>Restore</Btn>
      </Card>
    );
  }

  const currentUnit = allUnits.find(u => u.id === cls.current_unit_id);

  return (
    <Card style={{ padding: editing ? 16 : 14, position: "relative" }}>
      <span style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: d.color, borderRadius: "8px 0 0 8px" }} />
      {!editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: C.serif, fontSize: 22, lineHeight: 1.1, color: C.text }}>{cls.name}</span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: d.color, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Y{cls.year_group}{cls.discipline ? ` · ${d.label}` : " · Science"}{cls.tier && cls.tier !== "none" ? ` · ${cls.tier}` : ""}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, display: "flex", gap: 14, alignItems: "center" }}>
              <span>{currentUnit ? currentUnit.title : <em style={{ color: C.dim }}>no unit set</em>}</span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>· {slotCount} slot{slotCount === 1 ? "" : "s"}/cycle</span>
              {cls.retrieval_class_ids?.length > 0 && (
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.grn }}>· ↻ linked</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={startEdit}>Edit</Btn>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px", color: C.red, borderColor: "rgba(185,90,60,0.25)" }} onClick={() => onArchive(cls.id)}>Archive</Btn>
          </div>
        </div>
      ) : (
        <div style={{ paddingLeft: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Name</div>
              <Inp value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Year</div>
              <select value={draft.year_group} onChange={e => setDraft(p => ({ ...p, year_group: Number(e.target.value), current_unit_id: "" }))}
                style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
                {[7,8,9,10,11,12,13].map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Discipline</div>
              <select value={draft.discipline || ""} onChange={e => setDraft(p => ({ ...p, discipline: e.target.value, current_unit_id: "" }))}
                style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
                <option value="">Science (any)</option>
                <option value="biology">Biology</option>
                <option value="chemistry">Chemistry</option>
                <option value="physics">Physics</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Tier</div>
              <select value={draft.tier} onChange={e => setDraft(p => ({ ...p, tier: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
                <option value="none">—</option>
                <option value="foundation">Foundation</option>
                <option value="higher">Higher</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Current unit</div>
            <select value={draft.current_unit_id || ""} onChange={e => setDraft(p => ({ ...p, current_unit_id: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
              <option value="">— none —</option>
              {unitsFor(draft.year_group, draft.discipline).map(u => <option key={u.id} value={u.id}>{u.title}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={save} disabled={busy} style={{ fontSize: 12 }}>{busy ? "Saving..." : "Save"}</Btn>
            <Btn v="ghost" onClick={() => setEditing(false)} style={{ fontSize: 12 }}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function AddClassRow({ profile, retClasses, allUnits, academicYear, onCreated }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ retrieval_id: "", name: "", year_group: 10, discipline: "", tier: "none", current_unit_id: "" });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!draft.name.trim()) { alert("Name required"); return; }
    setBusy(true);
    try {
      const key_stage = draft.year_group < 10 ? "ks3" : "ks4";
      const result = await sk.q("classes", { method: "POST", body: {
        teacher_id: profile.id, name: draft.name.trim(),
        year_group: draft.year_group, discipline: draft.discipline || null, key_stage,
        tier: draft.tier, pathway: null, academic_year: academicYear,
        retrieval_class_ids: draft.retrieval_id ? [draft.retrieval_id] : [],
        current_unit_id: draft.current_unit_id || null,
      }});
      const row = Array.isArray(result) ? result[0] : result;
      if (row?.current_unit_id) {
        await sk.q("class_progress", { method: "POST", body: { class_id: row.id, current_unit_id: row.current_unit_id } });
      }
      setOpen(false);
      setDraft({ retrieval_id: "", name: "", year_group: 10, discipline: "", tier: "none", current_unit_id: "" });
      onCreated();
    } catch (e) { alert("Create failed: " + e.message); }
    setBusy(false);
  };

  const unitsFor = (yg, disc) => allUnits.filter(u => {
    // If a discipline is specified, filter by it. If empty/null, show all units in the year group.
    if (disc && u.discipline !== disc) return false;
    if (yg >= 10) return u.group_id?.startsWith("gcse_");
    if (yg === 9) return u.group_id?.startsWith("gcse_") || u.group_id === "y9";
    if (yg === 8) return u.group_id === "y8";
    if (yg === 7) return u.group_id === "y7";
    return true;
  });

  if (!open) {
    return <Btn v="ghost" onClick={() => setOpen(true)} style={{ fontSize: 12, alignSelf: "flex-start" }}>+ Add class</Btn>;
  }

  return (
    <Card style={{ padding: 16, border: `1px dashed ${C.border}` }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>New class</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Name</div>
          <Inp value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} placeholder="e.g. 10A/Bi1" />
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Year</div>
          <select value={draft.year_group} onChange={e => setDraft(p => ({ ...p, year_group: Number(e.target.value), current_unit_id: "" }))}
            style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
            {[7,8,9,10,11,12,13].map(y => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Discipline</div>
          <select value={draft.discipline || ""} onChange={e => setDraft(p => ({ ...p, discipline: e.target.value, current_unit_id: "" }))}
            style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
            <option value="">Science (any)</option>
            <option value="biology">Biology</option>
            <option value="chemistry">Chemistry</option>
            <option value="physics">Physics</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Tier</div>
          <select value={draft.tier} onChange={e => setDraft(p => ({ ...p, tier: e.target.value }))}
            style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
            <option value="none">—</option>
            <option value="foundation">Foundation</option>
            <option value="higher">Higher</option>
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Retrieval-app link (optional)</div>
          <select value={draft.retrieval_id} onChange={e => setDraft(p => ({ ...p, retrieval_id: e.target.value }))}
            style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
            <option value="">— none —</option>
            {retClasses.map(r => <option key={r.id} value={r.id}>{r.name} ({r.join_code})</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Starting unit (optional)</div>
          <select value={draft.current_unit_id || ""} onChange={e => setDraft(p => ({ ...p, current_unit_id: e.target.value }))}
            style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 12, background: C.surface }}>
            <option value="">— none —</option>
            {unitsFor(draft.year_group, draft.discipline).map(u => <option key={u.id} value={u.id}>{u.title}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Btn onClick={create} disabled={busy} style={{ fontSize: 12 }}>{busy ? "Creating..." : "Create class"}</Btn>
        <Btn v="ghost" onClick={() => setOpen(false)} style={{ fontSize: 12 }}>Cancel</Btn>
      </div>
    </Card>
  );
}

function ClassesSection({ profile, classes, slotsByClass, allUnits, retClasses, academicYear, onChange }) {
  const [showArchived, setShowArchived] = useState(false);

  const archive = async (id) => {
    if (!confirm("Archive this class? Its timetable slots will stop appearing on the homepage. It can be restored later.")) return;
    await sk.q("classes", { method: "PATCH", params: { id: `eq.${id}` }, body: { archived: true, archived_at: new Date().toISOString() } });
    onChange();
  };

  const restore = async (id) => {
    await sk.q("classes", { method: "PATCH", params: { id: `eq.${id}` }, body: { archived: false, archived_at: null } });
    onChange();
  };

  const active = classes.filter(c => !c.archived);
  const archived = classes.filter(c => c.archived);

  return (
    <div style={{ marginBottom: 40 }}>
      <SectionHeader title="Classes" count={active.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {active.length === 0 ? (
          <div style={{ fontSize: 13, color: C.dim, fontFamily: C.mono, padding: "12px 0" }}>No classes yet.</div>
        ) : active.map(c => (
          <ClassRow key={c.id} cls={c} allUnits={allUnits}
            slotCount={(slotsByClass[c.id] || []).length}
            onChange={onChange} onArchive={archive} onRestore={restore} />
        ))}
        <AddClassRow profile={profile} retClasses={retClasses || []} allUnits={allUnits} academicYear={academicYear} onCreated={onChange} />
      </div>
      {archived.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowArchived(s => !s)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontFamily: C.mono, fontSize: 11, letterSpacing: "0.06em", padding: 0 }}>
            {showArchived ? "▼" : "▶"} {archived.length} archived
          </button>
          {showArchived && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {archived.map(c => (
                <ClassRow key={c.id} cls={c} allUnits={allUnits}
                  slotCount={(slotsByClass[c.id] || []).length}
                  onChange={onChange} onArchive={archive} onRestore={restore} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── TIMETABLE SECTION ───────────────────────── */

function TimetableSection({ classes, slots, onChange }) {
  const activeClasses = classes.filter(c => !c.archived);
  const slotsByKey = {};
  slots.forEach(s => {
    slotsByKey[`w${s.week_in_cycle}-d${s.day_of_week}-p${s.period}`] = s;
  });

  // ── CSV import ──
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);

  const WEEK_MAP = { a: 1, b: 2, "1": 1, "2": 2, wka: 1, wkb: 2 };
  const DAY_MAP = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 };

  const parseCSV = (text) => {
    const rows = [];
    (text || "").split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      const cells = []; let cur = "", q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else { if (ch === '"') q = true; else if (ch === ",") { cells.push(cur); cur = ""; } else cur += ch; }
      }
      cells.push(cur);
      rows.push(cells.map((c) => c.trim()));
    });
    return rows;
  };

  const onFile = (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(f);
  };

  const runImport = async () => {
    setImporting(true); setImportMsg("");
    try {
      const rows = parseCSV(csvText);
      if (!rows.length) throw new Error("No rows found.");
      let start = 0;
      const head = rows[0].map((c) => c.toLowerCase());
      if (head.includes("class") || head.includes("week") || head.includes("period")) start = 1;
      const byName = {};
      activeClasses.forEach((c) => { byName[c.name.trim().toLowerCase()] = c; });
      const desired = {}; const errors = [];
      for (let r = start; r < rows.length; r++) {
        const [wk, dy, pd, cl, room] = rows[r];
        if (!cl && !wk && !dy && !pd) continue;
        const week = WEEK_MAP[(wk || "").toLowerCase().trim()];
        const day = DAY_MAP[(dy || "").toLowerCase().trim()];
        const period = parseInt(pd, 10);
        const klass = byName[(cl || "").trim().toLowerCase()];
        if (!week || !day || !(period >= 1 && period <= 5) || !klass) {
          errors.push(`Row ${r + 1}: "${[wk, dy, pd, cl].join(", ")}"${!klass ? " — unknown class" : " — bad week/day/period"}`);
          continue;
        }
        desired[`w${week}-d${day}-p${period}`] = { week, day, period, klass, room: (room || "").trim() };
      }
      let added = 0, updated = 0;
      for (const key of Object.keys(desired)) {
        const dz = desired[key]; const existing = slotsByKey[key];
        try {
          if (existing) { await sk.q("class_timetable_slots", { method: "PATCH", params: { id: `eq.${existing.id}` }, body: { class_id: dz.klass.id, ...(dz.room ? { room: dz.room } : {}) } }); updated++; }
          else { await sk.q("class_timetable_slots", { method: "POST", body: { class_id: dz.klass.id, week_in_cycle: dz.week, day_of_week: dz.day, period: dz.period, ...(dz.room ? { room: dz.room } : {}) } }); added++; }
        } catch (e) { errors.push(`${key}: ${e.message}`); }
      }
      onChange();
      setImportMsg(`✓ ${added} added, ${updated} updated${errors.length ? ` · ${errors.length} skipped:\n` + errors.slice(0, 6).join("\n") : ""}`);
      if (!errors.length) setCsvText("");
    } catch (e) { setImportMsg("⚠ " + e.message); }
    finally { setImporting(false); }
  };

  // AI photo import → reuse the proven CSV apply path. Convert parsed entries to
  // the exact `week,day,period,class,room` text the paste-importer consumes and
  // drop it into the textarea, so the teacher reviews/imports it as normal. No
  // auto-save: import only runs when they click Import.
  const DAY_SHORT = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri" };
  const onPhotoParsed = (entries) => {
    const lines = ["week,day,period,class,room"];
    entries.forEach(e => {
      // entry.class is the verbatim class name the CSV importer matches on by name.
      const name = String(e.class || "");
      const csvName = /[",]/.test(name) ? `"${name.replace(/"/g, '""')}"` : name;
      lines.push(`${e.week === 2 ? "B" : "A"},${DAY_SHORT[e.day] || e.day},${e.period},${csvName},`);
    });
    setCsvText(lines.join("\n"));
    setImportOpen(true);
    setImportMsg("");
  };

  const cycleThrough = async (week, day, period) => {
    const key = `w${week}-d${day}-p${period}`;
    const existing = slotsByKey[key];
    const ids = activeClasses.map(c => c.id);
    if (!ids.length) return;

    if (!existing) {
      // Create new with first class
      try {
        await sk.q("class_timetable_slots", { method: "POST", body: {
          class_id: ids[0], week_in_cycle: week, day_of_week: day, period,
        }});
      } catch (e) { alert("Add slot failed: " + e.message); return; }
    } else {
      const currentIdx = ids.indexOf(existing.class_id);
      const nextIdx = currentIdx + 1;
      if (nextIdx >= ids.length) {
        // Wrap to empty — delete the slot
        try {
          await sk.del("class_timetable_slots", { id: `eq.${existing.id}` });
        } catch (e) { alert("Delete slot failed: " + e.message); return; }
      } else {
        try {
          await sk.q("class_timetable_slots", { method: "PATCH", params: { id: `eq.${existing.id}` }, body: { class_id: ids[nextIdx] } });
        } catch (e) { alert("Update slot failed: " + e.message); return; }
      }
    }
    onChange();
  };

  const clearSlot = async (week, day, period) => {
    const key = `w${week}-d${day}-p${period}`;
    const existing = slotsByKey[key];
    if (!existing) return;
    try {
      await sk.del("class_timetable_slots", { id: `eq.${existing.id}` });
      onChange();
    } catch (e) { alert("Delete failed: " + e.message); }
  };

  const cls = (id) => activeClasses.find(c => c.id === id);
  const colorOf = (id) => DISC[cls(id)?.discipline]?.color || C.muted;

  const renderWeek = (week) => (
    <div style={{ marginBottom: 16 }}>
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
              const slot = slotsByKey[key];
              const color = slot ? colorOf(slot.class_id) : null;
              const className = slot ? cls(slot.class_id)?.name : "";
              return (
                <button key={key}
                  onClick={() => cycleThrough(week, d.num, p)}
                  onContextMenu={e => { e.preventDefault(); clearSlot(week, d.num, p); }}
                  style={{ padding: "12px 6px", background: slot ? `${color}1a` : C.surface, border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 11, color: color || C.dim, fontWeight: 500, transition: "all .1s", minHeight: 50, borderLeft: slot ? `3px solid ${color}` : "3px solid transparent", textAlign: "center" }}>
                  {className}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 40 }}>
      <SectionHeader title="Timetable" count={slots.length} suffix="slots/cycle" />
      {activeClasses.length === 0 ? (
        <div style={{ fontSize: 13, color: C.dim, fontFamily: C.mono, padding: "12px 0" }}>Add a class first.</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginBottom: 12 }}>
            Click a slot to assign your next class (cycles through, then clears). Right-click to clear immediately. Saves on every change.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {activeClasses.map(c => {
              const color = DISC[c.discipline]?.color || C.muted;
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: `1px solid ${color}33`, background: `${color}10`, fontSize: 11, fontFamily: C.mono, color }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  {c.name}
                </div>
              );
            })}
          </div>
          <TimetablePhotoImport classes={activeClasses} onParsed={onPhotoParsed} />
          <div style={{ marginBottom: 16 }}>
            <Btn v="ghost" onClick={() => setImportOpen((o) => !o)} style={{ fontSize: 11, padding: "5px 12px" }}>
              {importOpen ? "Close CSV import" : "Import from CSV"}
            </Btn>
            {importOpen && (
              <div style={{ marginTop: 10, padding: 14, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
                  Columns: <code>week, day, period, class, room</code> — week = <b>A/B</b>, day = <b>Mon–Fri</b>, period = <b>1–5</b>, <code>class</code> must match a class name above, <code>room</code> optional. A header row is fine. Matching slots are updated, blanks left alone.
                </div>
                <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ fontSize: 12, marginBottom: 8 }} />
                <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={6}
                  placeholder={"week,day,period,class,room\nA,Mon,1,10X Chemistry,Lab 3\nA,Mon,2,8Y,Rm 12\nB,Tue,5,11Z Triple,"}
                  style={{ width: "100%", fontFamily: C.mono, fontSize: 12, padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, background: "#fff", color: C.text, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 8 }}>
                  <Btn onClick={runImport} disabled={importing || !csvText.trim()} style={{ fontSize: 12 }}>{importing ? "Importing…" : "Import"}</Btn>
                  {importMsg && <span style={{ fontSize: 11, color: importMsg.startsWith("⚠") ? C.red : C.muted, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{importMsg}</span>}
                </div>
              </div>
            )}
          </div>
          {renderWeek(1)}
          {renderWeek(2)}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── CALENDAR SECTION ───────────────────────── */

function CalendarSection({ profile, calendar, onChange }) {
  const [academicYear, setAcademicYear] = useState(calendar?.academic_year || "2026-27");
  const [anchorDate, setAnchorDate] = useState(calendar?.cycle_anchor_date || "2026-09-07");
  const [insetInput, setInsetInput] = useState("");
  const [holStart, setHolStart] = useState("");
  const [holEnd, setHolEnd] = useState("");
  const [holLabel, setHolLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const saveBasics = async () => {
    setBusy(true); setMsg("");
    try {
      if (calendar) {
        await sk.q("timetable_calendar", { method: "PATCH",
          params: { teacher_id: `eq.${profile.id}`, academic_year: `eq.${calendar.academic_year}` },
          body: { academic_year: academicYear, cycle_anchor_date: anchorDate } });
      } else {
        await sk.q("timetable_calendar", { method: "POST",
          body: { teacher_id: profile.id, academic_year: academicYear, cycle_anchor_date: anchorDate } });
      }
      setMsg("Saved ✓");
      onChange();
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const addInset = async () => {
    if (!insetInput) return;
    setBusy(true); setMsg("");
    try {
      const current = calendar?.inset_days || [];
      if (current.includes(insetInput)) { setMsg("Already in list"); setBusy(false); return; }
      const updated = [...current, insetInput].sort();
      await sk.q("timetable_calendar", { method: "PATCH",
        params: { teacher_id: `eq.${profile.id}`, academic_year: `eq.${calendar.academic_year}` },
        body: { inset_days: updated } });
      setInsetInput("");
      onChange();
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const removeInset = async (date) => {
    setBusy(true); setMsg("");
    try {
      const updated = (calendar?.inset_days || []).filter(d => d !== date);
      await sk.q("timetable_calendar", { method: "PATCH",
        params: { teacher_id: `eq.${profile.id}`, academic_year: `eq.${calendar.academic_year}` },
        body: { inset_days: updated } });
      onChange();
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const addHoliday = async () => {
    if (!holStart || !holEnd) return;
    if (holEnd < holStart) { setMsg("End date must be on or after start date."); return; }
    setBusy(true); setMsg("");
    try {
      const current = calendar?.holiday_periods || [];
      const entry: { start: string; end: string; label?: string } = { start: holStart, end: holEnd };
      if (holLabel.trim()) entry.label = holLabel.trim();
      const updated = [...current, entry].sort((a, b) => a.start.localeCompare(b.start));
      await sk.q("timetable_calendar", { method: "PATCH",
        params: { teacher_id: `eq.${profile.id}`, academic_year: `eq.${calendar.academic_year}` },
        body: { holiday_periods: updated } });
      setHolStart(""); setHolEnd(""); setHolLabel("");
      onChange();
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const removeHoliday = async (idx) => {
    setBusy(true); setMsg("");
    try {
      const updated = (calendar?.holiday_periods || []).filter((_, i) => i !== idx);
      await sk.q("timetable_calendar", { method: "PATCH",
        params: { teacher_id: `eq.${profile.id}`, academic_year: `eq.${calendar.academic_year}` },
        body: { holiday_periods: updated } });
      onChange();
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

  const insetDays = calendar?.inset_days || [];
  const holidays = calendar?.holiday_periods || [];

  return (
    <div style={{ marginBottom: 40 }}>
      <SectionHeader title="Calendar" />
      <Card style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, marginBottom: 4 }}>Academic year</div>
            <Inp value={academicYear} onChange={e => setAcademicYear(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, marginBottom: 4 }}>Week A anchor (Monday)</div>
            <Inp type="date" value={anchorDate} onChange={e => setAnchorDate(e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, lineHeight: 1.5, marginBottom: 12 }}>
          Changing the anchor shifts the entire Week A / Week B rotation. Use this after half-term if your school resets the cycle.
        </div>
        <Btn onClick={saveBasics} disabled={busy} style={{ fontSize: 12 }}>{busy ? "Saving..." : "Save"}</Btn>
        {msg && <span style={{ marginLeft: 10, fontSize: 11, fontFamily: C.mono, color: msg.startsWith("Error") ? C.red : C.grn }}>{msg}</span>}
      </Card>

      <Card style={{ padding: 18 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>
          Inset days &amp; closures ({insetDays.length})
        </div>
        <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, lineHeight: 1.5, marginBottom: 12 }}>
          Days the homepage will skip. Training days, bank holidays, snow days, anything where you&apos;re not teaching.
        </div>
        {calendar ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Inp type="date" value={insetInput} onChange={e => setInsetInput(e.target.value)} style={{ flex: 1 }} />
              <Btn onClick={addInset} disabled={busy || !insetInput} style={{ fontSize: 12 }}>Add</Btn>
            </div>
            {insetDays.length === 0 ? (
              <div style={{ fontSize: 12, color: C.dim, fontStyle: "italic" }}>No inset days set.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {insetDays.map(d => (
                  <div key={d} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px 4px 10px", borderRadius: 999, background: C.bg, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: C.mono }}>
                    {fmt(d)}
                    <button onClick={() => removeInset(d)} style={{ width: 18, height: 18, borderRadius: "50%", border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.dim, fontStyle: "italic" }}>Save the academic year first.</div>
        )}
      </Card>

      <Card style={{ padding: 18, marginTop: 14 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>
          Holiday weeks ({holidays.length})
        </div>
        <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, lineHeight: 1.5, marginBottom: 12 }}>
          Multi-day school closures (half-terms, end-of-term breaks). Any FULL Mon–Fri week inside a holiday pauses the Week A / Week B rotation, so the cycle resumes where it left off when school returns.
        </div>
        {calendar ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr auto", gap: 8, marginBottom: 12, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Start</div>
                <Inp type="date" value={holStart} onChange={e => setHolStart(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>End</div>
                <Inp type="date" value={holEnd} onChange={e => setHolEnd(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: C.mono, color: C.muted, marginBottom: 3 }}>Label (optional)</div>
                <Inp value={holLabel} onChange={e => setHolLabel(e.target.value)} placeholder="e.g. May half-term" />
              </div>
              <Btn onClick={addHoliday} disabled={busy || !holStart || !holEnd} style={{ fontSize: 12 }}>Add</Btn>
            </div>
            {holidays.length === 0 ? (
              <div style={{ fontSize: 12, color: C.dim, fontStyle: "italic" }}>No holiday weeks set.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {holidays.map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 12px", borderRadius: 6, background: C.bg, border: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, fontFamily: C.mono, color: C.text, fontWeight: 500 }}>{fmt(h.start)} → {fmt(h.end)}</span>
                    {h.label && <span style={{ fontSize: 12, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</span>}
                    {!h.label && <span style={{ flex: 1 }} />}
                    <button onClick={() => removeHoliday(i)} style={{ width: 22, height: 22, borderRadius: "50%", border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.dim, fontStyle: "italic" }}>Save the academic year first.</div>
        )}
      </Card>
    </div>
  );
}

/* ───────────────────────── SHARED ───────────────────────── */

function SectionHeader({ title, count, suffix }: { title: string; count?: number; suffix?: string }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 14px", display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} />
      <span>{title}</span>
      {typeof count === "number" && <span style={{ color: C.faint }}>{count}{suffix ? ` ${suffix}` : ""}</span>}
      <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
    </div>
  );
}

/* ───────────────────────── MAIN ───────────────────────── */

function ManageContent() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState([]);
  const [slots, setSlots] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [allUnits, setAllUnits] = useState([]);
  const [retClasses, setRetClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [cls, allCalendars, units, rc] = await Promise.all([
        sk.q("classes", { params: { teacher_id: `eq.${profile.id}`, order: "archived.asc,name.asc" } }),
        sk.q("timetable_calendar", { params: { teacher_id: `eq.${profile.id}`, order: "cycle_anchor_date.desc" } }),
        sk.q("units", { params: { select: "*", order: "sort_order.asc" } }),
        ret.fetchClasses(),
      ]);
      setClasses(cls || []);
      setCalendar((allCalendars && allCalendars[0]) || null);
      setAllUnits(units || []);
      setRetClasses(rc || []);
      // Load slots for these classes
      if (cls && cls.length) {
        const ids = cls.map(c => c.id).join(",");
        const s = await sk.q("class_timetable_slots", { params: { class_id: `in.(${ids})`, order: "week_in_cycle.asc,day_of_week.asc,period.asc" } });
        setSlots(s || []);
      } else {
        setSlots([]);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const slotsByClass = {};
  slots.forEach(s => { (slotsByClass[s.class_id] = slotsByClass[s.class_id] || []).push(s); });

  if (loading || !profile) return <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 12, padding: 40 }}>Loading…</div>;

  const academicYear = calendar?.academic_year || "2026-27";

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>Manage</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Your <em style={{ fontStyle: "italic", color: C.grn }}>classes &amp; timetable</em>.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 36, maxWidth: "52ch", lineHeight: 1.55 }}>
        Edit anything. Changes save immediately. Archive a class to remove it from the homepage without losing its history.
      </p>

      <ClassesSection profile={profile} classes={classes} slotsByClass={slotsByClass}
        allUnits={allUnits} retClasses={retClasses} academicYear={academicYear} onChange={load} />

      <TimetableSection classes={classes} slots={slots} onChange={load} />

      <CalendarSection profile={profile} calendar={calendar} onChange={load} />
    </div>
  );
}

export default function ManagePage() {
  return <AppShell><ManageContent /></AppShell>;
}
