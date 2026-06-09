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
  const [pen, setPen] = useState(false);
  const [strokes, setStrokes] = useState([]);     // per-slide freehand annotations
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
        else router.push("/slides");
      }
      else if (k === "b" || k === "B") setBlackout((v) => (v === "black" ? "" : "black"));
      else if (k === "w" || k === "W") setBlackout((v) => (v === "white" ? "" : "white"));
      else if (k === "g" || k === "G") setGrid(true);
      else if (k === "s" || k === "S") setPresenter((v) => !v);
      else if (k === "p" || k === "P") setPen((v) => !v);
      else if (k === "c" || k === "C") setStrokes([]);
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

  // pen handlers (draw in virtual 960×540 coords)
  const penPoint = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) / scale), Math.round((e.clientY - r.top) / scale)];
  };
  const penDown = (e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); setStrokes((s) => [...s, { color: "#e23b2e", pts: [penPoint(e)] }]); };
  const penMove = (e) => { if (e.buttons !== 1) return; setStrokes((s) => { if (!s.length) return s; const last = s[s.length - 1]; const np = { ...last, pts: [...last.pts, penPoint(e)] }; return [...s.slice(0, -1), np]; }); };

  return (
    <div onClick={() => { if (!pen) advance(); }}
      style={{ position: "fixed", inset: 0, background: "#000", display: "flex", overflow: "hidden", userSelect: "none" }}>
      {/* stage */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width, height }}>
          <StaticSlide key={i} slide={slide} width={width} reveal={step} live />
          <svg viewBox={`0 0 ${VW} ${VH}`} width={width} height={height}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={pen ? penDown : undefined} onPointerMove={pen ? penMove : undefined}
            style={{ position: "absolute", top: 0, left: 0, touchAction: "none",
                     pointerEvents: pen ? "auto" : "none", cursor: pen ? "crosshair" : "default" }}>
            {strokes.map((st, idx) => (
              <polyline key={idx} points={st.pts.map((p) => p.join(",")).join(" ")}
                fill="none" stroke={st.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
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
              ? <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #2a2a2a", lineHeight: 0 }}><StaticSlide slide={slides[i + 1]} width={336} /></div>
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
                <StaticSlide slide={s} width={200} />
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

      {/* status / hint bar */}
      <div style={{ position: "fixed", bottom: 12, right: 16, fontFamily: "monospace", fontSize: 12, color: "#777" }}>
        {i + 1} / {slides.length}{pen ? " · ✎ pen (C clears)" : ""}
      </div>
      <div style={{ position: "fixed", bottom: 12, left: 16, fontFamily: "monospace", fontSize: 11, color: "#555" }}>
        ← → move · S notes · G grid · B/W blank · P pen · N names · Esc exit
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", color: "#bbb", display: "flex",
                  alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 13 }}>{children}</div>
  );
}
