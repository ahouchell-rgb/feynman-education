#!/usr/bin/env node
// Human-facing live check: print the contract status against DATABASE_URL and
// exit non-zero if anything is missing or drifted. Read-only.
//
//   DATABASE_URL="postgres://…anchor-or-readonly-pooler…" npm run verify:live
//
// Doubles as the on-demand "is the live anchor still honouring the contract?"
// check — the same thing the db-contract workflow's verify-live job runs.

import { REQUIRED_RPCS } from "../contracts/rpcs.mjs";
import { makeClient } from "../lib/pg.mjs";
import { checkRpcs } from "../lib/checkRpcs.mjs";

const client = makeClient();
await client.connect();
try {
  const { ok, missing, mismatched } = await checkRpcs(client, REQUIRED_RPCS);

  console.log(`\nRPC contract — ${REQUIRED_RPCS.length} required\n`);
  console.log(`  ok          ${ok.length}`);
  console.log(`  missing     ${missing.length}`);
  console.log(`  mismatched  ${mismatched.length}\n`);

  for (const m of missing) {
    console.log(`  ✗ MISSING     ${m.name}(${m.args ?? "?"})  [${m.origin}]`);
  }
  for (const m of mismatched) {
    console.log(`  ⚠ DRIFT       ${m.name}`);
    console.log(`        contract: (${m.args})`);
    console.log(`        live:     ${m.live.map((s) => `(${s})`).join(" | ")}`);
  }

  if (missing.length === 0 && mismatched.length === 0) {
    console.log("  ✓ all required RPCs present with the expected signatures\n");
  }
  process.exit(missing.length + mismatched.length === 0 ? 0 : 1);
} finally {
  await client.end();
}
