"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { SlideEditor } from "@/components/SlideEditor";
import { guestRead, guestWrite, GUEST_KEY } from "@/lib/guestDecks";

function newSlide() { return { id: "s" + Math.floor(performance.now() * 1000), elements: [] }; }
function nowISO() { return new Date().toISOString(); }

/* Data layer: Supabase when signed in, localStorage when a guest. Same shape
   either way so the UI below doesn't care which is active. */
function makeStore(guest) {
  if (guest) {
    return {
      list: async () => guestRead().slice().sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")),
      create: async (deck) => {
        const d = { id: "d" + Math.floor(performance.now() * 1000), updated_at: nowISO(), ...deck };
        guestWrite([d, ...guestRead()]);
        return d;
      },
      update: async (id, patch) => guestWrite(guestRead().map((x) => (x.id === id ? { ...x, ...patch } : x))),
      remove: async (id) => guestWrite(guestRead().filter((x) => x.id !== id)),
      uploadImage: (file) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);   // data: URL stored inline
        r.onerror = rej;
        r.readAsDataURL(file);
      }),
    };
  }
  return {
    list: async () => sk.q("decks", { params: { select: "*", order: "updated_at.desc" } }),
    create: async (deck) => (await sk.q("decks", { method: "POST", body: deck }))[0],
    update: async (id, patch) => sk.q("decks", { method: "PATCH", params: { id: `eq.${id}` }, body: patch }),
    remove: async (id) => sk.del("decks", { id: `eq.${id}` }),
    uploadImage: async (file, deckId) => {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      return sk.upload(`slides/${deckId}/${Math.floor(performance.now())}-${safe}`, file);
    },
  };
}

function Shell({ guest, children }) {
  return (
    <div style={{ minHeight: "100dvh", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <a href="/" style={{ textDecoration: "none", fontFamily: C.serif, fontSize: 20, color: C.text }}>
          Science<em style={{ fontStyle: "italic", color: C.grn }}>Kit</em>
        </a>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>· Slides</span>
        <span style={{ flex: 1 }} />
        {guest && (
          <a href="/login" style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, textDecoration: "none", border: `1px solid ${C.border}`, padding: "4px 10px", borderRadius: 6 }}>
            guest mode · sign in to save to your account
          </a>
        )}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
}

function SlidesContent() {
  const { user, loading } = useAuth();
  const guest = !loading && !user;
  const store = useMemo(() => makeStore(guest), [guest]);

  const [decks, setDecks] = useState(null);     // null = loading
  const [active, setActive] = useState(null);   // deck currently being edited
  const [save, setSave] = useState("saved");    // saved | saving | error
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);
  const timer = useRef(null);
  const router = useRouter();

  const load = async () => {
    try { setDecks(await store.list()); }
    catch (e) { setErr(e.message); setDecks([]); }
  };
  useEffect(() => { if (!loading) load(); /* eslint-disable-next-line */ }, [loading, guest]);

  const createDeck = async () => {
    try { setActive(await store.create({ title: "Untitled deck", slides: [newSlide()] })); setSave("saved"); }
    catch (e) { setErr(e.message); }
  };

  const openDeck = (d) => { setActive(d); setSave("saved"); };
  const closeDeck = () => { clearTimeout(timer.current); setActive(null); load(); };

  // Debounced persist whenever the editor reports a change.
  const onSlidesChange = (slides) => {
    setActive((a) => ({ ...a, slides }));
    setSave("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await store.update(active.id, { slides, updated_at: nowISO() }); setSave("saved"); }
      catch (e) { setErr(e.message); setSave("error"); }
    }, 600);
  };

  const renameDeck = async (title) => {
    setActive((a) => ({ ...a, title }));
    try { await store.update(active.id, { title }); } catch (e) { setErr(e.message); }
  };

  const exportPptx = async () => {
    setExporting(true);
    try { const { exportDeck } = await import("@/lib/exportPptx"); await exportDeck(active); }
    catch (e) { setErr("Export failed: " + e.message); }
    finally { setExporting(false); }
  };

  const deleteDeck = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this deck?")) return;
    try { await store.remove(id); setDecks((ds) => ds.filter((d) => d.id !== id)); }
    catch (e) { setErr(e.message); }
  };

  if (loading) return <Shell guest={false}><div style={{ color: C.dim, fontFamily: C.mono, fontSize: 13 }}>Loading…</div></Shell>;

  /* ── Editing a single deck ── */
  if (active) {
    return (
      <Shell guest={guest}>
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 116px)", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn v="ghost" onClick={closeDeck}>← Decks</Btn>
            <input value={active.title} onChange={(e) => renameDeck(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: "6px 8px", border: "1px solid transparent", borderRadius: 6,
                       fontFamily: C.serif, fontSize: 24, color: C.text, background: "transparent", outline: "none" }}
              onFocus={(e) => (e.target.style.borderColor = C.border)}
              onBlur={(e) => (e.target.style.borderColor = "transparent")} />
            <span style={{ fontFamily: C.mono, fontSize: 11, color: save === "error" ? C.red : C.dim }}>
              {save === "saving" ? "saving…" : save === "error" ? "save failed" : "saved"}
            </span>
            <Btn v="soft" onClick={exportPptx} disabled={exporting}>{exporting ? "exporting…" : "Export .pptx"}</Btn>
            <Btn onClick={() => router.push(`/slides/${active.id}/present`)}>▶ Present</Btn>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <SlideEditor deck={active} onChange={onSlidesChange}
              onUploadImage={(file) => store.uploadImage(file, active.id)} />
          </div>
        </div>
      </Shell>
    );
  }

  /* ── Deck list ── */
  return (
    <Shell guest={guest}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontFamily: C.serif, fontSize: 36, color: C.text, margin: 0 }}>Slides</h1>
        <Btn onClick={createDeck}>+ New deck</Btn>
      </div>

      {err && <div style={{ color: C.red, fontFamily: C.mono, fontSize: 12, marginBottom: 16 }}>{err}</div>}

      {decks === null ? (
        <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 13 }}>Loading…</div>
      ) : decks.length === 0 ? (
        <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 13 }}>No decks yet. Create your first one.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {decks.map((d) => (
            <button key={d.id} onClick={() => openDeck(d)}
              style={{ textAlign: "left", padding: 0, background: C.surface, border: `1px solid ${C.border}`,
                       borderRadius: 8, cursor: "pointer", overflow: "hidden", fontFamily: "inherit" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}>
              <div style={{ aspectRatio: "16/9", background: "#fff", borderBottom: `1px solid ${C.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 11, fontFamily: C.mono }}>
                {d.slides?.length || 0} slide{(d.slides?.length || 0) === 1 ? "" : "s"}
              </div>
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                <span onClick={(e) => deleteDeck(d.id, e)} title="Delete"
                  style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, padding: "2px 6px", borderRadius: 4 }}>✕</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}

export default function SlidesPage() {
  return <SlidesContent />;
}
