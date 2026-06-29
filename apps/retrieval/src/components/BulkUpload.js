"use client";
import { useState } from "react";
import { SUPA_KEY, SUPA_URL, sb } from "../lib/supabase";
import { C } from "../lib/theme";
import { Btn, Card } from "./ui";

export function BulkUpload({ cls, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState([]); // [{display_name, email}]
  const [parseErr, setParseErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // [{display_name, email, status, password?, error?}]

  const parseCSV = (text) => {
    setParseErr(""); setResults(null);
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { setParsed([]); return; }
    // Skip header row if it looks like a header
    const first = lines[0].toLowerCase();
    const start = (first.includes("name") || first.includes("email")) ? 1 : 0;
    const rows = [];
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(",").map(p => p.trim().replace(/^["']|["']$/g, ""));
      if (parts.length < 2) { setParseErr(`Row ${i + 1}: need at least 2 columns (name, email)`); setParsed([]); return; }
      const [display_name, email] = parts;
      if (!display_name || !email) { setParseErr(`Row ${i + 1}: missing name or email`); setParsed([]); return; }
      if (!email.includes("@")) { setParseErr(`Row ${i + 1}: "${email}" doesn't look like an email`); setParsed([]); return; }
      rows.push({ display_name, email: email.toLowerCase() });
    }
    if (rows.length > 60) { setParseErr("Max 60 students per upload"); setParsed([]); return; }
    setParsed(rows);
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = e => { const text = e.target.result; setRaw(text); parseCSV(text); };
    reader.readAsText(file);
  };

  const upload = async () => {
    if (!parsed.length || busy) return;
    setBusy(true); setResults(null);
    try {
      const jwt = sb.auth.getToken();
      const r = await fetch(`${SUPA_URL}/functions/v1/manage-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Authorization: `Bearer ${jwt || SUPA_KEY}` },
        body: JSON.stringify({ action: "bulk_create", class_id: cls.id, students: parsed }),
      });
      const d = await r.json();
      if (d.results) {
        setResults(d.results);
        const created = d.results.filter(r => r.status === "created");
        if (created.length) { downloadCredentials(created); onRefresh(); }
      } else {
        setParseErr(d.error || "Upload failed");
      }
    } catch (e) { setParseErr(e.message); }
    setBusy(false);
  };

  const downloadCredentials = (rows) => {
    const header = "Name,Email,Password,Login URL";
    const loginUrl = window.location.origin;
    const lines = rows.map(r => `"${r.display_name}","${r.email}","${r.password}","${loginUrl}"`);
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${cls.name.replace(/\//g, "-")}_login_credentials.csv`;
    a.click();
  };

  const downloadTemplate = () => {
    const csv = "display_name,email\nJohn Smith,john.smith@school.org.uk\nJane Doe,jane.doe@school.org.uk";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "student_import_template.csv";
    a.click();
  };

  return (
    <Card style={{ padding: 14, marginBottom: 10 }}>
      <button onClick={() => { setOpen(o => !o); setResults(null); setParseErr(""); setParsed([]); setRaw(""); }}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "inherit" }}>
        <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>Import students from CSV</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.dim }}>Bulk create accounts</span>
          <span style={{ color: C.dim, fontSize: 12, transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Instructions */}
          <div style={{ padding: "10px 12px", borderRadius: 8, background: C.card2, marginBottom: 12, fontSize: 12, color: C.mid, lineHeight: 1.6 }}>
            Upload a CSV with two columns: <span style={{ color: C.txt, fontFamily: "monospace" }}>display_name, email</span>. One student per row. Passwords are auto-generated — a credentials sheet downloads automatically so you can hand out login slips.
            <button onClick={downloadTemplate} style={{ display: "block", marginTop: 6, background: "none", border: "none", color: C.pri, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0, textDecoration: "underline" }}>
              Download template CSV
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => document.getElementById("csv-file-input").click()}
            style={{ border: `1px dashed ${C.bdr}`, borderRadius: 8, padding: "20px 16px", textAlign: "center", cursor: "pointer", marginBottom: 10, background: C.card2 }}>
            <div style={{ marginBottom: 6, display: "flex", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z" /></svg></div>
            <div style={{ fontSize: 13, color: C.mid }}>Drop CSV here or click to browse</div>
            <input id="csv-file-input" type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
          </div>

          {/* Or paste */}
          <textarea
            value={raw}
            onChange={e => { setRaw(e.target.value); parseCSV(e.target.value); }}
            placeholder={"Or paste CSV here...\ndisplay_name,email\nJohn Smith,john@school.org.uk"}
            rows={4}
            style={{ width: "100%", padding: "10px 12px", background: C.card2, border: `1px solid ${C.bdr}`, borderRadius: 8, color: C.txt, fontSize: 12, fontFamily: "monospace", resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 10 }}
          />

          {/* Parse error */}
          {parseErr && <div style={{ padding: "8px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, marginBottom: 10 }}>⚠ {parseErr}</div>}

          {/* Preview */}
          {parsed.length > 0 && !results && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.mid, marginBottom: 6 }}>{parsed.length} student{parsed.length !== 1 ? "s" : ""} ready to import</div>
              <div style={{ maxHeight: 160, overflowY: "auto", borderRadius: 8, border: `1px solid ${C.bdr}` }}>
                {parsed.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 12px", borderBottom: i < parsed.length - 1 ? `1px solid ${C.bdr}` : "none", fontSize: 12 }}>
                    <span style={{ flex: 1, color: C.txt, fontWeight: 500 }}>{s.display_name}</span>
                    <span style={{ color: C.dim }}>{s.email}</span>
                  </div>
                ))}
              </div>
              <Btn onClick={upload} disabled={busy} style={{ width: "100%", marginTop: 10, fontSize: 13, padding: "10px 16px" }}>
                {busy ? "Creating accounts..." : `Create ${parsed.length} accounts →`}
              </Btn>
            </div>
          )}

          {/* Results */}
          {results && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: C.grnS, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.grn }}>{results.filter(r => r.status === "created").length}</div>
                  <div style={{ fontSize: 10, color: C.grn }}>Created</div>
                </div>
                <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: results.filter(r => r.status === "error").length > 0 ? C.redS : C.card2, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: results.filter(r => r.status === "error").length > 0 ? C.red : C.dim }}>{results.filter(r => r.status === "error").length}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>Failed</div>
                </div>
              </div>
              {results.filter(r => r.status === "error").length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {results.filter(r => r.status === "error").map((r, i) => (
                    <div key={i} style={{ padding: "6px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 11, marginBottom: 4 }}>
                      {r.display_name} ({r.email}) — {r.error}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {results.filter(r => r.status === "created").length > 0 && (
                  <Btn v="ghost" onClick={() => downloadCredentials(results.filter(r => r.status === "created"))} style={{ flex: 1, fontSize: 12 }}>
                    ↓ Re-download credentials
                  </Btn>
                )}
                <Btn v="ghost" onClick={() => { setResults(null); setParsed([]); setRaw(""); setParseErr(""); }} style={{ flex: 1, fontSize: 12 }}>
                  Import more
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ─── Lesson Starter Generator ─── */
