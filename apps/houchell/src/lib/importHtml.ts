// Import standalone HTML files as full-slide, interactive templates.
// Each file becomes one slide carrying a single full-bleed `html` element whose
// content (CSS + JS) runs live in Present. We don't parse the markup — the page
// is preserved verbatim, so interactive recaps/quizzes keep working.
//
// SECURITY: we deliberately do NOT run this through src/lib/sanitize.ts. That
// sanitiser (DOMPurify) strips <script>/event handlers — which is correct for
// rich text injected via dangerouslySetInnerHTML into the OUR-origin DOM, but
// would gut these widgets, whose entire purpose is to run their own JS. Instead
// the trust boundary is the iframe at render time (SlideStage HtmlFrame): an
// opaque-origin sandbox (no allow-same-origin) so the page can't read the
// teacher's session, plus an injected strict CSP (connect-src/form-action
// 'none') so it can't exfiltrate anything it does reach. The static preview
// (HtmlInner) uses sandbox="" so it can't run at all. The raw text never touches
// our origin's DOM, so sanitising here would only break legitimate decks.
const VW = 960, VH = 540;
let _seq = 0;
const uid = () => "el" + Date.now().toString(36) + (_seq++).toString(36);
const sid = () => "s" + Date.now().toString(36) + (_seq++).toString(36);

const cleanName = (name) => (name || "HTML").replace(/\.(html?|htm)$/i, "").replace(/[_-]+/g, " ").trim();

// Build a full-slide html element + slide from raw HTML text.
export function htmlToSlide(name, html) {
  return {
    id: sid(),
    hideMaster: true, // the template is the whole slide; don't overlay the deck brand frame
    background: "#ffffff",
    elements: [{ id: uid(), type: "html", x: 0, y: 0, width: VW, height: VH, html, title: cleanName(name) }],
  };
}

// Read one or more selected .html files → slides (one per file, in order).
export async function importHtmlFiles(files: FileList | File[]) {
  const arr = Array.from(files || []) as File[];
  const slides = [];
  for (const f of arr) {
    const text = await f.text();
    if (text && text.trim()) slides.push(htmlToSlide(f.name, text));
  }
  if (!slides.length) throw new Error("No HTML content found in the selected file(s).");
  return slides;
}
