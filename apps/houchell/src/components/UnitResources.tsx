"use client";
import { useEffect, useState } from "react";
import { sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Card } from "@/lib/primitives";

interface Props {
  unitId?: string | null;
  lessonId?: string | null;      // enables "embed into lesson" for widgets
  teacherId?: string | null;
  onEmbed?: () => void;          // refresh callback after embedding
}
interface Res {
  id: string; href: string; name: string; rtype: string;
  level: string; tag: string; accent: string; section: string; origin: string;
}

const resUrl = (r: Res) => `${(r.origin || "https://interactive-science.com").replace(/\/$/, "")}/${r.href}`;

/**
 * UnitResources — surfaces the interactive-science.com tools, revision booklets,
 * and embeddable widgets mapped to this unit (resource_map). Connects the static
 * content library to the lesson: links open the resource; widgets can be embedded
 * straight into the lesson as a lesson_widget iframe. Renders nothing if empty.
 */
export function UnitResources({ unitId, lessonId, teacherId, onEmbed }: Props) {
  const [res, setRes] = useState<Res[] | null>(null);
  const [embedding, setEmbedding] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (!unitId) { setRes([]); return; }
    sk.q("resource_map", { params: {
      unit_id: `eq.${unitId}`, order: "rtype.asc,name.asc",
      select: "id,href,name,rtype,level,tag,accent,section,origin",
    } }).then((d: any) => { if (live) setRes(Array.isArray(d) ? d : []); }).catch(() => { if (live) setRes([]); });
    return () => { live = false; };
  }, [unitId]);

  if (!res || res.length === 0) return null;

  const embed = async (r: Res) => {
    if (!lessonId || !teacherId) return;
    setEmbedding(r.id);
    try {
      await sk.q("lesson_widgets", { method: "POST", body: {
        lesson_id: lessonId, teacher_id: teacherId, title: r.name,
        html: `<iframe src="${resUrl(r)}" title="${r.name}" style="width:100%;height:480px;border:0" loading="lazy"></iframe>`,
        position: Math.floor(Date.now() / 1000), default_height: 500,
      } });
      onEmbed?.();
    } catch { /* ignore */ } finally { setEmbedding(null); }
  };

  const groups: [string, Res[]][] = [
    ["Interactive tools", res.filter((r) => r.rtype === "interactive tool")],
    ["Revision booklets", res.filter((r) => r.rtype === "revision")],
    ["Embeddable widgets", res.filter((r) => r.rtype === "widget")],
  ];

  const canEmbed = !!(lessonId && teacherId);

  return (
    <Card style={{ padding: 16, marginBottom: 24, borderLeft: `3px solid ${C.grn}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>
          Interactive tools &amp; revision for this unit
        </div>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>interactive-science.com</span>
      </div>
      {groups.map(([label, items]) => items.length === 0 ? null : (
        <div key={label} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, marginBottom: 6 }}>{label}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {items.map((r) => {
              const isWidget = r.rtype === "widget";
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px 6px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, maxWidth: 340 }}>
                  <a href={resUrl(r)} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", minWidth: 0, flex: 1 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: r.accent || C.muted, flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                      <span style={{ display: "block", fontFamily: C.mono, fontSize: 10, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.tag}</span>
                    </span>
                  </a>
                  {isWidget && canEmbed && (
                    <button onClick={() => embed(r)} disabled={embedding === r.id}
                      style={{ flexShrink: 0, fontFamily: C.mono, fontSize: 10, fontWeight: 600, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, cursor: "pointer" }}>
                      {embedding === r.id ? "…" : "+ embed"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Card>
  );
}
