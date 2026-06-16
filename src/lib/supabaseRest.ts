/* Framework-agnostic Supabase PostgREST helpers — shared by the browser client
 * (lib/sk) and the server route handlers so URL-building, header assembly and
 * error parsing aren't re-implemented per caller. No React and no Node-only
 * APIs (just fetch + Web URL), so this is safe to import from "use client"
 * modules and from both edge- and node-runtime route handlers. */

export type RestParams = Record<string, string>;

/** Build a PostgREST endpoint URL with query params. */
export function buildRestUrl(baseUrl: string, table: string, params: RestParams = {}): URL {
  const u = new URL(`${baseUrl}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u;
}

/** Assemble REST headers. `single` requests a single-object response; `prefer`
 *  sets the PostgREST Prefer header (e.g. "return=representation"). */
export function restHeaders(opts: {
  apikey: string;
  bearer?: string | null;
  single?: boolean;
  prefer?: string;
  extra?: Record<string, string>;
}): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: opts.apikey,
    Authorization: `Bearer ${opts.bearer || opts.apikey}`,
    ...(opts.extra || {}),
  };
  if (opts.single) h["Accept"] = "application/vnd.pgrst.object+json";
  if (opts.prefer) h["Prefer"] = opts.prefer;
  return h;
}

/** Turn a non-OK PostgREST response into an Error carrying its message. */
export async function restError(r: Response, fallback: string): Promise<Error> {
  const e = await r.json().catch(() => ({} as any));
  return new Error((e && e.message) || fallback);
}

export interface SupaRestOpts {
  method?: string;
  body?: any;
  params?: RestParams;
  apikey: string;
  bearer?: string | null;
  single?: boolean;
  /** Override the Prefer header. Defaults to "return=representation" for POST/PATCH. */
  prefer?: string;
}

/** One-shot PostgREST call with a plain fetch (no token-refresh retry). The
 *  server route handlers use this; the browser client (lib/sk) keeps its own
 *  thin wrapper because it additionally layers session refresh + 401 retry. */
export async function supaRest(baseUrl: string, table: string, opts: SupaRestOpts): Promise<any> {
  const { method = "GET", body, params, apikey, bearer, single, prefer } = opts;
  const pref = prefer ?? ((method === "POST" || method === "PATCH") ? "return=representation" : undefined);
  const r = await fetch(buildRestUrl(baseUrl, table, params), {
    method,
    headers: restHeaders({ apikey, bearer, single, prefer: pref }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw await restError(r, `${method} ${table} failed`);
  if (method === "DELETE" || r.status === 204) return null;
  // Tolerate empty bodies (e.g. Prefer: return=minimal) without throwing.
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
