"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { sk } from "@/lib/sk";
import { guestFind } from "@/lib/guestDecks";
import { StaticSlide } from "@/components/SlideStage";

/* Print / PDF view of a deck. Teachers reach it from the editor's "Print / PDF"
 * button. Two layouts (one slide per page, or a 2-up handout) and an answers
 * toggle that hides reveal-on-click elements for a worksheet version. Printing
 * to "Save as PDF" gives a shareable file. */
export default function PrintPage() {
  const { id } = useParams();
  const [deck, setDeck] = useState<any>(null);
  const [err, setErr] = useState("");
  const [layout, setLayout] = useState<"full" | "handout">("full");
  const [answers, setAnswers] = useState(true);

  useEffect(() => {
    (async () => {
      const local = guestFind(id as string);
      if (local) { setDeck(local); return; }
      try { setDeck(await sk.q("decks", { params: { id: `eq.${id}`, select: "*" }, single: true })); }
      catch (e: any) { setErr(e.message || "Could not load deck"); }
    })();
  }, [id]);

  if (err) return <div style={{ padding: 40, fontFamily: "monospace", fontSize: 13, color: "#b00" }}>{err}</div>;
  if (!deck) return <div style={{ padding: 40, fontFamily: "monospace", fontSize: 13, color: "#888" }}>Loading…</div>;

  const slides = deck.slides || [];
  const reveal = answers ? Infinity : 0;          // hide reveal-on-click elements for a blank worksheet
  const width = layout === "handout" ? 460 : 980; // 2-up vs one-per-page

  return (
    <div style={{ background: "#fff", minHeight: "100dvh" }}>
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 12mm; } html, body { background: #fff !important; } }`}</style>

      {/* Controls (hidden when printing) */}
      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 20px", borderBottom: "1px solid #e3ddcc", background: "#faf7f0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
        <a href="/slides" style={{ color: "#6b6256", textDecoration: "none", border: "1px solid #d9d2c0", borderRadius: 6, padding: "5px 10px" }}>← Slides</a>
        <strong style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 16, color: "#1a1714" }}>{deck.title}</strong>
        <span style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#6b6256" }}>
          Layout
          <select value={layout} onChange={(e) => setLayout(e.target.value as "full" | "handout")} style={{ fontFamily: "inherit", fontSize: 12, padding: "4px 6px", border: "1px solid #d9d2c0", borderRadius: 6 }}>
            <option value="full">One per page</option>
            <option value="handout">Handout (2-up)</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#6b6256", cursor: "pointer" }}>
          <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} />
          Show answers
        </label>
        <button onClick={() => window.print()} style={{ padding: "7px 16px", border: "none", borderRadius: 6, background: "#1a1714", color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Print / Save PDF</button>
      </div>

      {/* Slides */}
      <div style={{ display: layout === "handout" ? "grid" : "block", gridTemplateColumns: layout === "handout" ? "1fr 1fr" : undefined, gap: layout === "handout" ? 18 : 0, padding: layout === "handout" ? 20 : 0 }}>
        {slides.map((s: any, n: number) => (
          <div key={s.id || n}
            style={{
              breakInside: "avoid",
              ...(layout === "full"
                ? { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: 20, boxSizing: "border-box" as const, breakAfter: n < slides.length - 1 ? "page" : "auto" }
                : {}),
            }}>
            <div style={{ border: "1px solid #d9d2c0", borderRadius: layout === "handout" ? 6 : 4, overflow: "hidden", lineHeight: 0, width }}>
              <StaticSlide slide={s} width={width} reveal={reveal} master={deck.master} index={n} total={slides.length} title={deck.title} />
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#9a9486", marginTop: 6, lineHeight: 1.4, alignSelf: layout === "handout" ? "flex-start" : "center" }}>
              {n + 1} / {slides.length}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
