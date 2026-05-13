"use client";
import { pubUrl, officeUrl } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";

export function ResourceItem({ resource, isAdmin, onDelete, onView }) {
  const ext = resource.file_name?.split(".").pop()?.toLowerCase() || "";
  const isOffice = ["pptx","ppt","docx","doc","xlsx","xls"].includes(ext);
  const isPdf = ext === "pdf";
  const fileUrl = pubUrl(resource.file_path);

  const labels = { pptx: "PPT", ppt: "PPT", docx: "DOC", doc: "DOC", pdf: "PDF", xlsx: "XLS", xls: "XLS", jpg: "IMG", jpeg: "IMG", png: "IMG", gif: "IMG", webp: "IMG" };
  const colors = { pptx: C.amb, ppt: C.amb, docx: C.blu, doc: C.blu, pdf: C.red, xlsx: C.grn, xls: C.grn, jpg: C.muted, jpeg: C.muted, png: C.muted, gif: C.muted, webp: C.muted };
  const label = labels[ext] || "FILE";
  const labelColor = colors[ext] || C.muted;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 6 }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: labelColor, padding: "3px 7px", border: `1px solid ${labelColor}`, borderRadius: 3, minWidth: 36, textAlign: "center" }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resource.title}</div>
        <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono, letterSpacing: "0.04em" }}>{resource.file_size ? `${Math.round(resource.file_size / 1024)} KB` : ""}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {(isOffice || isPdf) && <Btn v="soft" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => onView(resource, fileUrl)}>Open</Btn>}
        <a href={fileUrl} download target="_blank" rel="noopener noreferrer">
          <Btn v="ghost" style={{ fontSize: 11, padding: "5px 10px" }}>↓</Btn>
        </a>
        {isAdmin && <Btn v="ghost" style={{ fontSize: 11, padding: "5px 10px", color: C.red, borderColor: "rgba(153,27,27,0.2)" }} onClick={() => onDelete(resource)}>×</Btn>}
      </div>
    </div>
  );
}

export function ResourceViewer({ resource, fileUrl, onClose }) {
  const ext = resource.file_name?.split(".").pop()?.toLowerCase() || "";
  const isOffice = ["pptx","ppt","docx","doc"].includes(ext);
  const isPdf = ext === "pdf";

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 300, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface, gap: 12 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.muted, lineHeight: 1 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{resource.title}</div>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{resource.file_name}</div>
        </div>
        <a href={fileUrl} download target="_blank" rel="noopener noreferrer">
          <Btn v="ghost" style={{ fontSize: 12 }}>↓ Download</Btn>
        </a>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {isOffice ? (
          <iframe src={officeUrl(fileUrl)} style={{ width: "100%", height: "100%", border: "none" }} title={resource.title} />
        ) : isPdf ? (
          <iframe src={fileUrl} style={{ width: "100%", height: "100%", border: "none" }} title={resource.title} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <img src={fileUrl} alt={resource.title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </div>
        )}
      </div>
    </div>
  );
}
