"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";

// TODO(adam): confirm the retrieval-app URL pattern. Best guess: a deep link
// to a specific topic by id. If the actual route uses a different segment
// (e.g. /t/{id}, /topics/{id}, /quiz/{id}), change RET_APP_TOPIC_URL below.
// Also: retrieval-app must allow this domain to embed it. Set on the
// retrieval-app side: `Content-Security-Policy: frame-ancestors https://*.vercel.app
// https://sciencekit.vercel.app https://localhost:3000` (or whatever the prod
// host is), and DO NOT set `X-Frame-Options: DENY` or `SAMEORIGIN`. Cookies
// used for auth need `SameSite=None; Secure` to flow inside the iframe.
const RET_APP_ORIGIN = "https://retrieval-app.com";
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
