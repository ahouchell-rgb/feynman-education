// Houchell Education — fork a shared deck into the signed-in teacher's account.
// POST /api/deck/fork   Authorization: Bearer <teacher JWT>   Body: { token }
// Returns: { deckId }
//
// The growth loop's second half: anyone can VIEW a public deck via its share
// link; signing in and "Make a copy" deep-clones it into their own decks. We do
// this server-side so the source lookup is gated on is_public (not the caller's
// RLS, since a visitor never owns the source) while the INSERT runs under the
// teacher's own JWT — so `owner` defaults to auth.uid() and the new row obeys the
// same owner RLS as any deck they create. The clone strips share/Drive linkage
// and re-mints fresh slide + element ids so the copy is fully independent of the
// original (editing it can never touch the shared deck).

import { supaRest } from "@/lib/supabaseRest";
import { SK_URL, SK_ANON, bearerToken, requireUserId, json } from "@/lib/serverHelpers";
import { ensureIds, uid } from "@/components/slideEditor/constants";

export const runtime = "nodejs";

const sb = (table: string, opts: any, token?: string | null) =>
  supaRest(SK_URL, table, { apikey: SK_ANON, bearer: token, ...opts });

export async function POST(req: Request) {
  const token = bearerToken(req);
  if (!token) return json({ error: "Sign in to make a copy." }, 401);
  const userId = await requireUserId(token);
  if (!userId) return json({ error: "Sign in to make a copy." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const shareToken = typeof body?.token === "string" ? body.token.trim() : "";
  if (!shareToken) return json({ error: "Missing share token" }, 400);

  // Load the source by token, gated on is_public. Read with the anon key so we
  // rely on the decks_public_read policy rather than the caller's ownership.
  let src: any;
  try {
    src = await sb("decks", {
      params: { share_token: `eq.${shareToken}`, is_public: "eq.true", select: "title,slides,theme,master", limit: "1" },
    });
  } catch (e: any) {
    return json({ error: `Couldn't load the shared deck: ${e.message}` }, 500);
  }
  const deck = Array.isArray(src) ? src[0] : src;
  if (!deck) return json({ error: "This deck is no longer shared." }, 404);

  // Deep-clone with fresh slide + element ids (same helper the editor uses when
  // duplicating). Strip share/public/Drive linkage so the copy is independent.
  const slides = ensureIds(
    (deck.slides || []).map((s: any) => ({ ...s, id: uid(), elements: (s.elements || []).map((e: any) => ({ ...e, id: uid() })) }))
  );
  const clone: any = {
    title: `${deck.title || "Untitled deck"} (copy)`,
    slides,
    theme: deck.theme ?? null,
    master: deck.master ?? null,
    is_public: false,
    share_token: null,
  };

  // Insert under the teacher's JWT so `owner` defaults to auth.uid() + owner RLS
  // applies — the new deck is fully theirs.
  let created: any;
  try {
    const rows = await sb("decks", { method: "POST", body: clone }, token);
    created = Array.isArray(rows) ? rows[0] : rows;
  } catch (e: any) {
    return json({ error: `Couldn't save your copy: ${e.message}` }, 500);
  }
  if (!created?.id) return json({ error: "Copy failed." }, 500);

  return json({ deckId: created.id });
}
