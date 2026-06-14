"use client";
import { C } from "@/lib/theme";
import { SHORTCUTS } from "./constants";

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "22px 26px", maxWidth: 640, width: "100%", boxShadow: "0 12px 48px rgba(0,0,0,0.3)", fontFamily: C.sans }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: C.serif, fontSize: 22, color: C.text }}>Keyboard shortcuts</div>
          <button onClick={onClose} style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Esc</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "18px 28px" }}>
          {SHORTCUTS.map(([group, rows]) => (
            <div key={group}>
              <div style={{ fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: C.accent, marginBottom: 8 }}>{group}</div>
              {rows.map(([label, keys]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: C.text, padding: "3px 0" }}>
                  <span style={{ color: C.muted }}>{label}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, whiteSpace: "nowrap" }}>{keys}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
