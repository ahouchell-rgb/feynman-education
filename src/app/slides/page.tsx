"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sk, useAuth } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn } from "@/lib/primitives";
import { SlideEditor } from "@/components/SlideEditor";
import { StaticSlide } from "@/components/SlideStage";
import { guestRead, guestWrite, GUEST_KEY, GuestQuotaError } from "@/lib/guestDecks";
import { google, PPTX_MIME, SLIDES_MIME } from "@/lib/google";
import { openDrivePicker } from "@/components/GoogleDrivePicker";
import { hasUnsavedWork, readUpdatedAtWithRetry, retryDelayMs } from "./saveHelpers";
import { STARTER_DECKS, instantiateStarter } from "@/lib/starterDecks";

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

/* A starter-deck card: live miniature of the exemplar's first slide + a one-line
   description. One click clones it into the teacher's account and opens it. */
function StarterCard({ starter, onClick }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  const [hov, setHov] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const first = starter.slides?.[0];
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ textAlign: "left", padding: 0, background: C.surface, border: `1px solid ${hov ? C.accent : C.border}`,
               borderRadius: 8, cursor: "pointer", overflow: "hidden", fontFamily: "inherit",
               transition: "transform .14s ease, box-shadow .14s ease, border-color .14s ease",
               transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? "0 6px 18px rgba(0,0,0,0.10)" : "none" }}>
      <div ref={ref} style={{ aspectRatio: "16/9", background: "#fff", borderBottom: `1px solid ${C.border}`, overflow: "hidden", lineHeight: 0 }}>
        {w > 0 && first && <StaticSlide slide={first} width={w} index={0} total={starter.slides.length} title={starter.title} />}
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 14, color: C.text, marginBottom: 3 }}>{starter.title}</div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.4 }}>{starter.blurb}</div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 5 }}>{starter.slides.length} slides</div>
      </div>
    </button>
  );
}

/* Friendly empty state: pick a complete starter deck (one click → editable copy),
   point teachers at the AI "generate from a unit" path, or start blank. */
