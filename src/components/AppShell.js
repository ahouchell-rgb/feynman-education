"use client";
import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/AuthGate";
import { VisualiserOverlay } from "@/components/VisualiserOverlay";
import { C } from "@/lib/theme";

export function AppShell({ children }) {
  const [showVis, setShowVis] = useState(false);

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
