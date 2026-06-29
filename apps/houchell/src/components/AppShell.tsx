"use client";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { AuthGate } from "@/components/AuthGate";
import { VisualiserOverlay } from "@/components/VisualiserOverlay";
import { SearchOverlay } from "@/components/SearchOverlay";
import { useApplyAccessibilityPrefs } from "@/components/AccessibilityMenu";
import { C } from "@/lib/theme";

export function AppShell({ children }) {
  const [showVis, setShowVis] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  useApplyAccessibilityPrefs();

  // Global triggers: ⌘K / Ctrl-K opens search; ⌘⇧V opens the visualiser. Both
  // also respond to a custom event so any descendant can open them without
  // threading a prop down through the tree.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      // Search works even when a field is focused (it's a deliberate chord).
      if (mod && (e.key === "k" || e.key === "K")) { e.preventDefault(); setShowSearch(true); return; }
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (mod && e.shiftKey && (e.key === "V" || e.key === "v")) {
        e.preventDefault();
        setShowVis(true);
      }
    };
    const onVis = () => setShowVis(true);
    const onSearch = () => setShowSearch(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sk:open-visualiser", onVis);
    window.addEventListener("sk:open-search", onSearch);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sk:open-visualiser", onVis);
      window.removeEventListener("sk:open-search", onSearch);
    };
  }, []);

  return (
    <AuthGate>
      <div style={{ minHeight: "100dvh" }}>
        <TopNav onOpenVisualiser={() => setShowVis(true)} onOpenSearch={() => setShowSearch(true)} />
        <main id="main" tabIndex={-1} style={{ width: "min(1180px, calc(100% - 36px))", margin: "0 auto", padding: "32px 0 64px", minWidth: 0, outline: "none" }}>
          {children}
        </main>
      </div>
      {showVis && <VisualiserOverlay onClose={() => setShowVis(false)} />}
      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
    </AuthGate>
  );
}
