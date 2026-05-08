"use client";
import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Config ─── */
const SK_URL  = "https://uujbgdwnuspfnvfpdtvr.supabase.co";
const SK_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1amJnZHdudXNwZm52ZnBkdHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjgyODksImV4cCI6MjA5MDIwNDI4OX0.eMMhPSXTsTMEgnXloEnQpcGpQAwHHI-eHCLapRdSOV4";
const RET_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const RET_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const SK_API_KEY = "MIHy7pb5UoumNqcqxkGfAREqRQkWFP64M1eYPsvc5oo";

/* ─── Supabase client ─── */
const sk = (() => {
  let token = null, user = null;
  const h = (x = {}) => ({ "Content-Type": "application/json", apikey: SK_KEY, Authorization: `Bearer ${token || SK_KEY}`, ...x });
  const q = async (tbl, { method = "GET", body, params = {}, single } = {}) => {
    const u = new URL(`${SK_URL}/rest/v1/${tbl}`);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const hd = h();
    if (single) hd["Accept"] = "application/vnd.pgrst.object+json";
    if (method === "POST" || method === "PATCH") hd["Prefer"] = "return=representation";
    const r = await fetch(u, { method, headers: hd, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `${method} ${tbl} failed`); }
    if (method === "DELETE") return null;
    return r.json();
  };
  const del = async (tbl, p = {}) => {
    const u = new URL(`${SK_URL}/rest/v1/${tbl}`);
    Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, v));
    await fetch(u, { method: "DELETE", headers: h() });
  };
  const upload = async (path, file) => {
    const r = await fetch(`${SK_URL}/storage/v1/object/resources/${path}`, {
      method: "POST",
      headers: { apikey: SK_KEY, Authorization: `Bearer ${token || SK_KEY}`, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Upload failed"); }
    return `${SK_URL}/storage/v1/object/public/resources/${path}`;
  };
  const auth = {
    signIn: async (email, pw) => {
      const r = await fetch(`${SK_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SK_KEY }, body: JSON.stringify({ email, password: pw }) });
      const d = await r.json();
      if (!r.ok || !d.access_token) throw new Error(d.error_description || "Login failed");
      token = d.access_token; user = d.user; return d;
    },
    signUp: async (email, pw, name) => {
      const r = await fetch(`${SK_URL}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SK_KEY }, body: JSON.stringify({ email, password: pw, data: { full_name: name } }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error?.message || "Signup failed");
      if (d.access_token) { token = d.access_token; user = d.user; }
      return d;
    },
    out: () => { token = null; user = null; },
    user: () => user,
    getToken: () => token,
  };
  return { q, del, upload, auth };
})();

const pubUrl = (path) => `${SK_URL}/storage/v1/object/public/resources/${path}`;
const officeUrl = (url) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;

/* ─── Theme ─── */
const C = {
  bg: "#f3eee2", surface: "#faf6ec", border: "#dcd5c0", borderStrong: "#b8b1a0",
  text: "#1a1714", muted: "#4d4940", dim: "#8c8678", faint: "#b8b1a0",
  rule: "#d8d1bd", ruleStrong: "#a8a191",
  accent: "#1a1714", accentFg: "#f3eee2",
  grn: "#5e7c4b", grnS: "rgba(94,124,75,0.10)",
  red: "#b95a3c", redS: "rgba(185,90,60,0.10)",
  amb: "#a06520", ambS: "rgba(160,101,32,0.10)",
  blu: "#2e3a5f", bluS: "rgba(46,58,95,0.10)",
  mono: "'IBM Plex Mono', monospace",
  sans: "'IBM Plex Sans', -apple-system, sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
};

const DISC = {
  biology:   { color: "#5e7c4b", bg: "rgba(94,124,75,0.10)",   label: "Biology" },
  chemistry: { color: "#b95a3c", bg: "rgba(185,90,60,0.10)",   label: "Chemistry" },
  physics:   { color: "#2e3a5f", bg: "rgba(46,58,95,0.10)",    label: "Physics" },
  combined:  { color: "#6b4f7a", bg: "rgba(107,79,122,0.10)",  label: "Combined" },
};

const TERM_ORDER = { autumn: 0, spring: 1, summer: 2 };

/* ─── UI primitives ─── */
const Btn = ({ v = "pri", style, children, ...p }) => {
  const s = {
    pri:   { background: C.accent, color: C.accentFg, border: "none" },
    ghost: { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
    soft:  { background: C.bg, color: C.text, border: `1px solid ${C.border}` },
  };
  return <button {...p} style={{ padding: "8px 16px", borderRadius: 6, fontFamily: C.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.02em", cursor: "pointer", transition: "all .12s", ...s[v], ...style, ...(p.disabled ? { opacity: .4, cursor: "default" } : {}) }}>{children}</button>;
};
const Inp = ({ style, ...p }) => <input {...p} style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 13, background: C.surface, color: C.text, outline: "none", ...style }} />;
const Badge = ({ children, color = C.muted, bg = C.bg }) => <span style={{ fontSize: 10, fontFamily: C.mono, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 3, color, background: bg }}>{children}</span>;
const Card = ({ children, style, ...p }) => <div {...p} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, ...style }}>{children}</div>;

