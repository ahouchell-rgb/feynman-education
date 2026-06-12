"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { SlideEditor } from "@/components/SlideEditor";
import { StaticSlide } from "@/components/SlideStage";
import { guestRead, guestWrite, GUEST_KEY } from "@/lib/guestDecks";

function newSlide() { return { id: "s" + Math.floor(performance.now() * 1000), elements: [] }; }
function nowISO() { return new Date().toISOString(); }

/* A live miniature of a deck's first slide, scaled to fill whatever width the
   card happens to be (the grid stretches columns), so decks are recognisable
   at a glance instead of reading titles. */
function DeckThumb({ deck }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const first = deck.slides?.[0];
  return (
    <div ref={ref} style={{ aspectRatio: "16/9", background: "#fff", borderBottom: `1px solid ${C.border}`, overflow: "hidden", lineHeight: 0 }}>
      {w > 0 && first ? (
        <StaticSlide slide={first} width={w} master={deck.master} index={0} total={deck.slides.length} title={deck.title} />
      ) : (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 11, fontFamily: C.mono }}>
          {deck.slides?.length || 0} slide{(deck.slides?.length || 0) === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

const pickerStyle = { padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 11, background: C.bg, color: C.text, cursor: "pointer", maxWidth: 220 };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 };

/* Data layer: Supabase when signed in, localStorage when a guest. Same shape
   either way so the UI below doesn't care which is active. */
function makeStore(guest, userId) {
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
    // Only my own decks here — Masters and colleagues' shared decks are browsed
    // from each unit page, not the personal list.
    list: async () => sk.q("decks", { params: { owner: `eq.${userId}`, select: "*", order: "updated_at.desc" } }),
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
          Feyn<em style={{ fontStyle: "italic", color: C.grn }}>man</em>
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
  const { user, profile, loading } = useAuth();
  const guest = !loading && !user;
  const author = profile?.role === "admin" || !!profile?.is_lead;
  const store = useMemo(() => makeStore(guest, user?.id), [guest, user?.id]);

  const [decks, setDecks] = useState(null);     // null = loading
  const [active, setActive] = useState(null);   // deck currently being edited
  const [save, setSave] = useState("saved");    // saved | saving | error
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hovId, setHovId] = useState(null);     // card under the cursor
  const [confirmId, setConfirmId] = useState(null); // deck awaiting a 2nd delete click
  const [curSlide, setCurSlide] = useState(0);  // slide selected in the editor rail (for "present from here")
  const [presentOpen, setPresentOpen] = useState(false); // "▶ Present ▾" menu
  const importRef = useRef(null);
  const importHtmlRef = useRef(null);
  const timer = useRef(null);
  const router = useRouter();
  const sp = useSearchParams();
  const [units, setUnits] = useState([]);
  const [lessons, setLessons] = useState([]);

  const load = async () => {
    try { setDecks(await store.list()); }
    catch (e) { setErr(e.message); setDecks([]); }
  };
  useEffect(() => { if (!loading) load(); /* eslint-disable-next-line */ }, [loading, guest]);

  // Curriculum folders (signed-in only).
  useEffect(() => {
    if (guest || loading) return;
    (async () => {
      try {
        const [u, l] = await Promise.all([
          sk.q("units", { params: { select: "id,title,group_id,discipline,sort_order", order: "sort_order.asc" } }),
          sk.q("lessons", { params: { select: "id,unit_id,title,lesson_number", order: "lesson_number.asc" } }),
        ]);
        setUnits(u || []); setLessons(l || []);
      } catch {}
    })();
  }, [guest, loading]);

  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);

  // Open a specific deck via ?deck=<id> (e.g. opened from a unit page).
  useEffect(() => {
    const id = sp.get("deck");
    if (!id || guest || loading || active) return;
    (async () => {
      try { const d = await sk.q("decks", { params: { id: `eq.${id}`, select: "*" }, single: true }); if (d) { setActive(d); setSave("saved"); } }
      catch {}
    })();
    // eslint-disable-next-line
  }, [sp, guest, loading]);

  const fileDeck = async (patch) => {
    setActive((a) => ({ ...a, ...patch }));
    try { await store.update(active.id, patch); } catch (e) { setErr(e.message); }
  };

  const onMasterChange = (master) => {
    setActive((a) => ({ ...a, master }));
    if (active) store.update(active.id, { master }).catch((e) => setErr(e.message));
  };
  const onThemeChange = (theme) => {
    setActive((a) => ({ ...a, theme }));
    if (active) store.update(active.id, { theme }).catch((e) => setErr(e.message));
  };

  // Fork any deck (a Master or a colleague's) into my own editable copy.
  const copyDeck = async (d) => {
    try {
      const created = await store.create({ title: `${d.title} (my copy)`, slides: d.slides || [], unit_id: d.unit_id || null, lesson_id: d.lesson_id || null });
      setActive(created); setSave("saved");
      router.replace(`/slides?deck=${created.id}`);
    } catch (e) { setErr(e.message); }
  };

  const createDeck = async () => {
    try { setActive(await store.create({ title: "Untitled deck", slides: [newSlide()] })); setSave("saved"); }
    catch (e) { setErr(e.message); }
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setImporting(true); setErr("");
    try {
      const { importPptx } = await import("@/lib/importPptx");
      // Signed in: upload images to storage so the saved deck row stays small
      // (base64-inlining a graphics-heavy deck times out the DB on save).
      // Guest: inline as base64 (localStorage has no storage bucket).
      const folder = "import-" + Math.floor(performance.now());
      const opts = guest ? {} : { uploadImage: (f) => store.uploadImage(f, folder) };
      const slides = await importPptx(file, opts);
      const created = await store.create({ title: file.name.replace(/\.pptx$/i, ""), slides });
      setActive(created); setSave("saved");
    } catch (e) { setErr("Import failed: " + e.message); }
    finally { setImporting(false); }
  };

  const onImportHtml = async (e) => {
    const files = e.target.files; e.target.value = "";
    if (!files || !files.length) return;
    const names = Array.from(files).map((f) => f.name);
    setImporting(true); setErr("");
    try {
      const { importHtmlFiles } = await import("@/lib/importHtml");
      const slides = await importHtmlFiles(files);
      const title = names.length === 1 ? names[0].replace(/\.(html?|htm)$/i, "") : `Imported HTML (${slides.length})`;
      const created = await store.create({ title, slides });
      setActive(created); setSave("saved");
    } catch (e) { setErr("Import failed: " + e.message); }
    finally { setImporting(false); }
  };

  const openDeck = (d) => { setActive(d); setSave("saved"); setCurSlide(0); };
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
    if (confirmId !== id) { setConfirmId(id); return; }  // first click arms, second confirms
    setConfirmId(null);
    try { await store.remove(id); setDecks((ds) => ds.filter((d) => d.id !== id)); }
    catch (e) { setErr(e.message); }
  };

  if (loading) return <Shell guest={false}><div style={{ color: C.dim, fontFamily: C.mono, fontSize: 13 }}>Loading…</div></Shell>;

  /* ── Editing a single deck ── */
  if (active) {
    const owned = guest || active.owner === user?.id;
    const canEdit = owned || (active.is_master && author);

    // Viewing a deck I can't edit (a colleague's, or a Master and I'm not an author)
    if (!canEdit) {
      return (
        <Shell guest={guest}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <Btn v="ghost" onClick={closeDeck}>← Decks</Btn>
            <div style={{ marginTop: 20, padding: 24, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div style={{ fontFamily: C.serif, fontSize: 26, color: C.text, marginBottom: 6 }}>
                {active.is_master ? "★ " : ""}{active.title}
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
                {active.is_master ? "This is an official department deck — view-only." : "This is a colleague's deck — view-only."} Make your own copy to edit and teach from it.
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Btn onClick={() => router.push(`/slides/${active.id}/present`)}>▶ View slides</Btn>
                <Btn v="soft" onClick={() => copyDeck(active)}>Make a copy</Btn>
              </div>
            </div>
          </div>
        </Shell>
      );
    }

    return (
      <Shell guest={guest}>
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 116px)", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn v="ghost" onClick={closeDeck}>← Decks</Btn>
            <input value={active.title} onChange={(e) => renameDeck(e.target.value)}
              style={{ flex: 1, minWidth: 160, padding: "6px 8px", border: "1px solid transparent", borderRadius: 6,
                       fontFamily: C.serif, fontSize: 24, color: C.text, background: "transparent", outline: "none" }}
              onFocus={(e) => (e.target.style.borderColor = C.border)}
              onBlur={(e) => (e.target.style.borderColor = "transparent")} />
            {!guest && (
              <>
                <select value={active.unit_id || ""} title="Save this deck in a curriculum unit"
                  onChange={(e) => fileDeck({ unit_id: e.target.value || null, lesson_id: null })} style={pickerStyle}>
                  <option value="">📁 Unfiled</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
                </select>
                {active.unit_id && (
                  <select value={active.lesson_id || ""} title="Optionally pin to a lesson"
                    onChange={(e) => fileDeck({ lesson_id: e.target.value || null })} style={pickerStyle}>
                    <option value="">Whole unit</option>
                    {lessons.filter((l) => l.unit_id === active.unit_id).map((l) => (
                      <option key={l.id} value={l.id}>L{l.lesson_number} · {l.title}</option>
                    ))}
                  </select>
                )}
                {!active.is_master && (
                  <Btn v={active.shared ? "pri" : "ghost"} title="Let other teachers view and copy this deck"
                    onClick={() => fileDeck({ shared: !active.shared })}>
                    {active.shared ? "✓ Shared" : "Share with dept"}
                  </Btn>
                )}
                {author && (
                  <Btn v={active.is_master ? "pri" : "ghost"} title="Mark as the official department version (locked for others)"
                    onClick={() => fileDeck({ is_master: !active.is_master, shared: active.is_master ? active.shared : false })}>
                    {active.is_master ? "★ Official" : "Make official"}
                  </Btn>
                )}
              </>
            )}
            <span style={{ fontFamily: C.mono, fontSize: 11, color: save === "error" ? C.red : C.dim }}>
              {save === "saving" ? "saving…" : save === "error" ? "save failed" : "saved"}
            </span>
            <Btn v="soft" onClick={exportPptx} disabled={exporting}>{exporting ? "exporting…" : "Export .pptx"}</Btn>
            <div style={{ position: "relative" }}>
              <Btn onClick={() => setPresentOpen((o) => !o)} title="Start the slideshow">▶ Present ▾</Btn>
              {presentOpen && (
                <>
                  <div onClick={() => setPresentOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 41, width: 232, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 10px 32px rgba(0,0,0,0.16)", padding: 6 }}>
                    {[
                      { label: "From beginning", sub: "Slide 1", start: 0 },
                      { label: "From current slide", sub: `Slide ${curSlide + 1}`, start: curSlide },
                    ].map((it) => (
                      <button key={it.label}
                        onClick={() => { setPresentOpen(false); router.push(`/slides/${active.id}/present${it.start ? `?start=${it.start}` : ""}`); }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.bg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, width: "100%", textAlign: "left",
                                 padding: "8px 10px", border: "none", background: "transparent", borderRadius: 5, cursor: "pointer", fontFamily: C.sans, fontSize: 13, color: C.text }}>
                        <span>{it.label}</span>
                        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{it.sub}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <SlideEditor deck={active} onChange={onSlidesChange} onCurChange={setCurSlide}
              onUploadImage={(file) => store.uploadImage(file, active.id)}
              onThemeChange={onThemeChange} onMasterChange={onMasterChange} />
          </div>
        </div>
      </Shell>
    );
  }

  /* ── Deck list ── */
  // Group signed-in decks by curriculum unit (folders), then "Unfiled".
  const deckGroups = (() => {
    if (guest || !decks) return [];
    const byUnit = {};
    decks.forEach((d) => { const k = d.unit_id || "__none"; (byUnit[k] ||= []).push(d); });
    const filed = units.filter((u) => byUnit[u.id]).map((u) => ({ key: u.id, label: u.title, decks: byUnit[u.id] }));
    return byUnit.__none ? [...filed, { key: "__none", label: "Unfiled", decks: byUnit.__none }] : filed;
  })();

  return (
    <Shell guest={guest}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontFamily: C.serif, fontSize: 36, color: C.text, margin: 0 }}>Slides</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={importRef} type="file" accept=".pptx" onChange={onImportFile} style={{ display: "none" }} />
          <input ref={importHtmlRef} type="file" accept=".html,.htm,text/html" multiple onChange={onImportHtml} style={{ display: "none" }} />
          <Btn v="soft" onClick={() => importRef.current?.click()} disabled={importing}>{importing ? "Importing…" : "Import .pptx"}</Btn>
          <Btn v="soft" onClick={() => importHtmlRef.current?.click()} disabled={importing}>{importing ? "Importing…" : "Import .html"}</Btn>
          <Btn onClick={createDeck}>+ New deck</Btn>
        </div>
      </div>

      {err && <div style={{ color: C.red, fontFamily: C.mono, fontSize: 12, marginBottom: 16 }}>{err}</div>}

      {decks === null ? (
        <div style={gridStyle}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div className="sk-shimmer" style={{ aspectRatio: "16/9", borderBottom: `1px solid ${C.border}` }} />
              <div style={{ padding: "10px 12px" }}><div className="sk-shimmer" style={{ height: 12, width: "70%", borderRadius: 3 }} /></div>
            </div>
          ))}
          <style>{`.sk-shimmer{background:linear-gradient(100deg,${C.bg} 30%,${C.border} 50%,${C.bg} 70%);background-size:200% 100%;animation:sk 1.2s ease-in-out infinite}@keyframes sk{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      ) : decks.length === 0 ? (
        <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 13 }}>No decks yet. Create your first one.</div>
      ) : guest ? (
        <div style={gridStyle}>{decks.map(renderCard)}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {deckGroups.map((g) => (
            <div key={g.key}>
              <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{g.key === "__none" ? "🗂 Unfiled" : `📁 ${g.label}`}</span>
                <span style={{ color: C.faint }}>· {g.decks.length}</span>
              </div>
              <div style={gridStyle}>{g.decks.map(renderCard)}</div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );

  function renderCard(d) {
    const hov = hovId === d.id;
    const arming = confirmId === d.id;
    return (
      <button key={d.id} onClick={() => openDeck(d)}
        onMouseEnter={() => setHovId(d.id)}
        onMouseLeave={() => { setHovId(null); if (arming) setConfirmId(null); }}
        style={{ textAlign: "left", padding: 0, background: C.surface,
                 border: `1px solid ${hov ? C.accent : C.border}`, borderRadius: 8, cursor: "pointer",
                 overflow: "hidden", fontFamily: "inherit", transition: "transform .14s ease, box-shadow .14s ease, border-color .14s ease",
                 transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? "0 6px 18px rgba(0,0,0,0.10)" : "none" }}>
        <DeckThumb deck={d} />
        <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
          <span onClick={(e) => deleteDeck(d.id, e)} title={arming ? "Click again to delete" : "Delete"}
            style={{ fontFamily: C.mono, fontSize: 11, padding: "2px 6px", borderRadius: 4, transition: "opacity .14s ease",
                     color: arming ? C.red : C.dim, background: arming ? `${C.red}1a` : "transparent",
                     opacity: arming ? 1 : hov ? 0.7 : 0 }}>
            {arming ? "Delete?" : "✕"}
          </span>
        </div>
      </button>
    );
  }
}

export default function SlidesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: C.mono, fontSize: 13, color: C.dim }}>Loading…</div>}>
      <SlidesContent />
    </Suspense>
  );
}
