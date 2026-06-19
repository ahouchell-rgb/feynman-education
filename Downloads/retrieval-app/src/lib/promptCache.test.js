import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// COST GUARDRAIL — keep both AI markers above Haiku's 4096-token prompt-cache floor.
//
// Each marker sends its whole SYSTEM_PROMPT as a cache_control:ephemeral system prefix
// on EVERY call. BELOW the 4096-token floor the cache silently never writes — there is
// no error, you just pay full input price on every call and cache_read_input_tokens
// stays 0 (a ~10x input-cost regression). The prompts were deliberately built well
// above the floor; this tripwire fails if a careless edit trims one back toward it.
//
// We can't run Anthropic's tokenizer here, so we use a conservative char proxy:
// ~4 chars/token for English => 4096 tokens ≈ 16,384 chars. Current prompts are
// ~19.5–20.6k chars, so this leaves ~3k+ chars of headroom before the test trips.
// The AUTHORITATIVE check remains cache_read_tokens > 0 in ai_usage after deploy —
// this just catches the obvious "someone shortened the prompt" mistake in CI.
const FLOOR_CHARS = 16384; // 4096 tokens × ~4 chars/token

function extractSystemPrompt(relPath) {
  const src = readFileSync(new URL(relPath, import.meta.url), "utf8");
  const m = src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!m) throw new Error(`SYSTEM_PROMPT template literal not found in ${relPath}`);
  return m[1];
}

describe("AI marker prompt-cache floor", () => {
  const markers = [
    ["mark-answer", "../../supabase/functions/mark-answer/index.ts"],
    ["mark-paper-answer", "../../supabase/functions/mark-paper-answer/index.ts"],
  ];
  for (const [label, relPath] of markers) {
    it(`${label} SYSTEM_PROMPT stays above the 4096-token cacheable floor`, () => {
      const len = extractSystemPrompt(relPath).length;
      expect(len, `${label} SYSTEM_PROMPT is ${len} chars — below the ${FLOOR_CHARS}-char (~4096-token) cache floor; prompt caching will silently turn off`).toBeGreaterThanOrEqual(FLOOR_CHARS);
    });
  }
});
