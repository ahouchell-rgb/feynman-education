// Shared AI cost / quota maths. Extracted from the route handlers (chat-with-lesson,
// feedforward, deck-to-questions, slides-assistant) so the pricing constants live in
// ONE place and can be unit-tested — a typo here is a billing error, and the same
// formula was previously copy-pasted (with different rates) into four routes.
//
// `costGBP` is the per-teacher daily-backstop maths: GBP spent for a given number of
// input/output tokens at a model's published per-million-token USD rate.

export const GBP_PER_USD = 0.79;

export interface Rate {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

// USD per million tokens, by model family. Keep in step with Anthropic pricing.
export const RATES = {
  // Sonnet — chat-with-lesson, feedforward, deck-to-questions.
  sonnet: { input: 3, output: 15 } as Rate,
  // Opus (claude-opus-4-8) — slides-assistant whole-deck generation.
  opus: { input: 5, output: 25 } as Rate,
};

/** GBP cost of an Anthropic call given input/output token counts and a rate. */
export function costGBP(input: number, output: number, rate: Rate): number {
  return (input / 1e6) * rate.input * GBP_PER_USD
       + (output / 1e6) * rate.output * GBP_PER_USD;
}

/** Today's date as an ISO yyyy-mm-dd string — the daily-usage bucket key (UTC). */
export const todayISO = (now: Date = new Date()): string => now.toISOString().slice(0, 10);
