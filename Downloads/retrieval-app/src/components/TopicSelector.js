"use client";
import { useState } from "react";
import { C } from "../lib/theme";
import { Badge, Card, Headline, Inp, Kicker } from "./ui";

export function TopicSelector({ topics, unlocked, toggleT, setUnlocked, cls, userId, deliveries = {}, onMarkTaught }) {
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState("");

  // Group topics by prefix: B = Biology, C = Chemistry, P = Physics
  const groups = {};
  topics.forEach(t => {
    const prefix = t.name.charAt(0);
    const label = prefix === 'B' ? 'Biology' : prefix === 'C' ? 'Chemistry' : prefix === 'P' ? 'Physics' : 'Other';
    const icon = prefix === 'B' ? 'B' : prefix === 'C' ? 'C' : prefix === 'P' ? 'P' : '•';
    const color = prefix === 'B' ? C.grn : prefix === 'C' ? C.amb : prefix === 'P' ? C.acc : C.dim;
    if (!groups[label]) groups[label] = { label, icon, color, topics: [] };
    groups[label].topics.push(t);
  });

  // Sub-group by unit number (e.g. B1, B2, C4)
  const getUnit = (name) => {
    const m = name.match(/^([BCP]\d+)/);
    return m ? m[1] : '';
  };

  const filtered = search.trim()
    ? topics.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : null;

  const toggleGroup = (groupTopics) => {
    const allOn = groupTopics.every(t => unlocked.has(t.id));
    groupTopics.forEach(async t => {
      if (allOn && unlocked.has(t.id)) {
        await toggleT(t.id);
      } else if (!allOn && !unlocked.has(t.id)) {
        await toggleT(t.id);
      }
    });
  };

  const renderTopic = (t) => {
    const on = unlocked.has(t.id);
    const taught = deliveries[t.id];
    const taughtDate = taught ? new Date(taught.taught_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
    return (
      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <button onClick={() => toggleT(t.id)} style={{
          flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 3, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 13,
          background: "transparent", border: "none", borderLeft: `3px solid ${on ? C.pri : "transparent"}`, color: on ? C.txt : C.mid, transition: "all .15s",
        }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${on ? C.pri : C.dim}`, background: on ? C.pri : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{on ? "✓" : ""}</div>
          <span style={{ flex: 1 }}>{t.name}</span>
          {taughtDate && <span style={{ fontSize: 10, color: C.grn, fontWeight: 600, whiteSpace: "nowrap" }}>✓ Taught {taughtDate}</span>}
        </button>
        {on && onMarkTaught && (
          <button onClick={() => onMarkTaught(t.id)} title={taught ? "Unmark as taught" : "Mark as taught"} style={{
            padding: "6px 10px", borderRadius: 8, border: `1px solid ${taught ? C.grn : C.bdr}`, background: taught ? C.grnS : "transparent",
            color: taught ? C.grn : C.dim, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap",
          }}>{taught ? "Taught ✓" : "Mark taught"}</button>
        )}
      </div>
    );
  };

  if (topics.length === 0) return (
    <Card style={{ padding: "40px 20px", textAlign: "center" }}>
      <div style={{ color: C.dim, fontSize: 13 }}>No topics found. Import questions first.</div>
    </Card>
  );

  return (
    <div>
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.bdr}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <Kicker>Topic access</Kicker>
            <Headline size={22}>Unlock topics</Headline>
            <div style={{ color: C.mid, fontSize: 13, marginTop: 4 }}>Students only see questions from unlocked topics.</div>
          </div>
          <Badge color={C.pri}>{unlocked.size}/{topics.length}</Badge>
        </div>
        <Inp placeholder="Search topics..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 13, padding: "10px 12px" }} />
      </div>

      {/* Search results */}
      {filtered && (
        <Card style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</div>
          {filtered.map(renderTopic)}
        </Card>
      )}

      {/* Grouped view */}
      {!filtered && Object.values(groups).map(g => {
        const isOpen = expanded[g.label] !== false; // default open
        const onCount = g.topics.filter(t => unlocked.has(t.id)).length;
        const allOn = onCount === g.topics.length;

        // Sub-group by unit
        const units = {};
        g.topics.forEach(t => {
          const u = getUnit(t.name);
          if (!units[u]) units[u] = [];
          units[u].push(t);
        });

        return (
          <Card key={g.label} style={{ marginBottom: 10, overflow: "hidden" }}>
            {/* Group header */}
            <button onClick={() => setExpanded(p => ({ ...p, [g.label]: !isOpen }))} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", width: "100%", textAlign: "left", fontFamily: "inherit", cursor: "pointer",
              background: "transparent", border: "none", borderBottom: isOpen ? `1px solid ${C.bdr}` : "none",
            }}>
              <span style={{ fontSize: 18 }}>{g.icon}</span>
              <span style={{ flex: 1, color: C.txt, fontWeight: 700, fontSize: 15 }}>{g.label}</span>
              <span style={{ fontSize: 12, color: onCount > 0 ? g.color : C.dim, fontWeight: 600 }}>{onCount}/{g.topics.length}</span>
              <span style={{ color: C.dim, fontSize: 16, transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
            </button>

            {isOpen && (
              <div style={{ padding: "8px 12px 12px" }}>
                {/* Select all / none for this subject */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <button onClick={() => toggleGroup(g.topics)} style={{
                    padding: "6px 12px", borderRadius: 6, border: `1px solid ${allOn ? "rgba(239,68,68,.3)" : g.color + "44"}`,
                    background: allOn ? C.redS : `${g.color}15`, color: allOn ? C.red : g.color,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {allOn ? "Deselect all" : "Select all"} {g.label.toLowerCase()}
                  </button>
                </div>

                {/* Topics grouped by unit */}
                {Object.entries(units).map(([unitName, unitTopics]) => (
                  <div key={unitName} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, marginTop: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: g.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {unitName === 'B1' ? 'B1 — Cells' : unitName === 'B2' ? 'B2 — Body' : unitName === 'B3' ? 'B3 — Nutrition' : unitName === 'B4' ? 'B4 — Breathing' : unitName === 'B5' ? 'B5 — Reproduction' : unitName === 'B6' ? 'B6 — Plants' : unitName === 'B7' ? 'B7 — Respiration' : unitName === 'B8' ? 'B8 — Ecology' : unitName === 'B9' ? 'B9 — Genetics' : unitName}
                      </div>
                      <div style={{ flex: 1, height: 1, background: C.bdr }} />
                      <span style={{ fontSize: 10, color: C.dim }}>{unitTopics.filter(t => unlocked.has(t.id)).length}/{unitTopics.length}</span>
                    </div>
                    {unitTopics.map(renderTopic)}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ─── Question Manager ─── */
