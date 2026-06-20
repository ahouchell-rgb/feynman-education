"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { sk } from "@/lib/sk";
import { guestFind } from "@/lib/guestDecks";
import { StaticSlide, VW, VH, revealCount } from "@/components/SlideStage";

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const pickBtn = { padding: "10px 22px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#1a1714", border: "none", borderRadius: 8, cursor: "pointer" };
const pickGhost = { padding: "10px 18px", fontSize: 14, color: "#555", background: "#fff", border: "1px solid #ccc", borderRadius: 8, cursor: "pointer" };

export default function PresentPage() {
  const { id } = useParams();
  const router = useRouter();
  const [deck, setDeck] = useState(null);
  const [err, setErr] = useState("");

  const [i, setI] = useState(0);          // slide index
  const [step, setStep] = useState(0);    // reveals shown on current slide
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [blackout, setBlackout] = useState("");   // "" | "black" | "white"
  const [grid, setGrid] = useState(false);
  const [presenter, setPresenter] = useState(false);
  const [pen, setPen] = useState(false);          // "any pointer draws" mode (laptop mouse/trackpad annotation)
  const [penDraw, setPenDraw] = useState(true);   // Apple Pencil inks live without toggling a mode
  const [penColor, setPenColor] = useState("#e23b2e");
  const [penWidth, setPenWidth] = useState(5);
  const [highlight, setHighlight] = useState(false); // highlighter: translucent + wide
  const [strokes, setStrokes] = useState([]);     // per-slide freehand annotations: {color,width,opacity,pts}
  const [touchCapable, setTouchCapable] = useState(false); // iPad / touchscreen → show on-screen ink controls
  const [penSeen, setPenSeen] = useState(false);  // an Apple Pencil / stylus has been used
  const drawingId = useRef(null);                 // pointerId of the in-progress ink stroke (palm rejection)
  const navStart = useRef(null);                  // a non-drawing pointer, for tap-to-advance
  const [picker, setPicker] = useState(false);    // random name picker
  const [editNames, setEditNames] = useState(false);
  const [names, setNames] = useState([]);
  const [picked, setPicked] = useState("");

  // timer
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    (async () => {
      const local = guestFind(id);
      if (local) { setDeck(local); return; }
      try { setDeck(await sk.q("decks", { params: { id: `eq.${id}`, select: "*" }, single: true })); }
      catch (e) { setErr(e.message || "Could not load deck"); }
    })();
  }, [id]);

  // Start from the slide passed in ?start= (e.g. "Present from current slide"),
  // applied once the deck is known so we can clamp to a valid index.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!deck || startedRef.current) return;
    startedRef.current = true;
    const raw = new URLSearchParams(window.location.search).get("start");
    const n = raw != null ? parseInt(raw, 10) : 0;
    if (Number.isFinite(n) && n > 0) { setI(Math.min(n, (deck.slides?.length || 1) - 1)); setStep(0); }
  }, [deck]);

  useEffect(() => {
    const f = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    f(); window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250);
    return () => clearInterval(t);
  }, []);

  // clear annotations when the slide changes
  useEffect(() => { setStrokes([]); }, [i]);

  // Detect a touch / pen device (iPad, Surface, touchscreen). On a tablet there's
  // no keyboard for the P/C/arrow shortcuts, so we surface on-screen ink controls.
  useEffect(() => {
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
    const touch = typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 0;
    setTouchCapable(Boolean(coarse || touch));
  }, []);

  // Enter real browser fullscreen on the teacher's first interaction. It must be
  // gesture-bound (navigating here from the "Present" click doesn't count), so we
  // arm a one-shot on the first click/keypress rather than calling it on mount.
  useEffect(() => {
    const go = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
    };
    window.addEventListener("pointerdown", go);
    window.addEventListener("keydown", go);
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  }, []);

  // class list for the random name picker (saved in this browser)
  useEffect(() => { try { setNames(JSON.parse(localStorage.getItem("sk_class_names")) || []); } catch {} }, []);
  const saveNames = (text) => {
    const arr = text.split("\n").map((s) => s.trim()).filter(Boolean);
    setNames(arr);
    try { localStorage.setItem("sk_class_names", JSON.stringify(arr)); } catch {}
  };
  const spin = () => { if (!names.length) { setEditNames(true); return; } setPicked(names[Math.floor(Math.random() * names.length)]); };

  const slides = deck?.slides || [];
  const slide = slides[i];
  const totalReveal = revealCount(slide);

  const advance = () => {
    if (blackout) { setBlackout(""); return; }
    if (step < totalReveal) { setStep((s) => s + 1); return; }
    if (i < slides.length - 1) { setI(i + 1); setStep(0); }
  };
  const back = () => {
    if (blackout) { setBlackout(""); return; }
    if (step > 0) { setStep((s) => s - 1); return; }
    if (i > 0) { const ni = i - 1; setI(ni); setStep(revealCount(slides[ni])); }
  };
  const jump = (n) => { setI(n); setStep(0); setGrid(false); };

  // keyboard — re-bound each render so it sees current state
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key;
      // Don't hijack keys while the teacher is typing in a field (the cold-call
      // "Edit class" textarea): otherwise Space/Enter respin and "n" closes the
      // overlay, so names with spaces or on new lines can't be entered.
      const t = e.target;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      // when an overlay owns the keyboard, handle it there and stop
      if (picker) {
        if (k === "Escape" || k === "n" || k === "N") setPicker(false);
        else if (k === " " || k === "Enter") { e.preventDefault(); spin(); }
        return;
      }
      if (grid) { if (k === "Escape" || k === "g" || k === "G") setGrid(false); return; }

      if (k === "ArrowRight" || k === " " || k === "PageDown") { e.preventDefault(); advance(); }
      else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); back(); }
      else if (k === "Escape") {
        if (blackout) setBlackout("");
        else if (pen) setPen(false);
        else { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); router.push("/slides"); }
      }
      else if (k === "b" || k === "B") setBlackout((v) => (v === "black" ? "" : "black"));
      else if (k === "w" || k === "W") setBlackout((v) => (v === "white" ? "" : "white"));
      else if (k === "g" || k === "G") setGrid(true);
      else if (k === "s" || k === "S") setPresenter((v) => !v);
      else if (k === "p" || k === "P") setPen((v) => !v);
      else if (k === "c" || k === "C") setStrokes([]);
      else if (k === "u" || k === "U" || ((e.metaKey || e.ctrlKey) && k === "z")) { e.preventDefault(); setStrokes((s) => s.slice(0, -1)); }
      else if (k === "n" || k === "N") { setPicker(true); setTimeout(spin, 0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (err) return <Center>{err}</Center>;
  if (!deck) return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
  if (!slide) return <Center>This deck has no slides.</Center>;

  // sizing — leave room for the presenter panel when it's open
  const areaW = size.w - (presenter ? 380 : 0);
  const width = Math.max(0, Math.min(areaW, size.h * (VW / VH)));
  const height = width * (VH / VW);
  const scale = width / VW;

  // ── Live inking (draw in virtual 960×540 coords) ─────────────────────────
  // Route by pointer type: an Apple Pencil always draws; a finger / mouse tap
  // still navigates. So on an iPad the teacher annotates with the pencil and
  // advances with a finger — no mode switch. The `pen` toggle (P key / ✎ button)
  // additionally lets a mouse / finger draw, for laptop annotation.
  const inkInteractive = pen || (penDraw && (touchCapable || penSeen));
  const shouldDraw = (e) => (e.pointerType === "pen" ? (penDraw || pen) : pen);
  const newStroke = () => (highlight
    ? { color: "#ffe14d", width: 22, opacity: 0.35 }
    : { color: penColor, width: penWidth, opacity: 1 });

  const penPoint = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / scale), Math.round((e.clientY - r.top) / scale)];
  };
  const onDown = (e) => {
    if (e.pointerType === "pen") setPenSeen(true);
    // palm rejection: once a pencil stroke is in progress, ignore stray touches
    if (drawingId.current != null && e.pointerType !== "pen") return;
    if (shouldDraw(e)) {
      e.stopPropagation();
      drawingId.current = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const st = newStroke();
      setStrokes((s) => [...s, { ...st, pts: [penPoint(e)] }]);
    } else {
      navStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    }
  };
  const onMove = (e) => {
    if (drawingId.current !== e.pointerId) return;
    const p = penPoint(e);
    setStrokes((s) => { if (!s.length) return s; const last = s[s.length - 1]; return [...s.slice(0, -1), { ...last, pts: [...last.pts, p] }]; });
  };
  const onUp = (e) => {
    if (drawingId.current === e.pointerId) { drawingId.current = null; return; }
    const ns = navStart.current;
    if (ns && ns.id === e.pointerId) {
      navStart.current = null;
      if (Math.hypot(e.clientX - ns.x, e.clientY - ns.y) < 12) {  // a tap, not a drag
        const r = e.currentTarget.getBoundingClientRect();
        ((e.clientX - r.left) / r.width < 0.28 ? back : advance)();   // tap left edge = back
      }
    }
  };

  return (
    <div onClick={() => { if (!pen) advance(); }}
      style={{ position: "fixed", inset: 0, background: "#000", display: "flex", overflow: "hidden", userSelect: "none" }}>
      {/* stage */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width, height }}>
          <StaticSlide key={i} slide={slide} width={width} reveal={step} live
            master={deck?.master} index={i} total={slides.length} title={deck?.title} />
          <svg viewBox={`0 0 ${VW} ${VH}`} width={width} height={height}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={inkInteractive ? onDown : undefined}
            onPointerMove={inkInteractive ? onMove : undefined}
            onPointerUp={inkInteractive ? onUp : undefined}
            onPointerCancel={inkInteractive ? onUp : undefined}
            style={{ position: "absolute", top: 0, left: 0, touchAction: "none",
                     pointerEvents: inkInteractive ? "auto" : "none", cursor: pen ? "crosshair" : "default" }}>
            {strokes.map((st, idx) => (
              <polyline key={idx} points={st.pts.map((p) => p.join(",")).join(" ")}
                fill="none" stroke={st.color} strokeOpacity={st.opacity ?? 1}
                strokeWidth={st.width || 5} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </svg>
        </div>
      </div>

      {/* presenter panel */}
      {presenter && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ width: 380, flexShrink: 0, background: "#141414", borderLeft: "1px solid #2a2a2a",
                   color: "#e8e8e8", padding: 20, display: "flex", flexDirection: "column", gap: 16, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontFamily: "monospace", fontSize: 34, fontWeight: 600, letterSpacing: "0.02em" }}>{fmt(elapsed)}</div>
            <button onClick={() => { startRef.current = Date.now(); setElapsed(0); }}
              style={{ fontSize: 11, color: "#aaa", background: "none", border: "1px solid #333", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>reset</button>
            <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 12, color: "#888" }}>slide {i + 1}/{slides.length}{totalReveal ? ` · reveal ${step}/${totalReveal}` : ""}</span>
          </div>

          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#777", marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: slide.notes ? "#e8e8e8" : "#666", whiteSpace: "pre-wrap" }}>
              {slide.notes || "No notes for this slide."}
            </div>
          </div>

          <div style={{ marginTop: "auto" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#777", marginBottom: 6 }}>Next</div>
            {slides[i + 1]
              ? <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #2a2a2a", lineHeight: 0 }}><StaticSlide slide={slides[i + 1]} width={336} master={deck?.master} index={i + 1} total={slides.length} title={deck?.title} /></div>
              : <div style={{ fontSize: 13, color: "#666" }}>End of deck</div>}
          </div>
        </div>
      )}

      {/* black / white screen */}
      {blackout && (
        <div onClick={(e) => { e.stopPropagation(); setBlackout(""); }}
          style={{ position: "fixed", inset: 0, background: blackout === "white" ? "#fff" : "#000", cursor: "pointer" }} />
      )}

      {/* jump-to-slide grid */}
      {grid && (
        <div onClick={(e) => { e.stopPropagation(); setGrid(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", padding: "5vh 5vw", overflowY: "auto", zIndex: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
            {slides.map((s, n) => (
              <button key={s.id || n} onClick={(e) => { e.stopPropagation(); jump(n); }}
                style={{ position: "relative", padding: 0, borderRadius: 6, overflow: "hidden", cursor: "pointer", lineHeight: 0,
                         border: `2px solid ${n === i ? "#fff" : "transparent"}` }}>
                <StaticSlide slide={s} width={200} master={deck?.master} index={n} total={slides.length} title={deck?.title} />
                <span style={{ position: "absolute", bottom: 4, left: 6, fontFamily: "monospace", fontSize: 11, color: "#fff", textShadow: "0 1px 3px #000" }}>{n + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* random name picker */}
      {picker && (
        <div onClick={(e) => { e.stopPropagation(); setPicker(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 25 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: "40px 48px", minWidth: 420, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
            {editNames ? (
              <>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>One name per line</div>
                <textarea defaultValue={names.join("\n")} rows={10} onChange={(e) => saveNames(e.target.value)}
                  style={{ width: 360, padding: 10, border: "1px solid #ccc", borderRadius: 8, fontFamily: "system-ui", fontSize: 14, lineHeight: 1.4 }} />
                <div style={{ marginTop: 14 }}>
                  <button onClick={() => setEditNames(false)} style={pickBtn}>Done</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#999", marginBottom: 14 }}>Cold call</div>
                <div style={{ fontSize: 64, fontWeight: 700, color: "#1a1714", minHeight: 84, display: "flex", alignItems: "center", justifyContent: "center" }}>{picked || "—"}</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                  <button onClick={spin} style={pickBtn}>{picked ? "Again" : "Pick"}</button>
                  <button onClick={() => setEditNames(true)} style={pickGhost}>Edit class ({names.length})</button>
                </div>
                <div style={{ marginTop: 14, fontSize: 11, color: "#aaa" }}>Space to re-pick · Esc to close</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* on-screen ink + nav controls — shown on touch / pen devices (iPad), where
          there's no keyboard, and whenever a draw mode is active. */}
      {(touchCapable || penSeen || pen) && (
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", bottom: 14, left: "50%", transform: "translateX(-50%)", zIndex: 30,
                   display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "center", gap: 7,
                   padding: "8px 12px", background: "rgba(20,20,20,0.88)", border: "1px solid #2f2f2f",
                   borderRadius: 16, backdropFilter: "blur(6px)" }}>
          <TBtn onClick={back} title="Previous slide">◀</TBtn>
          <TBtn onClick={advance} title="Next slide">▶</TBtn>
          <Sep />
          <TBtn onClick={() => setPenDraw((v) => !v)} active={penDraw} title="Pencil ink on/off">✎</TBtn>
          {[["#e23b2e", "Red"], ["#1a1714", "Black"], ["#2e6fd6", "Blue"], ["#2f9e44", "Green"]].map(([c, label]) => (
            <Swatch key={c} color={c} title={label} active={!highlight && penColor === c}
              onClick={() => { setHighlight(false); setPenColor(c); if (!penDraw) setPenDraw(true); }} />
          ))}
          <Swatch color="#ffe14d" hl title="Highlighter" active={highlight}
            onClick={() => { setHighlight((v) => !v); if (!penDraw) setPenDraw(true); }} />
          <TBtn onClick={() => setPenWidth((w) => (w >= 11 ? 3 : w + 4))} title="Pen width">
            <span style={{ display: "inline-block", width: Math.min(penWidth + 3, 16), height: Math.min(penWidth + 3, 16), borderRadius: "50%", background: "#eee" }} />
          </TBtn>
          <Sep />
          <TBtn onClick={() => setStrokes((s) => s.slice(0, -1))} title="Undo">↶</TBtn>
          <TBtn onClick={() => setStrokes([])} title="Clear annotations">✕</TBtn>
          <TBtn onClick={() => setBlackout((v) => (v === "black" ? "" : "black"))} active={blackout === "black"} title="Blank screen">⬛</TBtn>
          <Sep />
          <TBtn onClick={() => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); router.push("/slides"); }} title="Exit">⤬</TBtn>
        </div>
      )}

      {/* status / hint bar */}
      <div style={{ position: "fixed", bottom: 12, right: 16, fontFamily: "monospace", fontSize: 12, color: "#777" }}>
        {i + 1} / {slides.length}{(pen || (penDraw && (touchCapable || penSeen))) ? " · ✎" : ""}
      </div>
      {!touchCapable && (
      <div style={{ position: "fixed", bottom: 12, left: 16, fontFamily: "monospace", fontSize: 11, color: "#555" }}>
        ← → move · S notes · G grid · B/W blank · P pen · U undo · C clear · N names · Esc exit
      </div>
      )}
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", color: "#bbb", display: "flex",
                  alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 13 }}>{children}</div>
  );
}

// On-screen present-mode controls (touch / pen devices have no keyboard).
function TBtn({ onClick, children, active = false, title = "" }) {
  return (
    <button onClick={onClick} title={title}
      style={{ minWidth: 42, height: 42, padding: "0 10px", fontSize: 18, lineHeight: 1,
               color: active ? "#1a1714" : "#e8e8e8", background: active ? "#ffd166" : "#242424",
               border: "1px solid #3a3a3a", borderRadius: 11, cursor: "pointer",
               display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}
function Swatch({ color, active = false, onClick, hl = false, title = "" }) {
  return (
    <button onClick={onClick} title={title || color} aria-label={title || color}
      style={{ width: 30, height: 30, borderRadius: hl ? 7 : "50%", background: color,
               border: active ? "3px solid #fff" : "2px solid #666", cursor: "pointer", padding: 0 }} />
  );
}
function Sep() { return <span style={{ width: 1, height: 26, background: "#3a3a3a", margin: "0 3px" }} />; }
