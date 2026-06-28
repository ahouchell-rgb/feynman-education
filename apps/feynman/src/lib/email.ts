// Feynman Education — minimal transactional email (server-only).
//
// Env-gated, like the AI calls: if RESEND_API_KEY isn't set we no-op and report
// `sent:false` so callers (the parent-report cron) persist the report and carry
// on without failing. Resend is used via plain fetch (no SDK dependency).
//   RESEND_API_KEY      — secret from resend.com
//   PARENT_REPORT_FROM  — verified From address, e.g. "Feynman <hi@feynman.education>"

export interface SendEmailResult { sent: boolean; id?: string; error?: string; }

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.PARENT_REPORT_FROM);
}

export async function sendEmail(opts: {
  to: string; subject: string; html: string; from?: string;
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = opts.from || process.env.PARENT_REPORT_FROM;
  if (!key || !from) return { sent: false, error: "email not configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    if (!r.ok) return { sent: false, error: `resend ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
    const d = await r.json().catch(() => ({}));
    return { sent: true, id: d?.id };
  } catch (e: any) {
    return { sent: false, error: e?.message || "send failed" };
  }
}