function StarterPicker({ guest, onUseStarter, onBlank, onGenerate }) {
  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontFamily: C.serif, fontSize: 24, color: C.text, marginBottom: 6 }}>Start with a ready-made lesson</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, maxWidth: "64ch" }}>
          Pick a lesson shape to get a complete, editable deck in one click — placeholder text you fill in with your own content. You can change anything once it opens.
        </div>
      </div>
      <div style={gridStyle}>
        {STARTER_DECKS.map((s) => <StarterCard key={s.id} starter={s} onClick={() => onUseStarter(s)} />)}
      </div>
      <div style={{ marginTop: 26, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {!guest && (
          <Btn v="soft" onClick={onGenerate} title="Generate a full lesson deck from a curriculum unit with AI">✨ Generate a lesson from a unit</Btn>
        )}
        {!guest && (
          <a href="/curriculum" style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, textDecoration: "none", border: `1px solid ${C.border}`, padding: "6px 12px", borderRadius: 6 }}>
            Browse the curriculum →
          </a>
        )}
        <Btn v="ghost" onClick={onBlank}>Start from a blank deck</Btn>
      </div>
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
  const [coverBusy, setCoverBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingDrive, setSavingDrive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [driveMsg, setDriveMsg] = useState("");
  const [hovId, setHovId] = useState(null);     // card under the cursor
  const [confirmId, setConfirmId] = useState(null); // deck awaiting a 2nd delete click
  const [curSlide, setCurSlide] = useState(0);  // slide selected in the editor rail (for "present from here")
  const [presentOpen, setPresentOpen] = useState(false); // "▶ Present ▾" menu
  const importRef = useRef(null);
  const importHtmlRef = useRef(null);
  const timer = useRef(null);
  const pendingTimer = useRef(false);            // a debounced save is scheduled but hasn't run yet
  const retryTimer = useRef(null);               // backoff timer for auto-retrying a failed save
  const retryCount = useRef(0);                  // consecutive failed-save attempts (drives backoff)
  const lastUnsaved = useRef(null);              // latest slides that still need persisting (survives a failed save)
  const baseRef = useRef(null);                  // last-known server updated_at (optimistic concurrency)
  const [conflict, setConflict] = useState("");  // set when a colleague edited the deck elsewhere
  const router = useRouter();
  const sp = useSearchParams();
  const [groups, setGroups] = useState([]);
  const [units, setUnits] = useState([]);
  const [lessons, setLessons] = useState([]);
  // AI lesson generator modal
  const [genOpen, setGenOpen] = useState(false);
  const [genUnit, setGenUnit] = useState("");
  const [genLesson, setGenLesson] = useState("");
  const [genFocus, setGenFocus] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [autoQDeckId, setAutoQDeckId] = useState(null); // deck just AI-generated → auto-open questions
  const [shareOpen, setShareOpen] = useState(false); // public-share popover
  const [shareCopied, setShareCopied] = useState(false);

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
        const [g, u, l] = await Promise.all([
          sk.q("groups", { params: { order: "sort_order.asc" } }),
          sk.q("units", { params: { select: "id,title,group_id,discipline,sort_order", order: "sort_order.asc" } }),
          sk.q("lessons", { params: { select: "id,unit_id,title,lesson_number", order: "lesson_number.asc" } }),
        ]);
        setGroups(g || []); setUnits(u || []); setLessons(l || []);
      } catch {}
    })();
  }, [guest, loading]);

  // Capture the loaded version's updated_at whenever a *different* deck is opened,
  // so the slides autosave can detect a colleague writing over it.
  useEffect(() => { baseRef.current = active?.updated_at ?? null; setConflict(""); /* eslint-disable-next-line */ }, [active?.id]);

  // Warn before closing/refreshing the tab while there is work that hasn't made
  // it to storage yet — a pending debounce, an in-flight save, or a failed save.
  // Without this, a refresh mid-save silently loses the teacher's last edits.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!active) return;
      if (!hasUnsavedWork({ save, pendingTimer: pendingTimer.current })) return;
      e.preventDefault();
      e.returnValue = ""; // required for the native confirmation prompt in most browsers
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active, save]);

  // Tidy up the debounce / retry timers when the editor unmounts.
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(retryTimer.current); }, []);

  const bumpBase = (rows) => { const ts = Array.isArray(rows) ? rows[0]?.updated_at : null; if (ts) baseRef.current = ts; };

  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);

  // Units grouped by year for the "save to" picker: years in sort_order, units in
  // teaching-sequence order within each year. Mirrors the curriculum page grouping.
  const unitsByYear = useMemo(() => {
    const out = groups
      .map((g) => ({ key: g.id, label: g.label || g.id, units: units.filter((u) => u.group_id === g.id) }))
      .filter((grp) => grp.units.length);
    const known = new Set(groups.map((g) => g.id));
    const orphans = units.filter((u) => !known.has(u.group_id));
    if (orphans.length) out.push({ key: "__other", label: "Other", units: orphans });
    return out;
  }, [groups, units]);

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
    try { bumpBase(await store.update(active.id, patch)); } catch (e) { setErr(e.message); }
  };

  const onMasterChange = (master) => {
    setActive((a) => ({ ...a, master }));
    if (active) store.update(active.id, { master }).then(bumpBase).catch((e) => setErr(e.message));
  };
  const onThemeChange = (theme) => {
    setActive((a) => ({ ...a, theme }));
    if (active) store.update(active.id, { theme }).then(bumpBase).catch((e) => setErr(e.message));
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

  // Clone a built-in starter deck into this teacher's account (fresh ids, owned
  // by them) and open it — exactly like creating any deck. Works in guest mode
  // too: makeStore's guest branch persists to localStorage.
  const useStarter = async (starter) => {
    try {
      const created = await instantiateStarter(starter, store, { ownerId: guest ? null : user?.id });
      setActive(created); setSave("saved"); setCurSlide(0);
    } catch (e) { setErr(e.message); }
  };

  // One-click AI lesson: generate a full deck from a unit (+ optional lesson),
  // then open it in the editor. Reuses /api/lesson-generator → slides-assistant.
  const generateLesson = async () => {
    if (!genUnit) { setErr("Pick a unit to generate a lesson for."); return; }
    setGenBusy(true); setErr("");
    try {
      const res = await fetch("/api/lesson-generator", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sk.auth.getToken()}` },
        body: JSON.stringify({ unitId: genUnit, lessonId: genLesson || null, focus: genFocus.trim() || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Generation failed");
      const deck = await sk.q("decks", { params: { id: `eq.${d.deckId}`, select: "*" }, single: true });
      setGenOpen(false); setGenFocus(""); setGenLesson("");
      setAutoQDeckId(d.deckId); // open the retrieval-questions modal once the editor mounts
      openDeck(deck);
    } catch (e) { setErr("Lesson generation failed: " + e.message); }
    finally { setGenBusy(false); }
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
    const names = Array.from(files as FileList).map((f) => f.name);
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

  // Fetch a linked Drive file and convert it to native slides. Shared by the
  // initial import, the on-open auto-sync, and the manual refresh. Native Slides
  // are exported to .pptx by Drive; an uploaded .pptx is fetched as-is.
  const importSlidesFromDrive = async (fileId, mimeType) => {
    const blob = await google.fetchAsPptxBlob(user.id, { id: fileId, mimeType });
    const { importPptx } = await import("@/lib/importPptx");
    const folder = "drive-" + Math.floor(performance.now());
    return importPptx(blob, { uploadImage: (f) => store.uploadImage(f, folder) });
  };

  // Pick a Google Slides / .pptx file from Drive and import it. Signed-in only.
  const onImportFromDrive = async () => {
    if (guest || !user?.id) return;
    setImporting(true); setErr("");
    try {
      const file = await openDrivePicker(user.id);
      if (!file) return; // teacher cancelled the picker
      const slides = await importSlidesFromDrive(file.id, file.mimeType);
      const title = (file.name || "Imported deck").replace(/\.pptx$/i, "");
      const created = await store.create({ title, slides });
      setActive(created); setSave("saved");
      // Link the deck to its Drive source so it auto-syncs on open (and can be
      // refreshed manually). We store: the MIME type (drives how we re-fetch, and
      // protects a native Slides file from being overwritten on Save to Drive),
      // and the source's modifiedTime — the change-detection key for on-open sync.
      // Best-effort: a deck still imports fine if the drive_* columns are absent.
      const meta = await google.getFileMeta(user.id, file.id).catch(() => null);
      const link = {
        drive_file_id: file.id,
        drive_file_name: file.name,
        drive_file_mime: file.mimeType || PPTX_MIME,
        drive_synced_time: meta?.modifiedTime || null,
      };
      store.update(created.id, link)
        .then(() => setActive((a) => (a && a.id === created.id ? { ...a, ...link } : a)))
        .catch(() => {});
    } catch (e) { setErr("Drive import failed: " + e.message); }
    finally { setImporting(false); }
  };

  // Save the open deck back to Drive as a .pptx — updating the linked file in
  // place when there is one, otherwise creating a new file. Signed-in only.
  const saveToDrive = async () => {
    if (guest || !active || !user?.id) return;
    setSavingDrive(true); setErr(""); setDriveMsg("");
    try {
      const { exportDeckBlob, deckFileStem } = await import("@/lib/exportPptx");
      const blob = await exportDeckBlob(active);
      // Overwrite in place only when the linked source is itself a .pptx. A deck
      // linked to a native Google Slides file is linked for *refresh* (read), so
      // we export a fresh .pptx copy instead of writing over the Slides file, and
      // we leave the source link pointing at the Slides so Refresh still works.
      const linkedToSlides = !!active.drive_file_id && active.drive_file_mime === SLIDES_MIME;
      const overwriteId = active.drive_file_id && !linkedToSlides ? active.drive_file_id : null;
      const res = await google.saveDeckPptx(user.id, { name: deckFileStem(active), blob, fileId: overwriteId });
      if (!linkedToSlides) {
        // Baseline drive_synced_time to the file we just wrote, so the next open
        // doesn't see "Drive changed" and needlessly re-import our own export.
        const meta = await google.getFileMeta(user.id, res.id).catch(() => null);
        const link = { drive_file_id: res.id, drive_file_name: res.name, drive_file_mime: PPTX_MIME, drive_synced_time: meta?.modifiedTime || null };
        setActive((a) => ({ ...a, ...link }));
        store.update(active.id, link).then(bumpBase).catch(() => {});
      }
      setDriveMsg(overwriteId ? "updated in Drive ✓" : "saved to Drive ✓");
      setTimeout(() => setDriveMsg(""), 4000);
    } catch (e) { setErr("Save to Drive failed: " + e.message); }
    finally { setSavingDrive(false); }
  };

  // Force a re-sync now, even if Drive's modifiedTime hasn't moved. Confirm-gated
  // because it discards local edits to this deck. Use when you want the latest
  // without reopening, or to recover after declining an on-open sync.
  const refreshFromDrive = async () => {
    if (guest || !active || !user?.id || !active.drive_file_id) return;
    const what = active.drive_file_name || "the linked Google file";
    if (!window.confirm(
      `Refresh this deck from “${what}” in Google Drive?\n\n` +
      `It will be replaced with the latest version from Drive. Any edits you have made to this deck in Feynman will be overwritten.`,
    )) return;
    setRefreshing(true); setErr(""); setDriveMsg("");
    try {
      const meta = await google.getFileMeta(user.id, active.drive_file_id).catch(() => null);
      const mime = meta?.mimeType || active.drive_file_mime;
      const slides = await importSlidesFromDrive(active.drive_file_id, mime);
      const ts = nowISO();
      const patch = {
        slides, updated_at: ts,
        drive_file_mime: mime,
        drive_file_name: meta?.name || active.drive_file_name,
        drive_synced_time: meta?.modifiedTime ?? active.drive_synced_time ?? null,
      };
      bumpBase(await store.update(active.id, patch));
      setActive((a) => ({ ...a, ...patch }));
      setCurSlide(0); setSave("saved");
      setDriveMsg("refreshed from Drive ✓");
      setTimeout(() => setDriveMsg(""), 4000);
    } catch (e) { setErr("Refresh from Drive failed: " + e.message); }
    finally { setRefreshing(false); }
  };

  // Auto-sync a linked deck when it's opened: if the Drive source changed since
  // our last sync, re-import it in place. Cheap when unchanged — one metadata
  // call, no re-convert. Runs in the background after the cached deck is already
  // on screen, so opening stays instant; failures (offline, revoked access) leave
  // the cached version untouched and silent. We re-check for in-session edits
  // both before and after the (slow) import so a sync never clobbers work the
  // teacher started mid-fetch.
  const maybeSyncFromDrive = async (deck) => {
    if (guest || !user?.id || !deck?.drive_file_id) return;
    try {
      const meta = await google.getFileMeta(user.id, deck.drive_file_id);
      if (!meta?.modifiedTime) return;
      if (deck.drive_synced_time && meta.modifiedTime === deck.drive_synced_time) return; // up to date
      if (lastUnsaved.current != null) return; // teacher is mid-edit — don't surprise them
      setSyncing(true);
      const slides = await importSlidesFromDrive(deck.drive_file_id, meta.mimeType || deck.drive_file_mime);
      if (lastUnsaved.current != null) return; // edits began during the import — bail without clobbering
      const ts = nowISO();
      const patch = {
        slides, updated_at: ts,
        drive_file_mime: meta.mimeType || deck.drive_file_mime,
        drive_file_name: meta.name || deck.drive_file_name,
        drive_synced_time: meta.modifiedTime,
      };
      bumpBase(await store.update(deck.id, patch));
      setActive((a) => (a && a.id === deck.id ? { ...a, ...patch } : a)); // only if still open
      setCurSlide((c) => Math.min(c, Math.max(0, slides.length - 1)));
      setDriveMsg("synced from Drive ✓");
      setTimeout(() => setDriveMsg(""), 4000);
    } catch { /* offline / unreachable / no access — keep the cached deck silently */ }
    finally { setSyncing(false); }
  };

  const openDeck = (d) => {
    setActive(d); setSave("saved"); setCurSlide(0);
    lastUnsaved.current = null; pendingTimer.current = false; retryCount.current = 0;
    void maybeSyncFromDrive(d); // background: pull the latest if the Drive source moved
  };
  const closeDeck = async () => {
    clearTimeout(timer.current); clearTimeout(retryTimer.current);
    pendingTimer.current = false;
    // Flush any work that hasn't landed yet — a change made within the last ~600ms,
    // or one whose save previously failed — otherwise it's dropped when we reload.
    if (lastUnsaved.current != null && active && !conflict) {
      const slides = lastUnsaved.current;
      try {
        if (guest) await store.update(active.id, { slides, updated_at: nowISO() });
        else await saveSupabaseSlides(slides);
        lastUnsaved.current = null;
      } catch (e) { setErr(e.message); }
    }
    setActive(null); setAutoQDeckId(null); load();
  };

  // Pull the latest version after a conflict so the teacher continues from the
  // colleague's saved copy instead of overwriting it.
  const reloadDeck = async () => {
    try {
      const d = await sk.q("decks", { params: { id: `eq.${active.id}`, select: "*" }, single: true });
      if (d) { setActive(d); baseRef.current = d.updated_at ?? null; setConflict(""); setSave("saved"); }
    } catch (e) { setErr(e.message); }
  };

  // Save slides with optimistic concurrency: if the stored updated_at moved since
  // we loaded, a colleague edited it elsewhere — surface a conflict instead of
  // clobbering their work. Returns false on conflict, true on a clean write.
  const saveSupabaseSlides = async (slides) => {
    if (baseRef.current) {
      // Read the current server version, retrying a transient failure. If EVERY
      // attempt fails we must NOT proceed: a blind write would silently clobber a
      // colleague's edit. Surface a save error instead of a false "saved".
      const { ok, updatedAt } = await readUpdatedAtWithRetry(
        () => sk.q("decks", { params: { id: `eq.${active.id}`, select: "updated_at" }, single: true }),
      );
      if (!ok) throw new Error("Couldn't verify the latest version before saving — your change is kept and will retry.");
      if (updatedAt && updatedAt !== baseRef.current) {
        setConflict("A colleague edited this deck elsewhere. Reload to get their version — your last change here wasn’t saved.");
        return false;
      }
    }
    const newTs = nowISO();
    const rows = await sk.q("decks", { method: "PATCH", params: { id: `eq.${active.id}` }, body: { slides, updated_at: newTs } });
    baseRef.current = (Array.isArray(rows) ? rows[0]?.updated_at : undefined) ?? newTs;
    return true;
  };

  // Perform one persist of `slides`. On success clears the unsaved buffer and the
  // retry backoff; on failure keeps the work in memory and schedules an auto-retry
  // so a transient blip can't lose the lesson. Returns true on a clean write.
  const persistSlides = async (slides) => {
    try {
      let ok = true;
      if (guest) await store.update(active.id, { slides, updated_at: nowISO() });
      else ok = await saveSupabaseSlides(slides);
      if (ok) {
        lastUnsaved.current = null;
        retryCount.current = 0;
        clearTimeout(retryTimer.current);
        setSave("saved");
      } else {
        // A real conflict — surfaced via the conflict banner. Stop retrying so we
        // don't keep hammering a write the teacher must resolve manually.
        retryCount.current = 0;
        clearTimeout(retryTimer.current);
        setSave("error");
      }
      return ok;
    } catch (e) {
      setErr(e.message); setSave("error");
      // A full localStorage quota won't fix itself on retry — keep the work in
      // memory and surface the message, but don't spin a pointless backoff loop.
      if (!(e instanceof GuestQuotaError)) scheduleRetry();
      return false;
    }
  };

  // Auto-retry the latest unsaved slides after an exponential backoff. Capped so
  // it keeps trying quietly in the background until the teacher's work lands.
  const scheduleRetry = () => {
    if (lastUnsaved.current == null || conflict) return;
    clearTimeout(retryTimer.current);
    const delay = retryDelayMs(retryCount.current);
    retryCount.current += 1;
    retryTimer.current = setTimeout(() => {
      if (lastUnsaved.current != null && !conflict) { setSave("saving"); persistSlides(lastUnsaved.current); }
    }, delay);
  };

  // Manual "Retry save" affordance — fire the latest unsaved write immediately.
  const retrySaveNow = () => {
    if (lastUnsaved.current == null) return;
    clearTimeout(retryTimer.current);
    retryCount.current = 0;
    setSave("saving");
    persistSlides(lastUnsaved.current);
  };

  // Debounced persist whenever the editor reports a change.
  const onSlidesChange = (slides) => {
    if (conflict) { setActive((a) => ({ ...a, slides })); return; } // don't auto-save over an unresolved conflict
    setActive((a) => ({ ...a, slides }));
    lastUnsaved.current = slides;       // remember the latest work until it's safely persisted
    setSave("saving");
    clearTimeout(timer.current);
    clearTimeout(retryTimer.current);   // a fresh edit supersedes any pending retry
    retryCount.current = 0;
    pendingTimer.current = true;
    timer.current = setTimeout(() => { pendingTimer.current = false; persistSlides(slides); }, 600);
  };

  const renameDeck = async (title) => {
    setActive((a) => ({ ...a, title }));
    try { bumpBase(await store.update(active.id, { title })); } catch (e) { setErr(e.message); }
  };

  // The public share link for the open deck (only valid once it's public).
  const shareUrl = (deck) =>
    typeof window !== "undefined" && deck?.share_token ? `${window.location.origin}/slides/shared/${deck.share_token}` : "";

  // Toggle anonymous public sharing. Turning it on mints a share_token (kept
  // across off/on so a previously-handed-out link keeps working). Signed-in only.
  const togglePublic = async () => {
    if (!active || guest) return;
    const turningOn = !active.is_public;
    const token = active.share_token || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const patch = { is_public: turningOn, share_token: token };
    setActive((a) => ({ ...a, ...patch }));
    if (turningOn) setShareOpen(true);
    try { bumpBase(await store.update(active.id, patch)); } catch (e) { setErr(e.message); }
  };

  const copyShareLink = async () => {
    const url = shareUrl(active);
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }
    catch { /* clipboard blocked — the input is still selectable */ }
  };

  const exportPptx = async () => {
    setExporting(true);
    try { const { exportDeck } = await import("@/lib/exportPptx"); await exportDeck(active); }
    catch (e) { setErr("Export failed: " + e.message); }
    finally { setExporting(false); }
  };

  // Generate a printable cover/non-specialist teaching script from the deck and
  // open it in a new tab to read/print.
  const coverScript = async () => {
    setCoverBusy(true); setErr("");
    const w = window.open("", "_blank"); // open synchronously so it isn't popup-blocked
    if (w) w.document.write("<p style='font-family:system-ui;padding:24px;color:#666'>Writing cover script…</p>");
    try {
      const r = await fetch("/api/cover-sheet", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sk.auth.getToken()}` },
        body: JSON.stringify({ slides: active.slides, title: active.title }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Generation failed");
      if (w) { w.document.open(); w.document.write(d.html); w.document.close(); }
    } catch (e) { if (w) w.close(); setErr("Cover script failed: " + e.message); }
    finally { setCoverBusy(false); }
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
                  {unitsByYear.map((grp) => (
                    <optgroup key={grp.key} label={grp.label}>
                      {grp.units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
                    </optgroup>
                  ))}
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
                <div style={{ position: "relative" }}>
                  <Btn v={active.is_public ? "pri" : "ghost"} title="Share a public link anyone can view and copy"
                    onClick={() => setShareOpen((o) => !o)}>
                    {active.is_public ? "🔗 Public" : "Share link"}
                  </Btn>
                  {shareOpen && (
                    <>
                      <div onClick={() => setShareOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 41, width: 320, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 10px 32px rgba(0,0,0,0.16)", padding: 14 }}>
                        <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text, marginBottom: 4 }}>Public share link</div>
                        <div style={{ fontFamily: C.sans, fontSize: 12, color: C.muted, lineHeight: 1.4, marginBottom: 12 }}>
                          {active.is_public ? "Anyone with this link can view the deck and make their own copy." : "Turn on to get a link anyone can view and copy. The deck stays read-only for them."}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{active.is_public ? "Public" : "Private"}</span>
                          <Btn v={active.is_public ? "soft" : "pri"} onClick={togglePublic}>
                            {active.is_public ? "Make private" : "Make public"}
                          </Btn>
                        </div>
                        {active.is_public && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input readOnly value={shareUrl(active)} onFocus={(e) => e.target.select()}
                              style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 11, background: C.bg, color: C.text }} />
                            <Btn v="soft" onClick={copyShareLink}>{shareCopied ? "Copied ✓" : "Copy"}</Btn>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
            {save === "error" && !conflict ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 11, color: C.red,
                             background: `${C.red}14`, border: `1px solid ${C.red}`, borderRadius: 6, padding: "3px 8px" }}>
                ⚠ save failed — your work is kept{lastUnsaved.current != null && (
                  <Btn v="soft" onClick={retrySaveNow}>Retry save</Btn>
                )}
              </span>
            ) : (
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
                {save === "saving" ? "saving…" : "saved"}
              </span>
            )}
            <Btn v="soft" onClick={exportPptx} disabled={exporting}>{exporting ? "exporting…" : "Export .pptx"}</Btn>
            {!guest && active.drive_file_id && (
              <Btn v="soft" onClick={refreshFromDrive} disabled={refreshing || savingDrive || syncing}
                title={`Auto-syncs from “${active.drive_file_name || "the linked Google file"}” when opened. Click to force a re-sync now (replaces this deck — local edits are overwritten)`}>
                {syncing ? "syncing…" : refreshing ? "refreshing…" : "⟳ Refresh from Drive"}
              </Btn>
            )}
            {!guest && (
              <Btn v="soft" onClick={saveToDrive} disabled={savingDrive || refreshing || syncing}
                title={active.drive_file_id ? "Update the linked .pptx in your Google Drive" : "Save this deck as a .pptx in your Google Drive"}>
                {savingDrive ? "saving to Drive…" : active.drive_file_id ? "↻ Save to Drive" : "Save to Drive"}
              </Btn>
            )}
            {driveMsg && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.grn }}>{driveMsg}</span>}
            {!guest && <Btn v="soft" title="Printable teaching script for a cover teacher / non-specialist" onClick={coverScript} disabled={coverBusy}>{coverBusy ? "scripting…" : "📋 Cover script"}</Btn>}
            <Btn v="soft" title="Printable handout / PDF" onClick={() => window.open(`/slides/${active.id}/print`, "_blank")}>Print / PDF</Btn>
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
          {conflict && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: `${C.amb}1a`, border: `1px solid ${C.amb}`, borderRadius: 8, color: C.text, fontSize: 13 }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <span style={{ flex: 1 }}>{conflict}</span>
              <Btn v="soft" onClick={reloadDeck}>Reload</Btn>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            <SlideEditor deck={active} onChange={onSlidesChange} onCurChange={setCurSlide}
              onUploadImage={(file) => store.uploadImage(file, active.id)}
              onThemeChange={onThemeChange} onMasterChange={onMasterChange}
              autoQuestions={autoQDeckId === active.id} />
          </div>
        </div>
      </Shell>
    );
  }

  /* ── Deck list ── */
  // Group signed-in decks by year → curriculum unit (folders) → decks, then "Unfiled".
  // Years follow group sort_order; units follow teaching sequence within each year.
  const deckGroups = (() => {
    if (guest || !decks) return [];
    const byUnit: Record<string, any[]> = {};
    decks.forEach((d) => { const k = d.unit_id || "__none"; (byUnit[k] ||= []).push(d); });
    const unitSection = (u) => ({ key: u.id, label: u.title, decks: byUnit[u.id] });

    const sections = [];
    groups.forEach((g) => {
      const yUnits = units.filter((u) => u.group_id === g.id && byUnit[u.id]).map(unitSection);
      if (yUnits.length) sections.push({ key: g.id, label: g.label || g.id, units: yUnits });
    });
    const known = new Set(groups.map((g) => g.id));
    const orphanUnits = units.filter((u) => !known.has(u.group_id) && byUnit[u.id]).map(unitSection);
    if (orphanUnits.length) sections.push({ key: "__other", label: "Other", units: orphanUnits });
    if (byUnit.__none) sections.push({ key: "__none", label: "Unfiled", units: [{ key: "__none", label: null, decks: byUnit.__none }] });
    return sections;
  })();

  return (
    <Shell guest={guest}>
      {genOpen && (
        <div onClick={() => !genBusy && setGenOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: "min(480px,100%)", padding: 24 }}>
            <div style={{ fontFamily: C.serif, fontSize: 26, color: C.text, marginBottom: 4 }}>Generate a lesson</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 18, lineHeight: 1.5 }}>Pick a unit and AI drafts a full, ready-to-teach deck you can edit. Takes ~20–40 seconds.</div>
            <label style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>Unit</label>
            <select value={genUnit} onChange={(e) => { setGenUnit(e.target.value); setGenLesson(""); }} style={{ width: "100%", margin: "6px 0 14px", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 13, background: C.bg, color: C.text }}>
              <option value="">Choose a unit…</option>
              {unitsByYear.map((grp) => <optgroup key={grp.key} label={grp.label}>{grp.units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}</optgroup>)}
            </select>
            {genUnit && lessons.filter((l) => l.unit_id === genUnit).length > 0 && (
              <>
                <label style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>Lesson (optional)</label>
                <select value={genLesson} onChange={(e) => setGenLesson(e.target.value)} style={{ width: "100%", margin: "6px 0 14px", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 13, background: C.bg, color: C.text }}>
                  <option value="">Whole unit</option>
                  {lessons.filter((l) => l.unit_id === genUnit).map((l) => <option key={l.id} value={l.id}>L{l.lesson_number} · {l.title}</option>)}
                </select>
              </>
            )}
            <label style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>Focus (optional)</label>
            <input value={genFocus} onChange={(e) => setGenFocus(e.target.value)} placeholder="e.g. exam technique on required practical" style={{ width: "100%", margin: "6px 0 20px", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono, fontSize: 13, background: C.bg, color: C.text, outline: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn v="ghost" onClick={() => setGenOpen(false)} disabled={genBusy}>Cancel</Btn>
              <Btn onClick={generateLesson} disabled={genBusy || !genUnit}>{genBusy ? "Generating…" : "✨ Generate"}</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontFamily: C.serif, fontSize: 36, color: C.text, margin: 0 }}>Slides</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={importRef} type="file" accept=".pptx" onChange={onImportFile} style={{ display: "none" }} />
          <input ref={importHtmlRef} type="file" accept=".html,.htm,text/html" multiple onChange={onImportHtml} style={{ display: "none" }} />
          <Btn v="soft" onClick={() => importRef.current?.click()} disabled={importing}>{importing ? "Importing…" : "Import .pptx"}</Btn>
          <Btn v="soft" onClick={() => importHtmlRef.current?.click()} disabled={importing}>{importing ? "Importing…" : "Import .html"}</Btn>
          {!guest && <Btn v="soft" onClick={onImportFromDrive} disabled={importing} title="Import a Google Slides or PowerPoint file from your Google Drive">{importing ? "Importing…" : "Import from Drive"}</Btn>}
          {!guest && <Btn v="soft" onClick={() => setGenOpen(true)} title="Generate a full lesson deck from a curriculum unit with AI">✨ Generate lesson</Btn>}
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
        <StarterPicker guest={guest} onUseStarter={useStarter} onBlank={createDeck} onGenerate={() => setGenOpen(true)} />
      ) : guest ? (
        <div style={gridStyle}>{decks.map(renderCard)}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {deckGroups.map((section) => (
            <div key={section.key}>
              <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.text, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.rule}` }}>
                {section.key === "__none" ? "🗂 Unfiled" : section.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {section.units.map((u) => (
                  <div key={u.key}>
                    {u.label && (
                      <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>📁 {u.label}</span>
                        <span style={{ color: C.faint }}>· {u.decks.length}</span>
                      </div>
                    )}
                    <div style={gridStyle}>{u.decks.map(renderCard)}</div>
                  </div>
                ))}
              </div>
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