/* ─── Rich Text Editor ─── */
function RichEditor({ value, onChange, readOnly, minHeight = 120, placeholder = "Add content..." }) {
  const ref = useRef(null);
  const lastValue = useRef(value);

  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.innerHTML = value || "";
      lastValue.current = value;
    }
  }, [value]);

  const exec = (cmd, val) => { document.execCommand(cmd, false, val); ref.current?.focus(); };

  const toolbar = [
    { label: "B", cmd: "bold", style: { fontWeight: 700 } },
    { label: "I", cmd: "italic", style: { fontStyle: "italic" } },
    { label: "U", cmd: "underline", style: { textDecoration: "underline" } },
    { label: "H1", cmd: "formatBlock", val: "h2" },
    { label: "H2", cmd: "formatBlock", val: "h3" },
    { label: "•", cmd: "insertUnorderedList" },
    { label: "1.", cmd: "insertOrderedList" },
  ];

  if (readOnly) return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: C.text }}
      dangerouslySetInnerHTML={{ __html: value || `<p style="color:${C.dim}">No content yet.</p>` }} />
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 2, padding: "6px 8px", borderBottom: `1px solid ${C.border}`, background: C.bg, flexWrap: "wrap" }}>
        {toolbar.map(t => (
          <button key={t.label} onMouseDown={e => { e.preventDefault(); exec(t.cmd, t.val); }}
            style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 12, fontFamily: C.mono, color: C.muted, ...t.style }}>
            {t.label}
          </button>
        ))}
        <button onMouseDown={e => { e.preventDefault(); exec("removeFormat"); }}
          style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 11, fontFamily: C.mono, color: C.dim, marginLeft: "auto" }}>
          clear
        </button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={() => { lastValue.current = ref.current.innerHTML; onChange(ref.current.innerHTML); }}
        style={{ padding: "12px 14px", minHeight, fontSize: 14, lineHeight: 1.7, color: C.text, outline: "none" }}
        data-placeholder={placeholder} />
      <style>{`[contenteditable]:empty:before { content: attr(data-placeholder); color: ${C.dim}; pointer-events: none; }`}</style>
    </div>
  );
}

