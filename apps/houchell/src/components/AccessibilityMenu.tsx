"use client";
import { useEffect, useRef, useState } from "react";

/**
 * SEND / dyslexia accessibility menu.
 *
 * Three persisted, opt-in toggles applied as data-attributes on <html> (styled
 * in globals.css), so they work on every surface — the teacher app AND the
 * public parent/pupil portal:
 *   - dyslexia-friendly font  → data-a11y-font="dyslexic"
 *   - larger text             → data-a11y-text="large"
 *   - high contrast           → data-a11y-contrast="high"
 *
 * Settings persist to localStorage and re-apply on load. The component renders
 * its own popover; pass `variant="light"` on the cream-on-white public portal,
 * or the default dark trigger inside the app sidebar/header.
 */

type Variant = "app" | "light";

const KEY = "sk_a11y";
const ATTRS = {
  font: "data-a11y-font",
  text: "data-a11y-text",
  contrast: "data-a11y-contrast",
} as const;

interface A11yState {
  dyslexic: boolean;
  largeText: boolean;
  highContrast: boolean;
}
const DEFAULT: A11yState = { dyslexic: false, largeText: false, highContrast: false };

function read(): A11yState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

function apply(s: A11yState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  s.dyslexic ? root.setAttribute(ATTRS.font, "dyslexic") : root.removeAttribute(ATTRS.font);
  s.largeText ? root.setAttribute(ATTRS.text, "large") : root.removeAttribute(ATTRS.text);
  s.highContrast ? root.setAttribute(ATTRS.contrast, "high") : root.removeAttribute(ATTRS.contrast);
}

/** Apply the saved preferences as early as possible (mount on every layout). */
export function useApplyAccessibilityPrefs() {
  useEffect(() => { apply(read()); }, []);
}

export function AccessibilityMenu({ variant = "app" }: { variant?: Variant }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<A11yState>(DEFAULT);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Hydrate from storage on mount and apply.
  useEffect(() => {
    const s = read();
    setState(s);
    apply(s);
  }, []);

  // Close on Escape / outside click; restore focus to the trigger on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

  const set = (patch: Partial<A11yState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      apply(next);
      return next;
    });
  };

  const dark = variant === "app";
  const fg = dark ? "#4d4940" : "#444";
  const surface = "#ffffff";
  const border = dark ? "#dcd5c0" : "#e5e5e0";
  const text = dark ? "#1a1714" : "#1a1a1a";
  const mono = "'IBM Plex Mono', monospace";

  const row = (label: string, desc: string, on: boolean, toggle: () => void, id: string) => (
    <label htmlFor={id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 4px", cursor: "pointer" }}>
      <input id={id} type="checkbox" checked={on} onChange={toggle} style={{ marginTop: 2, width: 16, height: 16, accentColor: "#5e7c4b", cursor: "pointer" }} />
      <span>
        <span style={{ display: "block", fontSize: 13, color: text, fontWeight: 500 }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: "#8c8678", marginTop: 1, lineHeight: 1.4 }}>{desc}</span>
      </span>
    </label>
  );

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        className="sk-a11y-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Accessibility options"
        title="Accessibility options"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none", border: dark ? "none" : `1px solid ${border}`,
          borderRadius: dark ? 4 : 999, padding: dark ? 2 : "6px 12px",
          color: fg, cursor: "pointer", fontSize: dark ? 14 : 13, fontFamily: mono,
          minWidth: 24, minHeight: 24,
        }}
      >
        <span aria-hidden style={{ fontSize: dark ? 15 : 14 }}>♿</span>
        {!dark && <span>Accessibility</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Accessibility options"
          style={{
            position: "absolute", bottom: dark ? "calc(100% + 8px)" : undefined, top: dark ? undefined : "calc(100% + 8px)",
            right: 0, zIndex: 400, width: 268, padding: "10px 14px 14px",
            background: surface, border: `1px solid ${border}`, borderRadius: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8c8678", padding: "2px 0 6px" }}>
            Accessibility
          </div>
          {row("Dyslexia-friendly font", "Switch to a more readable letter shape and spacing.", state.dyslexic, () => set({ dyslexic: !state.dyslexic }), "a11y-dyslexic")}
          {row("Larger text", "Increase the text size across the app.", state.largeText, () => set({ largeText: !state.largeText }), "a11y-large")}
          {row("High contrast", "Darken text and borders for clearer reading.", state.highContrast, () => set({ highContrast: !state.highContrast }), "a11y-contrast")}
          <div style={{ fontSize: 10, color: "#8c8678", marginTop: 6, lineHeight: 1.4 }}>
            Saved on this device.
          </div>
        </div>
      )}
    </div>
  );
}
