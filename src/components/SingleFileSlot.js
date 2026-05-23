"use client";
import { useRef, useState } from "react";
import { sk, pubUrl, officeUrl } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { ResourceViewer } from "@/components/Resources";

/**
 * SingleFileSlot — one-file-per-lesson-per-teacher viewer/uploader.
 *
 * Used for:
 *   - the lesson's main slide deck (kind="slides", table public.lesson_slides)
 *   - the lesson's scheme-of-work doc (kind="sow",    table public.lesson_sow)
 *
 * Both tables share the same shape: { id, lesson_id, teacher_id, file_path,
 * file_name, title }. Files live in the existing `resources` storage bucket
 * under `${unitId}/lesson_${lessonId}/${kind}/...` so they're separate from
 * worksheet uploads (which live in the `resources` table).
 *
 * Replace semantics: uploading a new file deletes the previous storage object
 * before the row is updated, so we don't accumulate orphaned blobs.
 */
export function SingleFileSlot({
  kind,          // "slides" | "sow"
  table,         // "lesson_slides" | "lesson_sow"
  label,         // header label, e.g. "Lesson slides"
  emptyLabel,    // call-to-action when no file, e.g. "Upload the PowerPoint for this lesson"
  accept,        // file input accept attr
  height = 480,  // inline viewer height
  unitId,
  lessonId,
  profile,
  record,        // current row or null
  onChange,      // () => reload
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [viewing, setViewing] = useState(null);

  const file = record;
  const fileUrl = file ? pubUrl(file.file_path) : null;
  const ext = file?.file_name?.split(".").pop()?.toLowerCase() || "";
  const isOffice = ["pptx","ppt","docx","doc","xlsx","xls"].includes(ext);
  const isPdf = ext === "pdf";
  const isImg = ["jpg","jpeg","png","gif","webp"].includes(ext);

  const upload = async (f) => {
    if (!f) return;
    setErr(""); setBusy(true);
    try {
      // New storage path namespaced under the kind so slides/SOW/worksheets
      // never collide. The bucket is the same `resources` bucket.
      const path = `${unitId}/lesson_${lessonId}/${kind}/${Date.now()}_${f.name.replace(/\s+/g,"-")}`;
      await sk.upload(path, f);
      const body = {
        lesson_id: lessonId,
        teacher_id: profile.id,
        file_path: path,
        file_name: f.name,
        title: f.name.replace(/\.[^.]+$/, ""),
      };
      if (record?.id) {
        // Replace: delete old file, then update the row.
        try { await sk.storageDelete(record.file_path); } catch {}
        await sk.q(table, {
          method: "PATCH",
          params: { id: `eq.${record.id}`, teacher_id: `eq.${profile.id}` },
          body: { ...body, updated_at: new Date().toISOString() },
        });
      } else {
        await sk.q(table, { method: "POST", body });
      }
      onChange?.();
    } catch (e) {
      setErr(e.message || "Upload failed");
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!record?.id) return;
    if (!confirm(`Remove "${record.file_name}"?`)) return;
    setBusy(true);
    try {
      try { await sk.storageDelete(record.file_path); } catch {}
      await sk.del(table, { id: `eq.${record.id}`, teacher_id: `eq.${profile.id}` });
      onChange?.();
    } catch (e) {
      setErr(e.message || "Couldn't remove");
    }
    setBusy(false);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {viewing && <ResourceViewer resource={viewing.resource} fileUrl={viewing.url} onClose={() => setViewing(null)} />}
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; upload(f); }} />

      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flex: 1 }}>
          {label}
        </div>
        {file && (
          <div style={{ display: "flex", gap: 6 }}>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }}
              onClick={() => setViewing({ resource: { title: file.title || file.file_name, file_name: file.file_name, file_path: file.file_path }, url: fileUrl })}>
              Fullscreen
            </Btn>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} disabled={busy}
              onClick={() => inputRef.current?.click()}>
              {busy ? "Uploading…" : "Replace"}
            </Btn>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px", color: C.red }} disabled={busy}
              onClick={remove}>
              Remove
            </Btn>
          </div>
        )}
      </div>

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            width: "100%",
            border: `1.5px dashed ${C.border}`,
            borderRadius: 8,
            background: C.surface,
            padding: "28px 20px",
            cursor: busy ? "default" : "pointer",
            fontFamily: "inherit",
          }}>
          <div style={{ fontSize: 13, fontFamily: C.mono, color: C.muted }}>
            {busy ? "Uploading…" : emptyLabel}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            Click to choose · accepts {accept || "any file"}
          </div>
        </button>
      ) : (
        <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, background: "#fff" }}>
          <div style={{ height, background: "#fff" }}>
            {isOffice ? (
              <iframe src={officeUrl(fileUrl)} style={{ width: "100%", height: "100%", border: "none" }} title={file.title || file.file_name} />
            ) : isPdf ? (
              <iframe src={fileUrl} style={{ width: "100%", height: "100%", border: "none" }} title={file.title || file.file_name} />
            ) : isImg ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: C.bg }}>
                <img src={fileUrl} alt={file.title || file.file_name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.dim, fontFamily: C.mono, fontSize: 12 }}>
                Can&apos;t preview this file type — click Fullscreen.
              </div>
            )}
          </div>
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, background: C.bg, fontSize: 11, fontFamily: C.mono, color: C.dim, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</span>
            <a href={fileUrl} target="_blank" rel="noreferrer" style={{ color: C.muted, textDecoration: "none" }}>Open ↗</a>
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontFamily: C.mono }}>{err}</div>}
    </div>
  );
}
