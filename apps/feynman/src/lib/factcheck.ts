// Feynman Education — optional, opt-in post-generation fact-check (server-only).
//
// Gated behind AI_FACTCHECK === "1" (default OFF → zero added latency/cost). When
// on, after a route generates its HTML it makes ONE cheap Haiku call comparing the
// output against the curriculum context already in scope (unit content / required
// practical / misconceptions), and returns any claims that context doesn't support.
//
// The result is attached to the JSON response as a NON-BLOCKING `factcheck` field —
// it never alters or blocks the returned HTML. The check fails OPEN: any error (or
// flag off) returns null and the route omits the field entirely.

import { AI_MODELS, callAnthropic, anthropicText } from "@/lib/serverHelpers";

export interface Factcheck {
  ok: boolean;
  notes: string[];
}

const strip = (s: unknown) =>
  String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const SYSTEM = `You are a careful UK secondary-science fact-checker. You are given (a) some CURRICULUM CONTEXT and (b) a GENERATED teaching document. List ONLY claims in the generated document that are NOT supported by, or that contradict, the curriculum context — factual/scientific statements a teacher should double-check. Ignore styling, layout, encouragement, generic exam-technique advice and standard background knowledge; flag only substantive unsupported or contradictory claims.

Respond with ONLY a JSON object, no prose, no backticks:
{"ok": <true if nothing to flag, else false>, "notes": ["short note", ...]}
Keep notes to at most 6, each one short sentence. If everything checks out, return {"ok": true, "notes": []}.`;

/** Run the opt-in fact-check. Returns null when disabled or on any failure
 *  (fail-open). `context` is the curriculum text already built for the main call;
 *  `html` is the generated document. */
export async function maybeFactcheck(args: {
  html: string;
  ctx: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<Factcheck | null> {
  if (process.env.AI_FACTCHECK !== "1") return null;
  const apiKey = args.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const document = strip(args.html).slice(0, 6000);
  const ctx = String(args.ctx || "").slice(0, 6000);
  if (!document || !ctx) return null;

  try {
    const res = await callAnthropic({
      model: AI_MODELS.HAIKU,
      max_tokens: 700,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `CURRICULUM CONTEXT:\n${ctx}\n\nGENERATED DOCUMENT (text only):\n${document}\n\nList unsupported or contradictory claims.` }],
    }, { apiKey, signal: args.signal });
    if (!res.ok) return null; // fail open

    const data = await res.json();
    const text = anthropicText(data).replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    const notes = (Array.isArray(parsed?.notes) ? parsed.notes : [])
      .map((n: unknown) => String(n || "").trim())
      .filter(Boolean)
      .slice(0, 6);
    return { ok: parsed?.ok === true && notes.length === 0, notes };
  } catch {
    return null; // fail open — never block or alter the returned HTML
  }
}
