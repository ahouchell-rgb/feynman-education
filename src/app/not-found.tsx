import Link from "next/link";
import { C } from "@/lib/theme";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: C.dim, marginBottom: 10 }}>404</div>
        <h1 style={{ fontFamily: C.serif, fontSize: 30, color: C.text, margin: "0 0 10px" }}>Page not found</h1>
        <p style={{ fontSize: 14, color: C.muted, margin: "0 0 22px" }}>That page doesn’t exist or has moved.</p>
        <Link href="/" style={{ display: "inline-block", padding: "9px 18px", borderRadius: 6, background: C.accent, color: C.accentFg, fontFamily: C.mono, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Back to this week</Link>
      </div>
    </div>
  );
}
