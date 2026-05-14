"use client";
import { useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { Btn, Inp } from "@/lib/primitives";

const HEIGHT_PRESETS = [320, 480, 640, 800];
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 1400;

/* ─── Widget editor modal.
   Used for both "add" (no `widget` prop) and "edit" (with `widget`).
   Posts back via `onSave({ title, html, default_height })`. */
export function WidgetEditor({ widget, onSave, onClose, saving }) {
  const [title, setTitle] = useState(widget?.title || "");
  const [html, setHtml] = useState(widget?.html || "");
  const [height, setHeight] = useState(widget?.default_height || 480);
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(widget?.title || "");
    setHtml(widget?.html || "");
    setHeight(widget?.default_height || 480);
    setError("");
  }, [widget]);

  const submit = () => {
    setError("");
    if (!html.trim()) { setError("Paste some HTML."); return; }
    const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, parseInt(height, 10) || 480));
    onSave({
      title: title.trim() || "Widget",
      html,
      default_height: h,
    });
  };

  // Esc to close, Cmd/Ctrl+Enter to save
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    /* eslint-disable-next-line */
  }, [title, html, height]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(26,23,20,0.45)", zIndex: 400,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 10,
        width: "100%", maxWidth: 760, maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              {widget ? "Edit widget" : "New widget"}
            </div>
            <div style={{ fontFamily: C.serif, fontSize: 22, color: C.text, lineHeight: 1.1 }}>
              Paste HTML
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: C.muted, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14, overflow: "auto", flex: 1 }}>
          <div>
            <label style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
              Title
            </label>
            <Inp value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Photosynthesis simulator" />
          </div>

          <div>
            <label style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
              Default height (px)
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {HEIGHT_PRESETS.map(p => (
                <Btn key={p}
                  v={height === p ? "pri" : "soft"}
                  style={{ fontSize: 11, padding: "5px 10px" }}
                  onClick={() => setHeight(p)}>
                  {p}
                </Btn>
              ))}
              <Inp
                type="number" min={MIN_HEIGHT} max={MAX_HEIGHT}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                style={{ width: 100 }}
              />
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 280 }}>
            <label style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: "0.04em", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>HTML</span>
              <span style={{ color: C.dim }}>Sandboxed: scripts run, no cookies / no parent access</span>
            </label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder={'<!doctype html><html>…</html>\n\nor any HTML fragment — Claude-built widgets paste in as-is.'}
              spellCheck={false}
              style={{
                width: "100%", flex: 1, minHeight: 240,
                padding: "12px 14px",
                border: `1px solid ${C.border}`, borderRadius: 6,
                fontFamily: C.mono, fontSize: 12, lineHeight: 1.5,
                background: C.bg, color: C.text, outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          {error && (
            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.red, padding: "8px 10px", background: C.redS, borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 22px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.04em" }}>
            ⌘↵ to save · Esc to close
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
            <Btn onClick={submit} disabled={saving}>{saving ? "Saving…" : (widget ? "Save" : "Add widget")}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
