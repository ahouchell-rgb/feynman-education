"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/AuthGate";
import { VisualiserOverlay } from "@/components/VisualiserOverlay";
import { C } from "@/lib/theme";

export function AppShell({ children }) {
  const [showVis, setShowVis] = useState(false);

  // Global trigger: Cmd/Ctrl+Shift+V opens the visualiser.
  // Also listen for a custom event so any descendant can open it without
  // threading a prop down through the tree.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "V" || e.key === "v")) {
        e.preventDefault();
        setShowVis(true);
      }
    };
    const onEvent = () => setShowVis(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sk:open-visualiser", onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sk:open-visualiser", onEvent);
    };
  }, []);

  return (
    <AuthGate>
      <div style={{ minHeight: "100dvh", display: "flex", background: C.bg }}>
        <Sidebar onOpenVisualiser={() => setShowVis(true)} />
        <div style={{ flex: 1, padding: "28px 32px", maxWidth: 900, minWidth: 0 }}>
          {children}
        </div>
      </div>
      {showVis && <VisualiserOverlay onClose={() => setShowVis(false)} />}
    </AuthGate>
  );
}
