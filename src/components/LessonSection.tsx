"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { sanitizeHtml } from "@/lib/sanitize";
import { Btn, RichEditor } from "@/lib/primitives";

export function LessonSection({ title, sysValue, teacherValue, fieldKey, isAdmin, isTeacher, onSaveSystem, onSaveTeacher }) {
  const [editing, setEditing] = useState(false);
  const [viewMode, setViewMode] = useState("system");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const hasTeacher = !!teacherValue;
  const displayValue = viewMode === "mine" && hasTeacher ? teacherValue : sysValue;

  const startEdit = () => { setDraft(displayValue || ""); setEditing(true); };

  const save = async () => {
    setBusy(true);
    try {
      if (viewMode === "mine" || (!isAdmin && isTeacher)) {
        await onSaveTeacher(fieldKey, draft);
      } else {
        await onSaveSystem(fieldKey, draft);
      }
      setEditing(false);
    } catch (e) { console.error(e); }
    setBusy(false);
  };

  if (!displayValue && !isAdmin && !isTeacher) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>{title}</div>
        {hasTeacher && (
          <div style={{ display: "flex", gap: 4 }}>
            {["system","mine"].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{ fontSize: 10, fontFamily: C.mono, padding: "2px 7px", borderRadius: 3, border: `1px solid ${viewMode===m ? C.accent : C.border}`, background: viewMode===m ? C.accent : "transparent", color: viewMode===m ? C.accentFg : C.dim, cursor: "pointer" }}>
                {m === "system" ? "original" : "my version"}
              </button>
            ))}
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {(isAdmin && viewMode === "system") && !editing && (
            <Btn v="ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={startEdit}>Edit original</Btn>
          )}
          {isTeacher && !editing && (
            <Btn v="ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => { setViewMode("mine"); startEdit(); }}>
              {hasTeacher ? "Edit my version" : "Add my version"}
            </Btn>
          )}
        </div>
      </div>
      {editing ? (
        <div>
          <RichEditor value={draft} onChange={setDraft} minHeight={100} />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Btn onClick={save} disabled={busy} style={{ fontSize: 12 }}>{busy ? "Saving..." : "Save"}</Btn>
            <Btn v="ghost" onClick={() => setEditing(false)} style={{ fontSize: 12 }}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <div style={{ padding: "12px 14px", borderRadius: 6, background: viewMode === "mine" ? "rgba(6,95,70,0.04)" : C.bg, border: `1px solid ${viewMode === "mine" ? "rgba(6,95,70,0.15)" : C.border}`, fontSize: 14, lineHeight: 1.7 }}>
          {displayValue
            ? <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayValue) }} />
            : <span style={{ color: C.dim, fontStyle: "italic" }}>{isAdmin || isTeacher ? "No content yet — click edit to add." : "Not set."}</span>}
        </div>
      )}
    </div>
  );
}
