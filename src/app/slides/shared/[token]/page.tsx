"use client";
// Public, read-only viewer for a shared deck. No auth required to VIEW: the deck
// is loaded by its share_token (gated on is_public via the decks_public_read RLS
// policy) using the anon key. Renders each slide with the same StaticSlide used
// everywhere else — which sanitizes rich text (sanitizeHtml) and sandboxes any
// `html` elements in an iframe — so we don't introduce an XSS hole by rendering
// shared content. A prominent "Make a copy" forks the deck into the visitor's
// account (signing in first if needed).

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { StaticSlide, VW, VH } from "@/components/SlideStage";

// Width-aware wrapper so a slide fills its column and keeps the 16:9 stage ratio.
function SharedSlide({ slide, master, index, total, title }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", aspectRatio: `${VW} / ${VH}`, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", lineHeight: 0 }}>
      {w > 0 && <StaticSlide slide={slide} width={w} master={master} index={index} total={total} title={title} />}
    </div>
  );
}

function SharedContent() {
  const { token } = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [deck, setDeck] = useState(null);  // null = loading
  const [err, setErr] = useState("");
  const [forking, setForking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await sk.q("decks", {
          params: { share_token: `eq.${token}`, is_public: "eq.true", select: "title,slides,theme,master,share_token", limit: "1" },
        });
        const d = Array.isArray(rows) ? rows[0] : rows;
        if (!d) { setErr("This deck isn’t shared, or the link is no longer valid."); setDeck(false); return; }
        setDeck(d);
      } catch (e) { setErr(e?.message || "Could not load this deck."); setDeck(false); }
    })();
  }, [token]);

  const slides = useMemo(() => deck?.slides || [], [deck]);

  // Fork: signed in → clone now and open in the editor. Signed out → send to
  // login with a return path that resumes the fork on the way back.
  const makeCopy = async () => {
    if (!user) {
      const next = `/slides/shared/${token}?fork=1`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setForking(true); setErr("");
    try {
      const r = await fetch("/api/deck/fork", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sk.auth.getToken()}` },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Copy failed");
      router.push(`/slides?deck=${d.deckId}`);
    } catch (e) { setErr("Couldn’t make a copy: " + (e?.message || e)); setForking(false); }
  };

  // Resume a fork after returning from login (?fork=1), once auth has hydrated.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (loading || resumedRef.current || !deck) return;
    const wantsFork = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fork") === "1";
    if (wantsFork && user) { resumedRef.current = true; makeCopy(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, deck]);

  return (
    <div style={{ minHeight: "100dvh", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderBottom: `1px solid ${C.border}`, background: C.surface, position: "sticky", top: 0, zIndex: 10 }}>
        <a href="/" style={{ textDecoration: "none", fontFamily: C.serif, fontSize: 20, color: C.text }}>
          Feyn<em style={{ fontStyle: "italic", color: C.grn }}>man</em>
        </a>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>· Shared deck</span>
        <span style={{ flex: 1 }} />
        {deck && deck !== false && (
          <Btn onClick={makeCopy} disabled={forking} title="Copy this deck into your own account to edit">
            {forking ? "Copying…" : "＋ Make a copy"}
          </Btn>
        )}
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 24px 64px" }}>
        {deck === null ? (
          <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 13 }}>Loading…</div>
        ) : deck === false ? (
          <div style={{ marginTop: 40, textAlign: "center", color: C.muted, fontFamily: C.sans, fontSize: 15 }}>{err || "Not found."}</div>
        ) : (
          <>
            <h1 style={{ fontFamily: C.serif, fontSize: 34, color: C.text, margin: "8px 0 4px" }}>{deck.title}</h1>
            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginBottom: 24 }}>
              {slides.length} slide{slides.length === 1 ? "" : "s"} · read-only · make a copy to edit
            </div>
            {err && <div style={{ color: C.red, fontFamily: C.mono, fontSize: 12, marginBottom: 16 }}>{err}</div>}
            {slides.length === 0 ? (
              <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 13 }}>This deck has no slides.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {slides.map((s, n) => (
                  <SharedSlide key={s.id || n} slide={s} master={deck.master} index={n} total={slides.length} title={deck.title} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SharedDeckPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: C.mono, fontSize: 13, color: C.dim }}>Loading…</div>}>
      <SharedContent />
    </Suspense>
  );
}
