"use client";
import { useEffect } from "react";

// Last-resort boundary for errors thrown in the root layout itself. It must
// render its own <html>/<body> and can't depend on the app theme/providers, so
// the styling here is deliberately self-contained and minimal.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#faf7f0", color: "#1a1714" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: "center" }}>
            <h1 style={{ fontSize: 26, margin: "0 0 10px" }}>Something went wrong</h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#6b6256", margin: "0 0 22px" }}>
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            <button onClick={() => reset()} style={{ padding: "10px 20px", borderRadius: 6, border: "none", background: "#1a1714", color: "#fff", fontSize: 14, cursor: "pointer" }}>Reload</button>
          </div>
        </div>
      </body>
    </html>
  );
}
