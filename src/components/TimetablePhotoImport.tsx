"use client";
import { useRef, useState } from "react";
import { sk } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";

export interface PhotoEntry { week: number; day: number; period: number; class: string; }
interface ImportClass { id: string; name: string; discipline?: string | null; }
interface Props {
  classes: ImportClass[];
  onParsed: (entries: PhotoEntry[], singleWeek: boolean) => void;
}

// Longest-edge ceiling for the upscaled photo. ~1600px keeps grid text legible
// to the model while keeping the base64 payload small and fast to upload.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Downscale a photo client-side and return { mediaType, data } where data is raw
 * base64 (no "data:" prefix). The image never leaves memory except as this base64
 * blob inside the API request — it is not uploaded to storage or persisted.
 */
async function fileToDownscaledBase64(file: File): Promise<{ mediaType: string; data: string }> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Couldn't read the image."));
    fr.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Couldn't load the image."));
    im.src = dataUrl;
  });
  const longest = Math.max(img.width, img.height) || 1;
  const scale = Math.min(1, MAX_EDGE / longest);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image.");
  ctx.drawImage(img, 0, 0, w, h);
  const jpeg = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const data = jpeg.split(",")[1] || "";
  return { mediaType: "image/jpeg", data };
}

/**
 * TimetablePhotoImport — a button + hidden camera/file input. The teacher snaps
 * their printed/MIS timetable; Claude vision reads it and we hand the parsed
 * entries back via onParsed for REVIEW in the grid. Nothing is saved here.
 */
export function TimetablePhotoImport({ classes, onParsed }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const onPick = async (file: File | null | undefined) => {
    if (!file) return;
    setErr(""); setNote("");
    if (!/^image\//.test(file.type)) { setErr("Please choose a photo."); return; }
    if (!classes.length) { setErr("Add your classes first, then snap the timetable."); return; }
    setBusy(true);
    try {
      const token = sk.auth.getToken();
      if (!token) throw new Error("Sign in again to import.");
      const image = await fileToDownscaledBase64(file);
      const r = await fetch("/api/timetable-ocr", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image, classes: classes.map(c => ({ id: c.id, name: c.name, discipline: c.discipline })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const entries: PhotoEntry[] = Array.isArray(j.entries) ? j.entries : [];
      if (!entries.length) {
        setErr(j.notes || "No matching lessons found. Check the photo is straight-on and your class names match.");
      } else {
        setNote(`Filled ${entries.length} slot${entries.length === 1 ? "" : "s"} — check the grid below.${j.notes ? " " + j.notes : ""}`);
        onParsed(entries, j.singleWeek === true);
      }
    } catch (e: any) {
      setErr(e.message || "Couldn't read the timetable.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Btn v="soft" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Reading your timetable…" : "📷 Snap a photo of your timetable"}
        </Btn>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>
          AI can make mistakes — check the grid before saving
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>
      {note && <div style={{ marginTop: 8, fontSize: 12, color: C.grn, fontFamily: C.mono }}>{note}</div>}
      {err && <div style={{ marginTop: 8, fontSize: 12, color: C.red, fontFamily: C.mono }}>{err}</div>}
    </div>
  );
}
