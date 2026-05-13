"use client";
import { C } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";

function ManageContent() {
  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: C.dim }} />
        <span>Manage</span>
      </div>
      <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 44, lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Edit your <em style={{ fontStyle: "italic", color: C.grn }}>classes &amp; timetable</em>.
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 28, maxWidth: "52ch", lineHeight: 1.55 }}>
        Coming in Build 2. For now, re-run /setup to make changes.
      </p>
    </div>
  );
}

export default function ManagePage() {
  return <AppShell><ManageContent /></AppShell>;
}
