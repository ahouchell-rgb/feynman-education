"use client";
import { useState, useRef, useEffect } from "react";
import { C } from "@/lib/theme";
import { elStyle } from "@/components/SlideStage";
import { SUB, SUP, mapScript, autoSub } from "@/lib/formula";
import { caretOffsets, selectRange, isRich } from "./constants";

/* Inline text editor: a contentEditable seeded once on mount so React never
   fights the caret. Saves on EVERY keystroke (onText) so the text is never
   lost if the editor is torn down by a click elsewhere; onDone just exits.
   Exposes insert()/subSup() via apiRef so the symbol bar and ⌘,/⌘. work. */
export function TextEditor({ el, onText, onDone, apiRef }: { el: any; onText: (text: string, rich: string | null) => void; onDone: () => void; apiRef?: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<string | null>(null);            // live typing mode: null | "sub" | "sup"
  const [script, setScript] = useState<string | null>(null); // mirror, for the on-screen indicator

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (el.rich) node.innerHTML = el.rich; else node.textContent = el.text || "";
    node.focus();
    // place caret at end (selecting all rich HTML is jarring)
    const sel = window.getSelection(); const r = document.createRange();
    r.selectNodeContents(node); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist both a plain-text fallback and the rich HTML (only when formatted).
  const persist = () => {
    const node = ref.current; if (!node) return;
    const html = node.innerHTML;
    onText(node.textContent ?? "", isRich(html) ? html : null);
  };

  // On input, auto-subscript chemical formulae — but only in simple single-line
  // plain text, never rich or multi-line boxes (replacing textContent would drop
  // formatting / line breaks). Length-preserving, so we restore the caret offset.
  const handleInput = () => {
    const node = ref.current; if (!node) return;
    if (!isRich(node.innerHTML) && node.childNodes.length <= 1) {
      const cur = node.textContent ?? "";
      const next = autoSub(cur);
      if (next !== cur) {
        const off = caretOffsets(node);
        node.textContent = next;
        if (off) selectRange(node, off.start, off.end);
      }
    }
    persist();
  };

  const exec = (cmd: string, val?: string) => { ref.current?.focus(); try { document.execCommand(cmd, false, val); } catch {} persist(); };
  const doInsert = (str) => { ref.current?.focus(); try { document.execCommand("insertText", false, str); } catch {} persist(); };
  const doSubSup = (kind) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const mapped = mapScript(sel.toString(), kind);
    ref.current?.focus(); try { document.execCommand("insertText", false, mapped); } catch {} persist();
  };
  // ⌘, / ⌘. behaviour: with text selected, convert it (Unicode). With just a caret,
  // toggle a typing mode so each character typed next is mapped, until toggled off.
  const toggleScript = (kind) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) { doSubSup(kind); return; }
    const next = scriptRef.current === kind ? null : kind;
    scriptRef.current = next; setScript(next);
    ref.current?.focus();
  };
  // Leaving the editor clears any active mode.
  useEffect(() => () => { scriptRef.current = null; }, []);

  // Re-register each render so the toolbar calls the latest closures.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      insert: doInsert, subSup: toggleScript,
      bold: () => exec("bold"), italic: () => exec("italic"), underline: () => exec("underline"),
      color: (v) => exec("foreColor", v),
      bullet: () => exec("insertUnorderedList"), number: () => exec("insertOrderedList"),
      indent: () => exec("indent"), outdent: () => exec("outdent"),
    };
    return () => { apiRef.current = null; };
  });

  return (
   <>
    <div ref={ref} contentEditable suppressContentEditableWarning
      onMouseDown={(e) => e.stopPropagation()}
      onInput={handleInput}
      onBlur={onDone}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) { e.preventDefault(); exec("bold"); }
        else if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) { e.preventDefault(); exec("italic"); }
        else if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); toggleScript("sub"); }
        else if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); toggleScript("sup"); }
        else if (e.key === "Escape") { e.preventDefault(); scriptRef.current = null; setScript(null); ref.current?.blur(); }
        else if (scriptRef.current && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
          // In subscript/superscript typing mode: map the character to its Unicode form.
          const map = scriptRef.current === "sub" ? SUB : SUP;
          e.preventDefault();
          try { document.execCommand("insertText", false, map[e.key] ?? e.key); } catch {}
          persist();
        }
      }}
      className={el.rich ? "rt" : undefined}
      style={{ ...elStyle(el), outline: `2px solid ${C.accent}`, outlineOffset: 1, cursor: "text", overflow: "visible" }} />
    {script && (
      <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)",
        background: C.text, color: C.bg, fontFamily: C.mono, fontSize: 12, padding: "6px 14px",
        borderRadius: 999, boxShadow: "0 4px 16px rgba(0,0,0,0.25)", pointerEvents: "none", zIndex: 9999,
        display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
        <span>{script === "sub" ? "X₂ subscript" : "X² superscript"} mode</span>
        <span style={{ opacity: 0.6 }}>⌘{script === "sub" ? "," : "."} to exit</span>
      </div>
    )}
   </>
  );
}
