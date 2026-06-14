"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";

interface Hit { kind: "unit" | "lesson" | "deck"; id: string; title: string; sub?: string; href: string; }

/* Global search across the curriculum, lessons and decks. Opened with ⌘K / Ctrl-K
 * (see AppShell) or the sidebar "Search" button. Debounced; results are grouped
 * and keyboard-navigable. Unit context for lessons/decks comes from a small
 * id→title map loaded once, so we don't depend on PostgREST FK embeds. */
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const unitMap = useRef<Record<string, string>>({});
  const reqId = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    (async () => {
      try {
        const us = await sk.q("units", { params: { select: "id,title" } });
        unitMap.current = Object.fromEntries((us || []).map((u: any) => [u.id, u.title]));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const term = q.trim().replace(/[*%]/g, "");
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      const like = `ilike.*${term}*`;
      const deckFilter: Record<string, string> = user?.id
        ? { or: `(owner.eq.${user.id},shared.eq.true,is_master.eq.true)` }
        : { is_master: "eq.true" };
      const [units, lessons, decks] = await Promise.all([
        sk.q("units", { params: { select: "id,title,discipline", title: like, order: "title.asc", limit: "6" } }).catch(() => []),
        sk.q("lessons", { params: { select: "id,unit_id,title,lesson_number", title: like, order: "title.asc", limit: "8" } }).catch(() => []),
        sk.q("decks", { params: { select: "id,title,unit_id", title: like, order: "updated_at.desc", limit: "8", ...deckFilter } }).catch(() => []),
      ]);
      if (id !== reqId.current) return; // a newer query superseded this one
      const out: Hit[] = [
        ...(units || []).map((u: any): Hit => ({ kind: "unit", id: u.id, title: u.title, sub: u.discipline || "Unit", href: `/unit/${u.id}` })),
        ...(lessons || []).map((l: any): Hit => ({ kind: "lesson", id: l.id, title: l.title, sub: `L${l.lesson_number}${unitMap.current[l.unit_id] ? ` · ${unitMap.current[l.unit_id]}` : ""}`, href: `/unit/${l.unit_id}/lesson/${l.id}` })),
        ...(decks || []).map((d: any): Hit => ({ kind: "deck", id: d.id, title: d.title, sub: d.unit_id && unitMap.current[d.unit_id] ? unitMap.current[d.unit_id] : "Slides", href: `/slides?deck=${d.id}` })),
      ];
      setHits(out);
      setActive(0);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, user?.id]);

  const go = (h?: Hit) => { if (!h) return; onClose(); router.push(h.href); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
  };

  const KIND_LABEL: Record<Hit["kind"], string> = { unit: "Unit", lesson: "Lesson", deck: "Deck" };
  const grouped = useMemo(() => {
    const order: Hit["kind"][] = ["unit", "lesson", "deck"];
    let idx = -1;
    return order
      .map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind).map((h) => ({ h, i: ++idx })) }))
      .filter((g) => g.items.length);
  }, [hits]);

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 80, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "10vh 16px 16px" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 18px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Search units, lessons, decks…"
          aria-label="Search the curriculum"
          style={{ width: "100%", boxSizing: "border-box", padding: "16px 18px", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", fontFamily: C.sans, fontSize: 16, background: C.surface, color: C.text }} />
        <div style={{ maxHeight: "52vh", overflowY: "auto" }}>
          {q.trim().length < 2 ? (
            <div style={{ padding: "18px", fontFamily: C.mono, fontSize: 12, color: C.dim }}>Type at least 2 characters. ↑↓ to move · Enter to open · Esc to close.</div>
          ) : loading && !hits.length ? (
            <div style={{ padding: "18px", fontFamily: C.mono, fontSize: 12, color: C.dim }}>Searching…</div>
          ) : !hits.length ? (
            <div style={{ padding: "18px", fontFamily: C.mono, fontSize: 12, color: C.dim }}>No matches for “{q.trim()}”.</div>
          ) : (
            grouped.map((g) => (
              <div key={g.kind}>
                <div style={{ padding: "10px 16px 4px", fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim }}>{KIND_LABEL[g.kind]}</div>
                {g.items.map(({ h, i }) => (
                  <button key={h.kind + h.id} onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                    style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "baseline", gap: 10, padding: "9px 16px", border: "none", cursor: "pointer", background: i === active ? C.bg : "transparent", fontFamily: C.sans }}>
                    <span style={{ flex: 1, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</span>
                    {h.sub && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{h.sub}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
