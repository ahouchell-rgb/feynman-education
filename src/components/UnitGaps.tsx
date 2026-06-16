"use client";
import { useEffect, useState } from "react";
import { ret, sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Card } from "@/lib/primitives";

interface UnitGapsProps {
  unitId: string;
  unitTitle?: string;
  lessonId: string;
  contextClass?: { name?: string; retrieval_class_ids?: string[] } | null;
}

interface Gap { topic_id: string; topic_name: string; pct_correct: number; marked: number; students: number; }

/**
 * UnitGaps — closes the loop on the planning side. For the class being taught
 * (contextClass), pulls its weakest objectives WITHIN this unit from the
 * retrieval app (ret.unitGaps → class_unit_gaps RPC) and offers a one-click
 * "feedforward" practice sheet generated from exactly those gaps.
 *
 * Renders nothing unless the lesson has a context class linked to retrieval and
 * that class has gaps in this unit with enough data — so it stays out of the
 * way until there's something actionable to show.
 */
export function UnitGaps({ unitId, unitTitle, lessonId, contextClass }: UnitGapsProps) {
  const retIds = contextClass?.retrieval_class_ids || [];
  const [gaps, setGaps] = useState<Gap[] | null>(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sheets, setSheets] = useState<{ id: string; class_label: string | null; created_at: string }[]>([]);
  const [reteach, setReteach] = useState<{ href: string; name: string; origin: string }[]>([]);

  const loadSheets = () => {
    sk.q("feedforward_sheets", { params: { lesson_id: `eq.${lessonId}`, order: "created_at.desc", select: "id,class_label,created_at" } })
      .then((d: any) => setSheets(Array.isArray(d) ? d : []))
      .catch(() => {});
  };
  useEffect(() => {
    if (lessonId) loadSheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // re-teach resources for this unit (interactive-science.com), revision first
  useEffect(() => {
    if (!unitId) return;
    sk.q("resource_map", { params: { unit_id: `eq.${unitId}`, order: "rtype.asc", limit: "8", select: "href,name,origin,rtype" } })
      .then((d: any) => {
        const list = (Array.isArray(d) ? d : []).filter((r: any) => r.rtype !== "widget");
        const pref = [...list.filter((r: any) => r.rtype === "revision"), ...list.filter((r: any) => r.rtype === "interactive tool")];
        setReteach(pref.slice(0, 3).map((r: any) => ({ href: r.href, name: r.name, origin: r.origin })));
      }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const openSheet = async (id: string) => {
    try {
      const row: any = await sk.q("feedforward_sheets", { params: { id: `eq.${id}`, select: "html" }, single: true });
      const w = window.open("", "_blank");
      if (w && row?.html) { w.document.open(); w.document.write(row.html); w.document.close(); }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let live = true;
    if (!unitId || retIds.length === 0) { setGaps([]); return; }
    setGaps(null);
    ret.unitGaps(retIds, unitId)
      .then((g) => { if (live) setGaps(g as Gap[]); })
      .catch(() => { if (live) setGaps([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, retIds.join(",")]);

  if (retIds.length === 0) return null;        // no linked retrieval class
  if (gaps && gaps.length === 0) return null;  // nothing weak enough to show

  const genFeedforward = async () => {
    if (!gaps) return;
    setBusy(true); setErr("");
    try {
      const token = sk.auth.getSession()?.access_token;
      if (!token) throw new Error("Sign in again to generate.");
      const r = await fetch("/api/feedforward", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lessonId,
          className: contextClass?.name,
          gaps: gaps.map((g) => ({ topic_name: g.topic_name, pct_correct: g.pct_correct, marked: g.marked })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const w = window.open("", "_blank");
      if (w) { w.document.open(); w.document.write(j.html); w.document.close(); }
      else { setErr("Allow pop-ups to open the printable sheet."); }
      loadSheets(); // the route saved it server-side — refresh the saved list
    } catch (e: any) {
      setErr(e.message || "Couldn't generate the sheet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ padding: 16, marginBottom: 24, borderLeft: `3px solid ${C.red}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>
          Class gaps in this unit{contextClass?.name ? ` · ${contextClass.name}` : ""}
        </div>
        {unitTitle ? <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>{unitTitle}</span> : null}
      </div>

      {gaps === null ? (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading retrieval data…</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {gaps.map((g) => {
              const pct = Math.round(g.pct_correct);
              const col = pct >= 70 ? C.grn : pct >= 50 ? C.amb : C.red;
              return (
                <div key={g.topic_id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ fontFamily: C.serif, fontSize: 18, fontWeight: 600, color: col, minWidth: 42, textAlign: "right" }}>{pct}%</span>
                  <span style={{ flex: 1, minWidth: 0, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.topic_name}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, flexShrink: 0 }}>{g.marked} marked</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn onClick={genFeedforward} disabled={busy}>{busy ? "Generating…" : "Generate feedforward sheet"}</Btn>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>Scaffolded practice from these gaps · opens to print</span>
          </div>
          {reteach.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: ".06em" }}>Re-teach</span>
              {reteach.map((r) => (
                <a key={r.href} href={`${(r.origin || "https://interactive-science.com").replace(/\/$/, "")}/${r.href}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: C.blu, textDecoration: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 9px" }}>
                  {r.name} ↗
                </a>
              ))}
            </div>
          )}
          {err ? <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>{err}</div> : null}
          {sheets.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Saved sheets</div>
              {sheets.map((s) => (
                <button key={s.id} onClick={() => openSheet(s.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", color: C.muted, fontSize: 12, fontFamily: "inherit" }}>
                  ↗ {s.class_label || "Feedforward"} · {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
