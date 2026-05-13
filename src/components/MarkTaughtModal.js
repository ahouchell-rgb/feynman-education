"use client";
import { useEffect, useState } from "react";
import { sk, RET_URL, RET_KEY, SK_API_KEY } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Card } from "@/lib/primitives";

export function MarkTaughtModal({ lesson, mapEntry, profile, onClose, onSuccess }) {
  const [classes, setClasses] = useState([]);
  const [selected, setSelected] = useState(new Set(profile.retrieval_class_ids || []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const cls = await fetch(`${RET_URL}/rest/v1/classes?select=id,name,join_code&order=name.asc`, {
          headers: { apikey: RET_KEY, Authorization: `Bearer ${RET_KEY}` }
        }).then(r => r.json());
        setClasses(Array.isArray(cls) ? cls : []);
      } catch { setClasses([]); }
      setLoading(false);
    })();
  }, []);

  const toggle = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    if (!selected.size) return;
    setBusy(true); setMsg("");
    try {
      await sk.q("profiles", { method: "PATCH", params: { id: `eq.${profile.id}` }, body: { retrieval_class_ids: [...selected] } });
      const r = await fetch(`${RET_URL}/functions/v1/set-recency`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: RET_KEY, "x-sciencekit-key": SK_API_KEY },
        body: JSON.stringify({ topic_id: mapEntry.retrieval_topic_id, class_ids: [...selected] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      await sk.q("taught_log", { method: "POST", body: { teacher_id: profile.id, lesson_id: lesson.id, retrieval_class_ids: [...selected] } });
      setMsg("Marked as taught ✓ Retrieval queue updated");
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 440, padding: 24 }}>
        <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Mark as taught</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>{lesson.title}</div>
        {mapEntry?.retrieval_topic_name && (
          <div style={{ padding: "8px 10px", borderRadius: 6, background: C.grnS, color: C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 14 }}>
            → Retrieval topic: {mapEntry.retrieval_topic_name}
          </div>
        )}
        <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 8 }}>Select which classes to update:</div>
        {loading ? <div style={{ color: C.dim, fontSize: 12 }}>Loading classes...</div> :
          classes.length === 0 ? <div style={{ color: C.dim, fontSize: 12 }}>No retrieval. classes found.</div> :
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {classes.map(c => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, background: selected.has(c.id) ? C.grnS : C.bg, border: `1px solid ${selected.has(c.id) ? C.grn : C.border}`, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ accentColor: C.grn }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginLeft: "auto" }}>{c.join_code}</span>
              </label>
            ))}
          </div>
        }
        {msg && <div style={{ padding: "8px 10px", borderRadius: 6, background: msg.startsWith("Error") ? C.redS : C.grnS, color: msg.startsWith("Error") ? C.red : C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={submit} disabled={!selected.size || busy} style={{ flex: 1 }}>{busy ? "Updating..." : "Mark as taught →"}</Btn>
          <Btn v="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </Card>
    </div>
  );
}
