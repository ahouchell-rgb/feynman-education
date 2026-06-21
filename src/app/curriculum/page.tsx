"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sk } from "@/lib/sk";
import { C, DISC, TERM_ORDER, unitAccent } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";

function CurriculumContent() {
  const router = useRouter();
  const [groups, setGroups] = useState([]);
  const [units, setUnits] = useState({});
  const [selectedYearId, setSelectedYearId] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const gs = await sk.q("groups", { params: { order: "sort_order.asc" } });
      setGroups(gs);
      const all = await sk.q("units", { params: { select: "*,subject:subjects(name,slug)", order: "sort_order.asc" } });
      const byGroup = {};
      gs.forEach(g => { byGroup[g.id] = all.filter(u => u.group_id === g.id); });
      setUnits(byGroup);
      if (gs.length) {
        const y9 = gs.find(g => /y9|year\s*9/i.test(g.label || g.id));
        setSelectedYearId(y9?.id || gs[0].id);
      }
    })();
  }, []);

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>Curriculum overview</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 56, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        A shared <em style={{ fontStyle: "italic", color: C.grn }}>base</em> for every lesson.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 36, maxWidth: "52ch", lineHeight: 1.55 }}>
        Browse, copy, edit. Sequenced by year and term — your curriculum, in one place.
      </p>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 36, flexWrap: "wrap", borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ display: "flex", gap: 0, marginBottom: -1, flexWrap: "wrap" }}>
          {groups.map(g => {
            const isActive = selectedYearId === g.id;
            return (
              <button key={g.id} onClick={() => setSelectedYearId(g.id)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 22px 14px", fontFamily: C.serif, fontSize: 24, letterSpacing: "-0.01em", color: isActive ? C.text : C.dim, borderBottom: `2px solid ${isActive ? C.text : "transparent"}`, transition: "color .15s" }}>
                <span>{g.label}</span>
                <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", verticalAlign: "super", marginLeft: 4, color: C.dim }}>{g.key_stage?.toUpperCase()}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, paddingBottom: 12, flexWrap: "wrap" }}>
          {[
            { id: "all", label: "All", color: null },
            { id: "biology", label: "Biology", color: DISC.biology.color },
            { id: "chemistry", label: "Chemistry", color: DISC.chemistry.color },
            { id: "physics", label: "Physics", color: DISC.physics.color },
          ].map(s => {
            const isActive = subjectFilter === s.id;
            return (
              <button key={s.id} onClick={() => setSubjectFilter(s.id)}
                style={{ background: isActive ? C.accent : "transparent", color: isActive ? C.accentFg : C.dim, border: `1px solid ${isActive ? C.accent : C.rule}`, cursor: "pointer", padding: "6px 14px", fontFamily: C.mono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: 999, display: "flex", alignItems: "center", gap: 6, transition: "all .15s" }}>
                {s.color && <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, display: "inline-block" }} />}
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {(() => {
        const year = groups.find(g => g.id === selectedYearId);
        if (!year) return null;
        const yearUnits = (units[year.id] || []).filter(u =>
          subjectFilter === "all" || u.discipline === subjectFilter
        );
        const byTerm = {};
        yearUnits.forEach(u => {
          const t = u.term || "untermed";
          if (!byTerm[t]) byTerm[t] = [];
          byTerm[t].push(u);
        });
        const termKeys = Object.keys(byTerm).sort((a, b) => (TERM_ORDER[a] ?? 99) - (TERM_ORDER[b] ?? 99));

        if (yearUnits.length === 0) {
          return (
            <div style={{ padding: "60px 0", textAlign: "center", color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.06em" }}>
              No {subjectFilter !== "all" ? DISC[subjectFilter]?.label.toLowerCase() + " " : ""}units for {year.label}.
            </div>
          );
        }

        return termKeys.map(t => (
          <div key={t} style={{ marginBottom: 36 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 14px", display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} />
              <span>{t === "untermed" ? "Sequence" : t}</span>
              <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
              <span style={{ color: C.faint }}>{byTerm[t].length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 1, background: C.rule, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden" }}>
              {byTerm[t].map(u => {
                const d = unitAccent(u);
                const termCap = u.term ? u.term.charAt(0).toUpperCase() + u.term.slice(1) : "";
                return (
                  <button key={u.id} onClick={() => router.push(`/unit/${u.id}`)}
                    style={{ padding: "22px 22px 20px 26px", background: C.surface, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background .15s", position: "relative", minHeight: 158, display: "flex", flexDirection: "column", gap: 12 }}
                    onMouseEnter={e => { e.currentTarget.style.background = d.bg; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.surface; }}>
                    <span style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: d.color }} />
                    <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.18em", color: d.color, fontWeight: 600, textTransform: "uppercase" }}>
                      {d.label}{termCap ? ` · ${termCap}` : ""}
                    </div>
                    <div style={{ fontFamily: C.serif, fontSize: 26, lineHeight: 1.05, letterSpacing: "-0.01em", color: C.text }}>{u.title}</div>
                    <div style={{ display: "flex", gap: 14, marginTop: "auto", paddingTop: 12, fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.06em", borderTop: `1px dashed ${C.rule}` }}>
                      {u.hours && <span><strong style={{ color: C.text, fontWeight: 500 }}>{u.hours}</strong> hrs</span>}
                      {u.year_group && <span>{u.year_group}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ));
      })()}
    </div>
  );
}

export default function CurriculumPage() {
  return <AppShell><CurriculumContent /></AppShell>;
}
