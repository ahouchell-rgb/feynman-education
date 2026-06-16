"use client";
import { useState, useEffect } from "react";
import { sb } from "../lib/supabase";
import { C } from "../lib/theme";
import { Card, Badge, Bar, Kicker, Headline, Deck } from "./ui";

/* ClassGaps — the actionable headline of the dashboard: the objectives this
 * class is weakest on, read straight from the objective-mastery spine
 * (the class_weak_objectives view). Each gap carries the scheme-of-work unit it
 * maps to, so "what to reteach" links back to "what to plan". Topics whose
 * curriculum strand has no scheme unit yet show "no unit" rather than a guess.
 *
 * The view is security_invoker, so RLS on responses scopes it to this teacher's
 * own classes — we still pass class_id for the specific class on screen. */
export function ClassGaps({ cls }) {
  const [rows, setRows] = useState(null); // null = loading, [] = none/loaded-empty
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    if (!cls?.id) { setRows([]); return; }
    setRows(null); setErr(null);
    sb.q("class_weak_objectives", { params: {
      class_id: `eq.${cls.id}`,
      weakness_rank: "lte.6",
      order: "weakness_rank.asc",
      select: "topic_name,pct_correct,marked,students,last_seen,unit_code,unit_title",
    } })
      .then(d => { if (live) setRows(Array.isArray(d) ? d : []); })
      .catch(e => { if (live) { setErr(e.message || "Could not load gaps"); setRows([]); } });
    return () => { live = false; };
  }, [cls?.id]);

  if (rows === null) return (
    <Card style={{ padding: 16, marginTop: 18 }}>
      <div style={{ fontSize: 12, color: C.dim }}>Loading class gaps…</div>
    </Card>
  );

  // Not enough marked answers anywhere yet — say so plainly rather than show an empty box.
  if (!rows.length) return (
    <Card style={{ padding: "16px 18px", marginTop: 18, borderLeft: `3px solid ${C.grn}` }}>
      <Kicker color={C.grn}>Class gaps</Kicker>
      <div style={{ fontSize: 13, color: C.mid }}>
        {err || "No clear gaps yet — a topic needs at least 5 marked answers before it appears here."}
      </div>
    </Card>
  );

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

  return (
    <Card style={{ padding: "18px 18px 14px", marginTop: 18, borderLeft: `3px solid ${C.red}` }}>
      <Kicker color={C.red}>Class gaps · reteach these</Kicker>
      <Headline size={18} style={{ marginBottom: 2 }}>Weakest objectives</Headline>
      <Deck style={{ marginBottom: 14 }}>Lowest accuracy first, from retrieval answers — the unit tag shows where to plan.</Deck>
      {rows.map((r, i) => {
        const pct = Math.round(r.pct_correct);
        const col = pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red;
        const unit = r.unit_title || r.unit_code;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${C.bdrSoft}` : "none" }}>
            <div style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 600, color: col, minWidth: 46, textAlign: "right", letterSpacing: "-0.02em" }}>{pct}%</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.topic_name}</div>
              <div style={{ marginTop: 5 }}><Bar pct={pct} label={r.topic_name} /></div>
              <div style={{ marginTop: 5, fontSize: 10, color: C.dim, letterSpacing: ".02em" }}>{r.marked} marked · {r.students} pupil{r.students === 1 ? "" : "s"} · last {fmtDate(r.last_seen)}</div>
            </div>
            {unit
              ? <Badge color={C.acc} style={{ flexShrink: 0 }}>{unit}</Badge>
              : <span style={{ flexShrink: 0, fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: ".12em" }}>no unit</span>}
          </div>
        );
      })}
    </Card>
  );
}
