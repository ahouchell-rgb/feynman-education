// Houchell Education — tiny, dependency-free error capture (server-only).
//
// reportError(err, ctx) gives the cron + dashboard routes one place to send
// failures. If SENTRY_DSN is set it POSTs a minimal event straight to Sentry's
// store endpoint over plain fetch (no @sentry/* dependency); otherwise it falls
// back to a single structured console.error line so failures are at least
// greppable in the Vercel logs. Always best-effort — capture must never throw.

type Ctx = Record<string, unknown>;

/** Parse a Sentry DSN into the store endpoint + auth header pieces. */
function parseDsn(dsn: string): { url: string; publicKey: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      publicKey: u.username,
    };
  } catch {
    return null;
  }
}

async function sendToSentry(dsn: string, err: unknown, ctx: Ctx): Promise<boolean> {
  const parsed = parseDsn(dsn);
  if (!parsed) return false;
  const e = err instanceof Error ? err : new Error(String(err));
  const event = {
    event_id: globalThis.crypto?.randomUUID?.().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    logger: typeof ctx.route === "string" ? ctx.route : "sciencekit",
    message: e.message,
    exception: { values: [{ type: e.name, value: e.message, stacktrace: e.stack ? { frames: [] } : undefined }] },
    extra: ctx,
  };
  try {
    const r = await fetch(parsed.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_client=sciencekit/0, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(event),
      // keep the request short so a flaky Sentry never stalls a cron job.
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Report an error. Sentry if configured, else a structured console line. Never throws. */
export async function reportError(err: unknown, ctx: Ctx = {}): Promise<void> {
  try {
    const dsn = process.env.SENTRY_DSN;
    if (dsn && (await sendToSentry(dsn, err, ctx))) return;
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(
      JSON.stringify({
        level: "error",
        at: new Date().toISOString(),
        message: e.message,
        stack: e.stack,
        ...ctx,
      }),
    );
  } catch {
    /* capture must never break the caller */
  }
}
