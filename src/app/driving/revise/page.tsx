"use client";
import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { Shell, TopBar, PageTitle, card } from "@/components/driving/ui";
import { SignGlyph } from "@/components/driving/SignGlyph";
import { NOTES } from "@/lib/driving/notes";
import { SIGNS, SIGN_KIND_LABEL } from "@/lib/driving/signs";
import type { RoadSign } from "@/lib/driving/types";
import { CATEGORIES } from "@/lib/driving/categories";
import { QUESTIONS_BY_CATEGORY } from "@/lib/driving/questions";
import { shuffle } from "@/lib/driving/mock";

type Tab = "notes" | "signs" | "cards";

export default function RevisePage() {
  const [tab, setTab] = useState<Tab>("notes");
  return (
    <Shell>
      <TopBar active="/driving/revise" />
      <PageTitle
        kicker="Revise"
        title="Revision hub"
        sub="Go over the content as many times as you like. Read the key facts, learn every road sign, and flip through flashcards by topic."
      />
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        {([["notes", "Key facts"], ["signs", "Road signs"], ["cards", "Flashcards"]] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              fontFamily: C.mono,
              fontSize: 13,
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer",
              border: `1px solid ${tab === k ? C.accent : C.border}`,
              background: tab === k ? C.accent : "transparent",
              color: tab === k ? C.accentFg : C.muted,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "notes" && <Notes />}
      {tab === "signs" && <SignsGallery />}
      {tab === "cards" && <Flashcards />}
    </Shell>
  );
}

function Notes() {
  const [open, setOpen] = useState<string | null>(NOTES[0].id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {NOTES.map((n) => {
        const isOpen = open === n.id;
        return (
          <div key={n.id} style={{ ...card, overflow: "hidden" }}>
            <button
              onClick={() => setOpen(isOpen ? null : n.id)}
              style={{ width: "100%", textAlign: "left", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              aria-expanded={isOpen}
            >
              <span style={{ fontFamily: C.serif, fontSize: 21 }}>{n.title}</span>
              <span style={{ color: C.dim, fontSize: 18 }}>{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <ul style={{ listStyle: "none", padding: "0 20px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                {n.points.map((p, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5, color: C.text }}>
                    <span style={{ color: C.grn, flexShrink: 0 }}>›</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SignsGallery() {
  const [sel, setSel] = useState<RoadSign | null>(null);
  const groups = useMemo(() => {
    const m: Record<string, RoadSign[]> = {};
    for (const s of SIGNS) (m[s.kind] ||= []).push(s);
    return m;
  }, []);
  return (
    <div>
      {Object.entries(groups).map(([kind, list]) => (
        <div key={kind} style={{ marginBottom: 26 }}>
          <h3 style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, marginBottom: 12 }}>
            {SIGN_KIND_LABEL[kind as RoadSign["kind"]]} signs
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {list.map((s) => (
              <button
                key={s.id}
                onClick={() => setSel(s)}
                style={{ ...card, padding: "16px 12px", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}
              >
                <SignGlyph sign={s} size={72} />
                <span style={{ fontSize: 12, color: C.text, lineHeight: 1.3 }}>{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {sel && (
        <div onClick={() => setSel(null)} style={modalBg}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, padding: "26px 28px", maxWidth: 380, textAlign: "center" }}>
            <SignGlyph sign={sel} size={120} />
            <div style={{ fontFamily: C.serif, fontSize: 24, margin: "14px 0 6px" }}>{sel.name}</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim, marginBottom: 10 }}>
              {SIGN_KIND_LABEL[sel.kind]}
            </div>
            <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.5 }}>{sel.meaning}</p>
            <button onClick={() => setSel(null)} style={{ marginTop: 16, padding: "9px 20px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontFamily: C.mono, fontSize: 13, cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Flashcards() {
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const cards = useMemo(() => shuffle(QUESTIONS_BY_CATEGORY[cat] ?? []), [cat]);
  const card0 = cards[i];

  const go = (d: number) => {
    setFlipped(false);
    setI((v) => (v + d + cards.length) % cards.length);
  };

  return (
    <div>
      <select
        value={cat}
        onChange={(e) => { setCat(e.target.value as any); setI(0); setFlipped(false); }}
        style={{ fontFamily: C.mono, fontSize: 13, padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, marginBottom: 16 }}
      >
        {CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>

      {card0 && (
        <div
          onClick={() => setFlipped((f) => !f)}
          style={{ ...card, minHeight: 220, padding: "28px 26px", display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer", textAlign: "center" }}
        >
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginBottom: 12 }}>
            Card {i + 1} of {cards.length} · {flipped ? "Answer" : "Question — tap to flip"}
          </div>
          {!flipped ? (
            <div style={{ fontFamily: C.serif, fontSize: 24, lineHeight: 1.25 }}>{card0.question}</div>
          ) : (
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, color: C.grn, marginBottom: 10 }}>
                {card0.correct.map((ci) => card0.options[ci]).join("  ·  ")}
              </div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{card0.explanation}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button onClick={() => go(-1)} style={navBtn}>← Previous</button>
        <button onClick={() => setFlipped((f) => !f)} style={navBtn}>{flipped ? "Show question" : "Show answer"}</button>
        <button onClick={() => go(1)} style={navBtn}>Next →</button>
      </div>
    </div>
  );
}

const navBtn = {
  fontFamily: C.mono,
  fontSize: 13,
  padding: "9px 16px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  cursor: "pointer",
} as const;

const modalBg = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(20,18,14,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 50,
};
