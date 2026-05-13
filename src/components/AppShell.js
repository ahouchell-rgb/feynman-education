"use client";
import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/AuthGate";
import { C } from "@/lib/theme";

export function AppShell({ children }) {
  return (
    <AuthGate>
      <div style={{ minHeight: "100dvh", display: "flex", background: C.bg }}>
        <Sidebar />
        <div style={{ flex: 1, padding: "28px 32px", maxWidth: 900, minWidth: 0 }}>
          {children}
        </div>
      </div>
    </AuthGate>
  );
}
