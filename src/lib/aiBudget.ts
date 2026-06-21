// Feynman Education — AI cost governance (server-only).
//
// One place for token pricing + budget enforcement, so the generator routes
// stop copy-pasting their own costGBP + daily-cap blocks (analysis P1 #7: "no
// enforced per-org budget or model routing"). Two ceilings, both env-gated and
// fail-OPEN (a read blip must never block authoring; auth is the real gate):
//   AI_DAILY_CAP_GBP        — £/day per teacher   (0 / unset = unlimited)
//   AI_ORG_MONTHLY_CAP_GBP  — £/month per school  (0 / unset = unlimited)
// Model routing lives in serverHelpers.pickModel (Opus authoring, Sonnet bulk).

import { SK_URL, SK_ANON, AI_MODELS } from "@/lib/serverHelpers";

// USD per 1M tokens by model, × GBP/USD. Opus is the conservative default for
// any unknown/aggregated spend (over-counts → only makes a cap stricter).
const GBP_PER_USD = 0.79;
const PRICING: Record<string, { in: number; out: number }> = {
  [AI_MODELS.OPUS]: { in: 5, out: 25 },
  [AI_MODELS.SONNET]: { in: 3, out: 15 },
};

/** £ cost of an input/output token count at a model's rate (defaults to Opus). */
export function costGBP(input: number, output: number, model: string = AI_MODELS.OPUS): number {
  const p = PRICING[model] || PRICING[AI_MODELS.OPUS];
  return (input / 1e6) * p.in * GBP_PER_USD + (output / 1e6) * p.out * GBP_PER_USD;
}

const num = (k: string) => Number(process.env[k]) || 0;
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => new Date().toISOString().slice(0, 7) + "-01";

export interface BudgetVerdict { ok: boolean; status?: number; error?: string; }

/**
 * Enforce the per-teacher daily cap and the per-school monthly cap before an AI
 * call. Both are priced at `model`'s rate (per-teacher) / Opus (org pool, which
 * has no per-call model record). Fails OPEN on any read error.
 */
export async function enforceAiBudget(opts: { userId: string; token: string; model?: string }): Promise<BudgetVerdict> {
  const model = opts.model || AI_MODELS.SONNET;
  const dailyCap = num("AI_DAILY_CAP_GBP");
  const orgCap = num("AI_ORG_MONTHLY_CAP_GBP");
  if (dailyCap <= 0 && orgCap <= 0) return { ok: true };

  // Per-teacher daily spend (RLS: owner reads their own row).
  if (dailyCap > 0) {
    try {
      const r = await fetch(`${SK_URL}/rest/v1/daily_token_usage?teacher_id=eq.${opts.userId}&day=eq.${todayISO()}&select=input_tokens,output_tokens`,
        { headers: { apikey: SK_ANON, Authorization: `Bearer ${opts.token}` } });
      if (r.ok) {
        const row = (await r.json())?.[0] || { input_tokens: 0, output_tokens: 0 };
        const used = costGBP(row.input_tokens || 0, row.output_tokens || 0, model);
        if (used >= dailyCap) {
          return { ok: false, status: 429, error: `Daily AI limit of £${dailyCap.toFixed(2)} reached (used £${used.toFixed(2)}). Resets at midnight UTC.` };
        }
      }
    } catch { /* fail open */ }
  }

  // Per-school month-to-date spend (security-definer roll-up; Opus-priced pool).
  if (orgCap > 0) {
    try {
      const r = await fetch(`${SK_URL}/rest/v1/rpc/school_ai_spend`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: SK_ANON, Authorization: `Bearer ${opts.token}` },
        body: JSON.stringify({ p_since: monthStartISO() }),
      });
      if (r.ok) {
        const row = (await r.json())?.[0];
        if (row) {
          const used = costGBP(row.input_tokens || 0, row.output_tokens || 0, AI_MODELS.OPUS);
          if (used >= orgCap) {
            return { ok: false, status: 429, error: `Your school's monthly AI budget of £${orgCap.toFixed(0)} is used up (£${used.toFixed(2)}). It resets on the 1st.` };
          }
        }
      }
    } catch { /* fail open */ }
  }

  return { ok: true };
}
