"use client";
import { useEffect, useState } from "react";
import { sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Card, Btn } from "@/lib/primitives";

interface Props { contextClass?: { retrieval_class_ids?: string[] } | null; }
interface Deck { id: string; class_label: string; half_term: string; topics: { topic: string }[]; created_at: string; }

/**
 * HalftermDecks — lists the auto-generated half-term feedforward PPTX decks for
 * the class being taught (written by the cron into feedforward_decks) with a
 * download button. Renders nothing until there's a deck to show.
 */
export function HalftermDecks({ contextClass }: Props) {
  const retIds = contextClass?.retrieval_class_ids || [];
  const [decks, setDecks] = useState<Deck[] | null>(null);

  useEffect(() => {
    let live = true;
    if (!retIds.length) { setDecks([]); return; }
    sk.q("feedforward_decks", { params: {
      class_id: `in.(${retIds.join(",")})`, order: "created_at.desc",
      select: "id,class_label,half_term,topics,created_at",
    } }).then((d: any) => { if (live) setDecks(Array.isArray(d) ? d : []); }).catch(() => { if (live) setDecks([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retIds.join(",")]);

  if (!retIds.length || (decks && decks.length === 0)) return null;

  const download = async (d: Deck) => {
    const token = sk.auth.getSession()?.access_token;
    if (!token) return;
    const r = await fetch(`/api/feedforward-deck/${d.id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const blob = await r.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = `${d.class_label}-${d.half_term}.pptx`.replace(/[^\w.\-]/g, "_");
    a.click(); URL.revokeObjectURL(u);
  };

  return (
    <Card style={{ padding: 16, marginBottom: 24, borderLeft: `3px solid ${C.blu}` }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>
        Half-term feedforward decks
      </div>
      {decks === null ? (
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading…</div>
      ) : decks.map((d, i) => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i ? `1px solid ${C.rule}` : "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text }}>{d.half_term} · {(d.topics || []).length} topics</div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {(d.topics || []).map((t) => t.topic).join("  ·  ")}
            </div>
          </div>
          <Btn onClick={() => download(d)}>Download .pptx ↗</Btn>
        </div>
      ))}
    </Card>
  );
}
