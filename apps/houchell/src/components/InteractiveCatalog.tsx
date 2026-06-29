"use client";
import { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { fetchResources, interactiveUrl, type Resource, type Section } from "@/lib/interactive";

// Full-screen in-app viewer — keeps the visitor on this domain while the
// resource itself loads from the interactive origin in a sandboxed frame.
function ResourceViewer({ item, onClose }: { item: Resource; onClose: () => void }) {
  const url = interactiveUrl(item.href);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.accent || C.grn, flexShrink: 0 }} />
        <span style={{ fontSize: 13, flex: 1, fontFamily: C.serif, fontStyle: "italic", color: C.text }}
          dangerouslySetInnerHTML={{ __html: item.name }} />
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, textDecoration: "none", padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 6 }}>Open ↗</a>
        <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={onClose}>Close ×</Btn>
      </div>
      <iframe
        src={url}
        title={item.href}
        style={{ flex: 1, width: "100%", border: "none", background: "#fff", display: "block" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

function ResourceCard({ item, onOpen }: { item: Resource; onOpen: () => void }) {
  const accent = item.accent || C.grn;
  return (
    <button onClick={onOpen}
      style={{ textAlign: "left", padding: "18px 20px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "inherit", position: "relative", display: "flex", flexDirection: "column", gap: 8, minWidth: 0, transition: "border-color .12s" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
      <span style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: accent, borderRadius: "8px 0 0 8px" }} />
      {item.spec && (
        <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: accent, fontWeight: 600 }}
          dangerouslySetInnerHTML={{ __html: item.spec }} />
      )}
      <div style={{ fontFamily: C.serif, fontSize: 21, lineHeight: 1.1, color: C.text }}
        dangerouslySetInnerHTML={{ __html: item.name }} />
      {item.tag && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: item.tag }} />}
      {item.tags?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
          {item.tags.map(t => (
            <span key={t} style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.06em", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 5px" }}>{t}</span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

export function InteractiveCatalog({ kicker, title, blurb, filterTypes }: {
  kicker: string;
  title: string;
  blurb: string;
  filterTypes: string[];
}) {
  const [sections, setSections] = useState<Section[] | null>(null);
  const [err, setErr] = useState("");
  const [active, setActive] = useState<Resource | null>(null);

  useEffect(() => {
    (async () => {
      try { setSections(await fetchResources()); }
      catch (e: any) { setErr(e?.message || "Could not load resources."); }
    })();
  }, []);

  const grouped = useMemo(() => {
    if (!sections) return [];
    return sections
      .map(s => ({ ...s, items: s.items.filter(i => filterTypes.includes(i.type || "")) }))
      .filter(s => s.items.length > 0);
  }, [sections, filterTypes]);

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>{kicker}</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>{title}</h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 32, maxWidth: "56ch", lineHeight: 1.55 }}>{blurb}</p>

      {err && <div style={{ padding: 20, border: `1px solid ${C.border}`, borderRadius: 8, color: C.red, fontFamily: C.mono, fontSize: 12 }}>Couldn’t load resources: {err}</div>}
      {!sections && !err && <div style={{ padding: 40, color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.08em" }}>Loading…</div>}

      {grouped.map(section => (
        <div key={section.id} style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 14px", display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} />
            <span>{section.title}</span>
            <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
            <span style={{ color: C.faint }}>{section.items.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {section.items.map(item => (
              <ResourceCard key={item.href} item={item} onOpen={() => setActive(item)} />
            ))}
          </div>
        </div>
      ))}

      {active && <ResourceViewer item={active} onClose={() => setActive(null)} />}
    </div>
  );
}