/* ─── AUTH ─── */
function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [name, setName] = useState("");
  const [err, setErr] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);

  const go = async () => {
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "signup") {
        const res = await sk.auth.signUp(email, pw, name);
        if (!res.access_token) { setInfo("Check your email to confirm, then log in."); setMode("login"); setBusy(false); return; }
      } else {
        await sk.auth.signIn(email, pw);
      }
      const u = sk.auth.user();
      let prof;
      try { prof = await sk.q("profiles", { params: { id: `eq.${u.id}` }, single: true }); }
      catch { prof = { role: "teacher", full_name: name || email }; }
      onAuth({ ...u, profile: prof });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.32em", textTransform: "uppercase", color: C.dim, marginBottom: 14 }}>Feynman Education</div>
          <div style={{ fontFamily: C.serif, fontSize: 44, lineHeight: 1, letterSpacing: "-0.02em", color: C.text }}>Science<em style={{ fontStyle: "italic", color: C.grn }}>Kit</em></div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 12, fontFamily: C.serif, fontStyle: "italic" }}>a shared base for every lesson</div>
        </div>
        <Card style={{ padding: "28px 24px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {["login","signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }}
                style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${mode===m ? C.accent : C.border}`, background: mode===m ? C.accent : "transparent", color: mode===m ? C.accentFg : C.muted, fontFamily: C.mono, fontSize: 12, cursor: "pointer", letterSpacing: "0.03em" }}>
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>
          {mode === "signup" && <div style={{ marginBottom: 10 }}><Inp placeholder="Full name" value={name} onChange={e => setName(e.target.value)} /></div>}
          <div style={{ marginBottom: 10 }}><Inp type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div style={{ marginBottom: 16 }}><Inp type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} /></div>
          {err && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{err}</div>}
          {info && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.grnS, color: C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{info}</div>}
          <Btn onClick={go} disabled={busy} style={{ width: "100%" }}>{busy ? "..." : mode === "login" ? "Log in" : "Create account"}</Btn>
        </Card>
      </div>
    </div>
  );
}

/* ─── Mark as Taught Modal ─── */
function MarkTaughtModal({ lesson, mapEntry, profile, onClose, onSuccess }) {
  const [classes, setClasses] = useState([]);
  const [selected, setSelected] = useState(new Set(profile.retrieval_class_ids || []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const cls = await fetch(`${RET_URL}/rest/v1/classes?select=id,name,join_code&order=name.asc`, {
          headers: { apikey: RET_KEY, Authorization: `Bearer ${RET_KEY}` }
        }).then(r => r.json());
        setClasses(Array.isArray(cls) ? cls : []);
      } catch { setClasses([]); }
      setLoading(false);
    })();
  }, []);

  const toggle = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    if (!selected.size) return;
    setBusy(true); setMsg("");
    try {
      // Save class selection to profile
      await sk.q("profiles", { method: "PATCH", params: { id: `eq.${profile.id}` }, body: { retrieval_class_ids: [...selected] } });
      // Call set-recency edge function in retrieval.
      const r = await fetch(`${RET_URL}/functions/v1/set-recency`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: RET_KEY, "x-sciencekit-key": SK_API_KEY },
        body: JSON.stringify({ topic_id: mapEntry.retrieval_topic_id, class_ids: [...selected] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      // Log to taught_log
      await sk.q("taught_log", { method: "POST", body: { teacher_id: profile.id, lesson_id: lesson.id, retrieval_class_ids: [...selected] } });
      setMsg("Marked as taught ✓ Retrieval queue updated");
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 440, padding: 24 }}>
        <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Mark as taught</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>{lesson.title}</div>
        {mapEntry?.retrieval_topic_name && (
          <div style={{ padding: "8px 10px", borderRadius: 6, background: C.grnS, color: C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 14 }}>
            → Retrieval topic: {mapEntry.retrieval_topic_name}
          </div>
        )}
        <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 8 }}>Select which classes to update:</div>
        {loading ? <div style={{ color: C.dim, fontSize: 12 }}>Loading classes...</div> :
          classes.length === 0 ? <div style={{ color: C.dim, fontSize: 12 }}>No retrieval. classes found.</div> :
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {classes.map(c => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, background: selected.has(c.id) ? C.grnS : C.bg, border: `1px solid ${selected.has(c.id) ? C.grn : C.border}`, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ accentColor: C.grn }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginLeft: "auto" }}>{c.join_code}</span>
              </label>
            ))}
          </div>
        }
        {msg && <div style={{ padding: "8px 10px", borderRadius: 6, background: msg.startsWith("Error") ? C.redS : C.grnS, color: msg.startsWith("Error") ? C.red : C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={submit} disabled={!selected.size || busy} style={{ flex: 1 }}>{busy ? "Updating..." : "Mark as taught →"}</Btn>
          <Btn v="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ─── File Upload ─── */
function FileUpload({ unitId, lessonId, onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const handleFiles = async (files) => {
    setErr(""); setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop().toLowerCase();
        const resourceType = ["ppt","pptx"].includes(ext) ? "slides" :
          ["doc","docx"].includes(ext) ? "document" :
          ["pdf"].includes(ext) ? "document" :
          ["jpg","jpeg","png","gif","webp"].includes(ext) ? "image" : "other";
        const path = `${unitId}${lessonId ? `/lesson_${lessonId}` : ""}/${Date.now()}_${file.name.replace(/\s+/g,"-")}`;
        const fileUrl = await sk.upload(path, file);
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
        onUploaded();
      } catch (e) { setErr(e.message); }
    }
    setUploading(false);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => document.getElementById("sk-file-input").click()}
      style={{ border: `1.5px dashed ${dragging ? C.accent : C.border}`, borderRadius: 6, padding: "16px 20px", textAlign: "center", cursor: "pointer", background: dragging ? C.bg : "transparent", transition: "all .15s" }}>
      <input id="sk-file-input" type="file" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
      <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted }}>{uploading ? "Uploading..." : "Drop files here or click to upload"}</div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>PPTX, DOCX, PDF, images</div>
      {err && <div style={{ marginTop: 8, fontSize: 11, color: C.red }}>{err}</div>}
    </div>
  );
}

/* ─── Resource Item ─── */
function ResourceItem({ resource, isAdmin, onDelete, onView }) {
  const ext = resource.file_name?.split(".").pop()?.toLowerCase() || "";
  const isOffice = ["pptx","ppt","docx","doc","xlsx","xls"].includes(ext);
  const isPdf = ext === "pdf";
  const isImg = ["jpg","jpeg","png","gif","webp"].includes(ext);
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

/* ─── Resource Viewer (full screen) ─── */
function ResourceViewer({ resource, fileUrl, onClose }) {
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

/* ─── Lesson Section ─── */
function LessonSection({ title, sysValue, teacherValue, fieldKey, isAdmin, isTeacher, profileId, lessonId, onSaveSystem, onSaveTeacher }) {
  const [editing, setEditing] = useState(false);
  const [viewMode, setViewMode] = useState("system"); // "system" | "mine"
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
            ? <div dangerouslySetInnerHTML={{ __html: displayValue }} />
            : <span style={{ color: C.dim, fontStyle: "italic" }}>{isAdmin || isTeacher ? "No content yet — click edit to add." : "Not set."}</span>}
        </div>
      )}
    </div>
  );
}

/* ─── Lesson View ─── */
function LessonView({ lesson, unit, profile, onBack }) {
  const [resources, setResources] = useState([]);
  const [teacherContent, setTeacherContent] = useState({});
  const [mapEntry, setMapEntry] = useState(null);
  const [viewingResource, setViewingResource] = useState(null);
  const [markingTaught, setMarkingTaught] = useState(false);
  const [taughtLog, setTaughtLog] = useState([]);
  const isAdmin = profile.role === "admin";
  const isTeacher = profile.role === "teacher" || isAdmin;

  useEffect(() => { loadData(); }, [lesson.id]);

  const loadData = async () => {
    const [res, tc, map, log] = await Promise.all([
      sk.q("resources", { params: { lesson_id: `eq.${lesson.id}`, select: "*", order: "created_at.asc" } }).catch(() => []),
      sk.q("lesson_teacher_content", { params: { lesson_id: `eq.${lesson.id}`, teacher_id: `eq.${profile.id}` }, single: true }).catch(() => null),
      sk.q("lesson_retrieval_map", { params: { lesson_id: `eq.${lesson.id}` } }).catch(() => []),
      sk.q("taught_log", { params: { lesson_id: `eq.${lesson.id}`, teacher_id: `eq.${profile.id}`, order: "taught_at.desc", limit: "5" } }).catch(() => []),
    ]);
    setResources(res || []);
    setTeacherContent(tc || {});
    setMapEntry(map?.[0] || null);
    setTaughtLog(log || []);
  };

  const saveSystem = async (field, value) => {
    await sk.q(`lessons?id=eq.${lesson.id}`, { method: "PATCH", body: { [field]: value } });
    lesson[field] = value;
  };

  const saveTeacher = async (field, value) => {
    if (teacherContent?.id) {
      await sk.q("lesson_teacher_content", { method: "PATCH", params: { lesson_id: `eq.${lesson.id}`, teacher_id: `eq.${profile.id}` }, body: { [field]: value, updated_at: new Date().toISOString() } });
    } else {
      const [row] = await sk.q("lesson_teacher_content", { method: "POST", body: { lesson_id: lesson.id, teacher_id: profile.id, [field]: value } });
      setTeacherContent(row || {});
    }
    setTeacherContent(p => ({ ...p, [field]: value }));
  };

  const addRetLink = async () => {
    const topicId = prompt("Enter retrieval. topic ID:");
    const topicName = topicId ? prompt("Enter topic name (for display):") : null;
    if (!topicId || !topicName) return;
    await sk.q("lesson_retrieval_map", { method: "POST", body: { lesson_id: lesson.id, retrieval_topic_id: topicId, retrieval_topic_name: topicName, created_by: profile.id } });
    loadData();
  };

  const deleteResource = async (res) => {
    if (!confirm(`Delete "${res.title}"?`)) return;
    await sk.del("resources", { id: `eq.${res.id}` });
    // Also delete from storage
    await fetch(`${SK_URL}/storage/v1/object/resources/${res.file_path}`, {
      method: "DELETE",
      headers: { apikey: SK_KEY, Authorization: `Bearer ${sk.auth.getToken() || SK_KEY}` },
    });
    loadData();
  };

  const d = DISC[unit.discipline] || DISC.combined;
  const sectionFields = [
    { key: "objectives", title: "Learning objectives" },
    { key: "starter", title: "Starter activity" },
    { key: "main_activities", title: "Main activities" },
    { key: "afl_checkpoint", title: "AFL checkpoint" },
    { key: "plenary", title: "Plenary" },
    { key: "differentiation", title: "Differentiation" },
    { key: "modelling_notes", title: "Modelling notes" },
    { key: "misconception_alerts", title: "Misconception alerts" },
  ];

  return (
    <div>
      {viewingResource && <ResourceViewer resource={viewingResource.resource} fileUrl={viewingResource.url} onClose={() => setViewingResource(null)} />}
      {markingTaught && <MarkTaughtModal lesson={lesson} mapEntry={mapEntry} profile={profile} onClose={() => setMarkingTaught(false)} onSuccess={loadData} />}

      {/* Header */}
      <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: C.mono, fontSize: 11, marginBottom: 16, padding: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          ← {unit.title}
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: d.color, marginBottom: 10 }}>
              L{lesson.lesson_number} · {d.label}{lesson.duration ? ` · ${lesson.duration}` : ""}
            </div>
            <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 38, lineHeight: 1.1, letterSpacing: "-0.015em", color: C.text }}>{lesson.title}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8 }}>
            {mapEntry ? (
              <Btn onClick={() => setMarkingTaught(true)} style={{ background: C.grn, borderColor: C.grn, color: "#fff", fontSize: 12 }}>
                ✓ Mark as taught
              </Btn>
            ) : isAdmin ? (
              <Btn v="ghost" onClick={addRetLink} style={{ fontSize: 12 }}>Link retrieval. topic</Btn>
            ) : null}
          </div>
        </div>
        {mapEntry && (
          <div style={{ marginTop: 14, fontSize: 12, color: C.grn, fontFamily: C.mono, letterSpacing: "0.04em" }}>
            ↻ Linked to retrieval. topic: <span style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: 14 }}>{mapEntry.retrieval_topic_name}</span>
          </div>
        )}
        {taughtLog.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.dim, fontFamily: C.mono, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Last taught · {new Date(taughtLog[0].taught_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}
      </div>

      {/* Keywords */}
      {lesson.keywords?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {lesson.keywords.map((k, i) => <Badge key={i} color={d.color} bg={d.bg}>{k}</Badge>)}
        </div>
      )}

      {/* Resources */}
      {(resources.length > 0 || isAdmin || isTeacher) && (
        <Card style={{ padding: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Resources</div>
          {resources.map(r => (
            <ResourceItem key={r.id} resource={r} isAdmin={isAdmin || r.uploaded_by === profile.id}
              onView={(res, url) => setViewingResource({ resource: res, url })}
              onDelete={deleteResource} />
          ))}
          {(isAdmin || isTeacher) && <FileUpload unitId={unit.id} lessonId={lesson.id} onUploaded={loadData} />}
        </Card>
      )}

      {/* Lesson sections */}
      <Card style={{ padding: 20 }}>
        {sectionFields.map(({ key, title }) => (
          <LessonSection key={key} title={title}
            sysValue={lesson[key]} teacherValue={teacherContent[key]}
            fieldKey={key} isAdmin={isAdmin} isTeacher={isTeacher}
            profileId={profile.id} lessonId={lesson.id}
            onSaveSystem={saveSystem} onSaveTeacher={saveTeacher} />
        ))}
        {(lesson.rich_content || isAdmin) && (
          <LessonSection title="Extended notes" sysValue={lesson.rich_content}
            teacherValue={teacherContent.notes} fieldKey={isAdmin ? "rich_content" : "notes"}
            isAdmin={isAdmin} isTeacher={isTeacher}
            profileId={profile.id} lessonId={lesson.id}
            onSaveSystem={saveSystem} onSaveTeacher={saveTeacher} />
        )}
      </Card>
    </div>
  );
}

/* ─── Unit View ─── */
function UnitView({ unit, profile, onSelectLesson, onBack }) {
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [viewingResource, setViewingResource] = useState(null);
  const [editingSOW, setEditingSOW] = useState(false);
  const [sowDraft, setSowDraft] = useState(unit.scheme_of_work || "");
  const [loading, setLoading] = useState(true);
  const isAdmin = profile.role === "admin";

  useEffect(() => { loadData(); }, [unit.id]);

  const loadData = async () => {
    setLoading(true);
    const [ls, rs] = await Promise.all([
      sk.q("lessons", { params: { unit_id: `eq.${unit.id}`, select: "*", order: "sort_order.asc,lesson_number.asc" } }).catch(() => []),
      sk.q("resources", { params: { unit_id: `eq.${unit.id}`, lesson_id: "is.null", select: "*", order: "created_at.asc" } }).catch(() => []),
    ]);
    setLessons(ls || []);
    setResources(rs || []);
    setLoading(false);
  };

  const saveSOW = async () => {
    await sk.q(`units?id=eq.${unit.id}`, { method: "PATCH", body: { scheme_of_work: sowDraft } });
    unit.scheme_of_work = sowDraft;
    setEditingSOW(false);
  };

  const addLesson = async () => {
    const title = prompt("Lesson title:");
    if (!title) return;
    const num = lessons.length + 1;
    await sk.q("lessons", { method: "POST", body: { unit_id: unit.id, title, lesson_number: num, sort_order: num } });
    loadData();
  };

  const deleteResource = async (res) => {
    if (!confirm(`Delete "${res.title}"?`)) return;
    await sk.del("resources", { id: `eq.${res.id}` });
    await fetch(`${SK_URL}/storage/v1/object/resources/${res.file_path}`, { method: "DELETE", headers: { apikey: SK_KEY, Authorization: `Bearer ${sk.auth.getToken() || SK_KEY}` } });
    loadData();
  };

  const d = DISC[unit.discipline] || DISC.combined;
  const termLabel = unit.term ? unit.term.charAt(0).toUpperCase() + unit.term.slice(1) : "";

  return (
    <div>
      {viewingResource && <ResourceViewer resource={viewingResource.resource} fileUrl={viewingResource.url} onClose={() => setViewingResource(null)} />}

      {/* Unit header */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
        {onBack && (
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: C.mono, fontSize: 11, marginBottom: 16, padding: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            ← Curriculum
          </button>
        )}
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: d.color, marginBottom: 12 }}>
          {d.label}{termLabel ? ` · ${termLabel}` : ""}{unit.year_group ? ` · ${unit.year_group}` : ""}{unit.hours ? ` · ${unit.hours}h` : ""}
        </div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", color: C.text }}>{unit.title}</h1>
      </div>

      {/* Unit-level resources */}
      {(resources.length > 0 || isAdmin) && (
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Unit resources</div>
          {resources.map(r => (
            <ResourceItem key={r.id} resource={r} isAdmin={isAdmin || r.uploaded_by === profile.id}
              onView={(res, url) => setViewingResource({ resource: res, url })}
              onDelete={deleteResource} />
          ))}
          {isAdmin && <FileUpload unitId={unit.id} lessonId={null} onUploaded={loadData} />}
        </Card>
      )}

      {/* Scheme of work */}
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flex: 1 }}>Scheme of work</div>
          {isAdmin && !editingSOW && <Btn v="ghost" onClick={() => setEditingSOW(true)} style={{ fontSize: 11, padding: "4px 10px" }}>Edit</Btn>}
        </div>
        {editingSOW ? (
          <div>
            <RichEditor value={sowDraft} onChange={setSowDraft} minHeight={200} placeholder="Write the scheme of work for this unit..." />
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <Btn onClick={saveSOW} style={{ fontSize: 12 }}>Save</Btn>
              <Btn v="ghost" onClick={() => setEditingSOW(false)} style={{ fontSize: 12 }}>Cancel</Btn>
            </div>
          </div>
        ) : unit.scheme_of_work ? (
          <div style={{ fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: unit.scheme_of_work }} />
        ) : (
          <div style={{ fontSize: 13, color: C.dim, fontStyle: "italic" }}>{isAdmin ? "No scheme of work yet — click Edit to add." : "No scheme of work added yet."}</div>
        )}
      </Card>

      {/* Lessons list */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.muted, flex: 1 }}>LESSONS — {lessons.length} total</div>
        {isAdmin && <Btn v="ghost" onClick={addLesson} style={{ fontSize: 11, padding: "5px 12px" }}>+ Add lesson</Btn>}
      </div>
      {loading ? <div style={{ color: C.dim, fontSize: 13 }}>Loading...</div> :
        lessons.length === 0 ? <div style={{ fontSize: 13, color: C.dim, padding: "20px 0" }}>No lessons yet.</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {lessons.map((l, i) => (
            <button key={l.id} onClick={() => onSelectLesson(l)}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 12, transition: "all .12s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.borderStrong}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, minWidth: 28 }}>L{l.lesson_number}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{l.title}</span>
              {l.keywords?.length > 0 && <span style={{ fontSize: 11, color: C.dim }}>{l.keywords.slice(0, 2).join(", ")}</span>}
              <span style={{ color: C.dim, fontSize: 14 }}>→</span>
            </button>
          ))}
        </div>
      }
    </div>
  );
}

/* ─── Settings Panel ─── */
function Settings({ profile, onClose, onUpdate }) {
  const [form, setForm] = useState({ full_name: profile.full_name || "", retrieval_email: profile.retrieval_email || "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await sk.q("profiles", { method: "PATCH", params: { id: `eq.${profile.id}` }, body: form });
      setMsg("Saved ✓"); onUpdate({ ...profile, ...form });
    } catch (e) { setMsg("Error: " + e.message); }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ width: "100%", maxWidth: 400, padding: 24 }}>
        <div style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14, marginBottom: 20 }}>Settings</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 6 }}>Display name</div>
          <Inp value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 4 }}>Your role</div>
          <div style={{ padding: "8px 12px", borderRadius: 6, background: C.bg, fontSize: 13, fontFamily: C.mono, color: C.text }}>{profile.role}</div>
          {profile.role !== "admin" && <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>To become admin, ask your admin to run: UPDATE profiles SET role='admin' WHERE id='{profile.id}'</div>}
        </div>
        {msg && <div style={{ padding: "8px 10px", borderRadius: 6, background: msg.startsWith("Error") ? C.redS : C.grnS, color: msg.startsWith("Error") ? C.red : C.grn, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={save} disabled={busy} style={{ flex: 1 }}>{busy ? "Saving..." : "Save"}</Btn>
          <Btn v="ghost" onClick={onClose}>Close</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ─── Main App ─── */
export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [units, setUnits] = useState({});       // groupId → units[]
  const [openGroups, setOpenGroups] = useState(new Set(["y7"]));
  const [selectedYearId, setSelectedYearId] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async (u) => {
    setUser(u);
    setProfile(u.profile);
    await loadGroups();
  };

  const loadGroups = async () => {
    setLoading(true);
    const gs = await sk.q("groups", { params: { order: "sort_order.asc" } });
    setGroups(gs);
    // Pre-load all units
    const allUnits = await sk.q("units", { params: { select: "*", order: "sort_order.asc" } });
    const byGroup = {};
    gs.forEach(g => { byGroup[g.id] = allUnits.filter(u => u.group_id === g.id); });
    setUnits(byGroup);
    // default to first year (Y9 if present, else first group)
    if (gs.length && !selectedYearId) {
      const y9 = gs.find(g => /y9|year\s*9/i.test(g.label || g.id));
      setSelectedYearId(y9?.id || gs[0].id);
    }
    setLoading(false);
  };

  const selectUnit = (unit) => { setSelectedUnit(unit); setSelectedLesson(null); };

  if (!user) return <Auth onAuth={handleAuth} />;

  const disc = selectedUnit ? DISC[selectedUnit.discipline] || DISC.combined : null;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", background: C.bg }}>

      {/* Sidebar */}
      <div style={{ width: 240, minWidth: 240, borderRight: `1px solid ${C.border}`, background: C.surface, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100dvh", overflowY: "auto" }}>
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 4 }}>Feynman ·</div>
          <div style={{ fontFamily: C.serif, fontSize: 24, lineHeight: 1, letterSpacing: "-0.01em", color: C.text }}>Science<em style={{ fontStyle: "italic", color: C.grn }}>Kit</em></div>
        </div>

        {/* Curriculum tree */}
        <div style={{ flex: 1, padding: "10px 0" }}>
          {groups.map(g => {
            const isOpen = openGroups.has(g.id);
            const groupUnits = units[g.id] || [];
            const ksColor = g.key_stage === "ks3" ? C.blu : C.grn;
            return (
              <div key={g.id}>
                <button onClick={() => setOpenGroups(p => { const n = new Set(p); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}
                  style={{ width: "100%", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 10, color: C.dim, transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                  <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.text, flex: 1 }}>{g.label}</span>
                  <span style={{ fontSize: 9, fontFamily: C.mono, padding: "1px 5px", borderRadius: 2, background: `${ksColor}18`, color: ksColor }}>{g.key_stage?.toUpperCase()}</span>
                </button>
                {isOpen && groupUnits.map(u => {
                  const d = DISC[u.discipline] || DISC.combined;
                  const isSelected = selectedUnit?.id === u.id;
                  return (
                    <button key={u.id} onClick={() => selectUnit(u)}
                      style={{ width: "100%", padding: "6px 16px 6px 34px", display: "flex", alignItems: "center", gap: 8, background: isSelected ? `${d.color}0f` : "none", border: "none", cursor: "pointer", textAlign: "left", borderLeft: isSelected ? `2px solid ${d.color}` : "2px solid transparent" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: isSelected ? d.color : C.text, fontWeight: isSelected ? 500 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.title}</span>
                      {u.hours && <span style={{ fontSize: 10, color: C.dim, fontFamily: C.mono }}>{u.hours}h</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Profile */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.bg, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: C.mono, color: C.muted, flexShrink: 0 }}>
            {(profile?.full_name || "?").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.full_name || "Teacher"}</div>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono }}>{profile?.role}</div>
          </div>
          <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 14, padding: 2 }}>⚙</button>
          <button onClick={() => { sk.auth.out(); setUser(null); setProfile(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 12, fontFamily: C.mono, padding: 2 }}>↪</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "28px 32px", maxWidth: 900, minWidth: 0 }}>
        {showSettings && <Settings profile={profile} onClose={() => setShowSettings(false)} onUpdate={p => setProfile(p)} />}

        {!selectedUnit ? (
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 24, height: 1, background: C.dim }} />
              <span>Curriculum overview</span>
            </div>
            <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 56, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
              A shared <em style={{ fontStyle: "italic", color: C.grn }}>base</em> for every lesson.
            </h1>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 36, maxWidth: "52ch", lineHeight: 1.55 }}>
              Browse, copy, edit. Sequenced by year and term — your curriculum, in one place.
            </p>

            {/* Year pills + Subject chips */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 36, flexWrap: "wrap", borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ display: "flex", gap: 0, marginBottom: -1, flexWrap: "wrap" }}>
                {groups.map(g => {
                  const isActive = selectedYearId === g.id;
                  return (
                    <button key={g.id} onClick={() => setSelectedYearId(g.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 22px 14px", fontFamily: C.serif, fontSize: 24, letterSpacing: "-0.01em", color: isActive ? C.text : C.dim, borderBottom: `2px solid ${isActive ? C.text : "transparent"}`, transition: "color .15s" }}>
                      <span>{g.label}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", verticalAlign: "super", marginLeft: 4, color: C.dim }}>{g.key_stage?.toUpperCase()}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, paddingBottom: 12, flexWrap: "wrap" }}>
                {[
                  { id: "all", label: "All", color: null },
                  { id: "biology", label: "Biology", color: DISC.biology.color },
                  { id: "chemistry", label: "Chemistry", color: DISC.chemistry.color },
                  { id: "physics", label: "Physics", color: DISC.physics.color },
                ].map(s => {
                  const isActive = subjectFilter === s.id;
                  return (
                    <button key={s.id} onClick={() => setSubjectFilter(s.id)}
                      style={{ background: isActive ? C.accent : "transparent", color: isActive ? C.accentFg : C.dim, border: `1px solid ${isActive ? C.accent : C.rule}`, cursor: "pointer", padding: "6px 14px", fontFamily: C.mono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: 999, display: "flex", alignItems: "center", gap: 6, transition: "all .15s" }}>
                      {s.color && <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, display: "inline-block" }} />}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtered units for selected year */}
            {(() => {
              const year = groups.find(g => g.id === selectedYearId);
              if (!year) return null;
              const yearUnits = (units[year.id] || []).filter(u =>
                subjectFilter === "all" || u.discipline === subjectFilter
              );
              const byTerm = {};
              yearUnits.forEach(u => {
                const t = u.term || "untermed";
                if (!byTerm[t]) byTerm[t] = [];
                byTerm[t].push(u);
              });
              const termKeys = Object.keys(byTerm).sort((a, b) => (TERM_ORDER[a] ?? 99) - (TERM_ORDER[b] ?? 99));

              if (yearUnits.length === 0) {
                return (
                  <div style={{ padding: "60px 0", textAlign: "center", color: C.dim, fontFamily: C.mono, fontSize: 12, letterSpacing: "0.06em" }}>
                    No {subjectFilter !== "all" ? DISC[subjectFilter]?.label.toLowerCase() + " " : ""}units for {year.label}.
                  </div>
                );
              }

              return termKeys.map(t => (
                <div key={t} style={{ marginBottom: 36 }}>
                  <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.dim, padding: "0 0 14px", display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span style={{ width: 24, height: 1, background: C.ruleStrong, alignSelf: "center" }} />
                    <span>{t === "untermed" ? "Sequence" : t}</span>
                    <span style={{ flex: 1, height: 1, background: C.rule, alignSelf: "center" }} />
                    <span style={{ color: C.faint }}>{byTerm[t].length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 1, background: C.rule, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden" }}>
                    {byTerm[t].map(u => {
                      const d = DISC[u.discipline] || DISC.combined;
                      const termCap = u.term ? u.term.charAt(0).toUpperCase() + u.term.slice(1) : "";
                      return (
                        <button key={u.id} onClick={() => selectUnit(u)}
                          style={{ padding: "22px 22px 20px 26px", background: C.surface, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background .15s", position: "relative", minHeight: 158, display: "flex", flexDirection: "column", gap: 12 }}
                          onMouseEnter={e => { e.currentTarget.style.background = d.bg; }}
                          onMouseLeave={e => { e.currentTarget.style.background = C.surface; }}>
                          <span style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: d.color }} />
                          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.18em", color: d.color, fontWeight: 600, textTransform: "uppercase" }}>
                            {d.label}{termCap ? ` · ${termCap}` : ""}
                          </div>
                          <div style={{ fontFamily: C.serif, fontSize: 26, lineHeight: 1.05, letterSpacing: "-0.01em", color: C.text }}>{u.title}</div>
                          <div style={{ display: "flex", gap: 14, marginTop: "auto", paddingTop: 12, fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.06em", borderTop: `1px dashed ${C.rule}` }}>
                            {u.hours && <span><strong style={{ color: C.text, fontWeight: 500 }}>{u.hours}</strong> hrs</span>}
                            {u.year_group && <span>{u.year_group}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : selectedLesson ? (
          <LessonView lesson={selectedLesson} unit={selectedUnit} profile={profile} onBack={() => setSelectedLesson(null)} />
        ) : (
          <UnitView unit={selectedUnit} profile={profile} onSelectLesson={l => setSelectedLesson(l)} onBack={() => setSelectedUnit(null)} />
        )}
      </div>
    </div>
  );
}
