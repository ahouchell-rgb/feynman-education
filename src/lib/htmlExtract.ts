// Pull a complete HTML document out of an LLM reply. The feedforward model is asked
// to return its sheet inside a ```html … ``` fence, but models drift: sometimes the
// fence is missing and the doc is emitted raw, sometimes there's surrounding prose.
// Extracted from api/feedforward so this brittle parsing can be unit-tested against
// the formats we actually see — a miss here yields a blank feedforward sheet.
//
// Order of preference: a fenced ```html block, then a raw <!doctype>/<html>…</html>
// document, else the whole (trimmed) reply as a last resort.
export function extractHtml(text: string): string {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const doc = text.match(/<!doctype[\s\S]*<\/html>|<html[\s\S]*<\/html>/i);
  if (doc) return doc[0].trim();
  return text.trim();
}
