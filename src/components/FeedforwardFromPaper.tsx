"use client";
import { useRef, useState } from "react";
import { sk, SK_URL, SK_KEY } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Card } from "@/lib/primitives";

// Placeholder shown in the freshly-opened print tab while the sheet loads.
const SHEET_LOADING_HTML = "<!doctype html><meta charset=utf-8><title>Feedforward</title><body style='margin:0;font:16px/1.5 system-ui,sans-serif;color:#555;display:flex;align-items:center;justify-content:center;height:100vh'>Generating your sheet…</body>";

interface Props {
  lessonId: string;
  contextClass?: { name?: string } | null;
}
interface Pick { url: string; kind: string; name: string; }

/**
 * FeedforwardFromPaper — upload a photo / PDF of a past paper (or just describe the
 * questions the class struggled on) and generate a scaffolded EXAM feedforward
 * worksheet. Multimodal: the file is uploaded to the paper-uploads bucket and the
 * model reads it by URL via /api/feedforward (source:"paper_upload"). Works on ANY
 * lesson page — no digital re-sit or pre-entered paper needed.
 */
export function FeedforwardFromPaper({ lessonId, contextClass }: Props) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Pick[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadOne = async (file: File): Promise<Pick> => {
    const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || (file.type === "application/pdf" ? "pdf" : "jpg");
    const uid = sk.auth.user()?.id || "anon";
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const token = sk.auth.getSession()?.access_token;
    const r = await fetch(`${SK_URL}/storage/v1/object/paper-uploads/${path}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", Authorization: `Bearer ${token || SK_KEY}`, apikey: SK_KEY, "x-upsert": "true" },
      body: file,
    });
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`Upload failed (${r.status}) ${t.slice(0, 120)}`); }
    return { url: `${SK_URL}/storage/v1/object/public/paper-uploads/${path}`, kind: file.type === "application/pdf" ? "pdf" : "image", name: file.name };
  };

  const onPick = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setErr(""); setUploading(true);
    try {
      const files = Array.from(list).slice(0, 8 - picked.length);
      for (const f of files) {
        if (!/^image\//.test(f.type) && f.type !== "application/pdf") { setErr("Only images or PDF files."); continue; }
        if (f.size > 20 * 1024 * 1024) { setErr(`${f.name} is over 20MB.`); continue; }
        const p = await uploadOne(f);
        setPicked(prev => [...prev, p]);
      }
    } catch (e: any) { setErr(e.message || "Upload failed"); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePick = (url: string) => setPicked(prev => prev.filter(p => p.url !== url));

  const generate = async () => {
    if (!picked.length && !notes.trim()) { setErr("Add a paper image/PDF or describe the questions."); return; }
    // Open the print window now, inside the click — window.open after an await is
    // blocked by browsers (notably iPad Safari), so the sheet would never appear.
    const w = window.open("", "_blank");
    if (w) w.document.write(SHEET_LOADING_HTML);
    setBusy(true); setErr("");
    try {
      const token = sk.auth.getSession()?.access_token;
      if (!token) throw new Error("Sign in again to generate.");
      const r = await fetch("/api/feedforward", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lessonId, className: contextClass?.name, source: "paper_upload",
          files: picked.map(p => ({ url: p.url, kind: p.kind })),
          struggledNotes: notes.trim(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (w) { w.document.open(); w.document.write(j.html); w.document.close(); }
      else setErr("Allow pop-ups to open the printable sheet.");
    } catch (e: any) { w?.close(); setErr(e.message || "Couldn't generate the sheet."); }
    setBusy(false);
  };

  return (
    <Card style={{ padding: 16, marginBottom: 24 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>Feedforward from a paper</span>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{open ? "▲ close" : "▼ upload a photo / PDF"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: C.muted }}>Upload a photo or PDF of the paper, and/or say which questions the class struggled on — it builds a scaffolded worksheet that re-teaches exactly those.</div>

          <div onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
            style={{ border: `2px dashed ${C.border}`, borderRadius: 10, padding: "18px 14px", textAlign: "center", cursor: uploading ? "wait" : "pointer", color: C.dim, fontSize: 13 }}>
            {uploading ? "Uploading…" : "Tap to add paper images / PDF (or drag in)"}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={e => onPick(e.target.files)} />
          </div>

          {picked.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {picked.map(p => (
                <span key={p.url} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 99, padding: "3px 9px", color: C.muted }}>
                  {p.kind === "pdf" ? "📄" : "🖼"} {p.name.slice(0, 22)}
                  <button onClick={() => removePick(p.url)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}

          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Which questions did they struggle on? e.g. Q3, Q7, and the 6-marker on osmosis"
            style={{ width: "100%", padding: "9px 11px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn onClick={generate} disabled={busy || uploading || (!picked.length && !notes.trim())}>{busy ? "Generating…" : "Generate feedforward"}</Btn>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>Reads the paper · scaffolds practice · opens to print</span>
          </div>
          {err ? <div style={{ fontSize: 12, color: C.red }}>{err}</div> : null}
        </div>
      )}
    </Card>
  );
}
