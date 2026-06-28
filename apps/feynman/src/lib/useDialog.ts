"use client";
import { useEffect, useRef } from "react";

/**
 * Accessible dialog plumbing (WCAG 2.1.2 / 2.4.3 / 4.1.2).
 *
 * Attach the returned ref to the dialog container (the element that should carry
 * role="dialog" aria-modal="true"). The hook then:
 *   - moves focus into the dialog on open (first focusable, else the container),
 *   - traps Tab / Shift+Tab within the dialog,
 *   - closes on Escape,
 *   - restores focus to whatever was focused before the dialog opened, on close.
 *
 * Backward-compatible: callers that already handle Escape themselves keep
 * working — calling onClose twice is harmless (it just closes once).
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    const previouslyFocused = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;

    // Move focus inside on open.
    const focusFirst = () => {
      if (!node) return;
      const list = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      (list[0] || node).focus();
    };
    // Container needs to be focusable as a fallback target.
    if (node && !node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
    focusFirst();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) { e.preventDefault(); node.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Restore focus to the opener on unmount/close.
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
