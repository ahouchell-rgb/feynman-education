"use client";
import { useState } from "react";
import { sk, SK_URL } from "@/lib/sk";
import { C } from "@/lib/theme";

export function FileUpload({ unitId, lessonId, onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const handleFiles = async (files: FileList | File[] | null) => {
    setErr(""); setUploading(true);
    for (const file of Array.from(files || []) as File[]) {
      try {
        const ext = file.name.split(".").pop().toLowerCase();
        const resourceType = ["ppt","pptx"].includes(ext) ? "slides" :
          ["doc","docx"].includes(ext) ? "document" :
          ["pdf"].includes(ext) ? "document" :
          ["jpg","jpeg","png","gif","webp"].includes(ext) ? "image" : "other";
        const path = `${unitId}${lessonId ? `/lesson_${lessonId}` : ""}/${Date.now()}_${file.name.replace(/\s+/g,"-")}`;
        await sk.upload(path, file);
        await sk.q("resources", { method: "POST", body: {
          unit_id: unitId,
          lesson_id: lessonId || null,
          title: file.name.replace(/\.[^.]+$/, ""),
          resource_type: resourceType,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: sk.auth.user()?.id,
          is_public: true,
        }});
        onUploaded?.();
      } catch (e) { setErr(e.message); }
    }
    setUploading(false);
  };

  const inputId = `sk-file-input-${lessonId || unitId || "x"}`;

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => document.getElementById(inputId)?.click()}
      style={{ border: `1.5px dashed ${dragging ? C.accent : C.border}`, borderRadius: 6, padding: "16px 20px", textAlign: "center", cursor: "pointer", background: dragging ? C.bg : "transparent", transition: "all .15s" }}>
      <input id={inputId} type="file" multiple style={{ display: "none" }}
        onChange={e => { handleFiles(Array.from(e.target.files)); e.target.value = ""; }} />
      <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted }}>{uploading ? "Uploading..." : "Drop files here or click to upload"}</div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>PPTX, DOCX, PDF, images</div>
      {err && <div style={{ marginTop: 8, fontSize: 11, color: C.red }}>{err}</div>}
    </div>
  );
}
