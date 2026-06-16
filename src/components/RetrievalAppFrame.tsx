"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";

// The retrieval-app origin is env-driven so prod / preview / local can differ.
// The default below is the CONFIRMED production domain (Vercel project
// "retrieval-app"; retrieval-app.vercel.app 307-redirects here). Override with
// NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN for preview/local.
// STILL A GAP: the topic route segment — this assumes /topic/{id}, which the
// retrieval app doesn't expose yet (build that route to make the embed live).
// The retrieval-app must allow this origin to frame it (frame-ancestors CSP via
// ALLOWED_FRAME_ANCESTORS in its next.config.js) and must NOT send
// X-Frame-Options. Auth cookies inside the iframe need SameSite=None; Secure.
const RET_APP_ORIGIN = process.env.NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN || "https://retrieval-app.com";
const RET_APP_TOPIC_URL = (topicId) => `${RET_APP_ORIGIN}/topic/${encodeURIComponent(topicId)}`;

/**
 * RetrievalAppFrame — inline embed of retrieval-app.com on the lesson page,
 * deep-linked to the topic that's been mapped to this lesson.
 *
 * Renders nothing if the lesson isn't linked to a retrieval topic.
 */
export function RetrievalAppFrame({ mapEntry, height = 540 }) {
  const [fullscreen, setFullscreen] = useState(false);
  if (!mapEntry?.retrieval_topic_id) return null;

  const url = RET_APP_TOPIC_URL(mapEntry.retrieval_topic_id);
  const title = mapEntry.retrieval_topic_name || "Retrieval";

  const frame = (h) => (
    <iframe
      src={url}
      title={`retrieval-app: ${title}`}
      style={{ width: "100%", height: h, border: "none", background: "#fff", display: "block" }}
      // sandbox is intentionally permissive — retrieval-app is a first-party
      // site, so it needs scripts, same-origin, forms, and popups.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );

  return (
    <div style={{ marginBottom: 24 }}>
      {fullscreen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>retrieval. ·</span>
            <span style={{ fontSize: 13, flex: 1, fontFamily: C.serif, fontStyle: "italic" }}>{title}</span>
            <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, textDecoration: "none" }}>Open ↗</a>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setFullscreen(false)}>Close ×</Btn>
          </div>
          <div style={{ flex: 1, background: "#fff" }}>{frame("100%")}</div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, flex: 1 }}>
          Retrieval — <span style={{ fontFamily: C.serif, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: C.text }}>{title}</span>
        </div>
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontFamily: C.mono, color: C.muted, textDecoration: "none", padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 6, marginRight: 6 }}>
          Open ↗
        </a>
        <Btn v="ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setFullscreen(true)}>
          Fullscreen
        </Btn>
      </div>
      <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, background: "#fff" }}>
        {frame(height)}
      </div>
    </div>
  );
}
