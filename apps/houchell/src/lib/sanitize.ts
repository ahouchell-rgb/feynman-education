import DOMPurify from "dompurify";

// Sanitize user-authored rich text before injecting it via dangerouslySetInnerHTML.
// Units, lessons and decks are SHARED across a department, so a colleague's
// contentEditable HTML (or AI-generated rich text) can carry <script> or
// <img onerror=...> and run in YOUR authenticated session. DOMPurify strips scripts,
// event-handler attributes and javascript: URLs while keeping normal formatting +
// inline styles.
//
// Every call site is a "use client" component rendering client-fetched data, so the
// sanitiser runs in the browser. During SSR there is no window (and no data yet), so
// we return "" — no content is lost (it populates after the client fetch) and no
// unsanitised HTML is ever emitted server-side.
//
// NOTE: KaTeX output (SlideStage EqInner) is generated from latex by KaTeX's own safe
// HTML renderer and is intentionally NOT passed through here — sanitising it would
// strip the math markup.
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(String(html));
}
