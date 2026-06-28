#!/usr/bin/env node
// Cross-check the seeded migrations/ against the canonical anchor ledger.
//
// LEDGER.json is the exact list of migrations applied on the live anchor
// (captured via `supabase migrations list` / the management API). Once you seed
// the SQL bodies, every ledger `version` should have a matching
// migrations/<version>_*.sql, and every .sql should be in the ledger. This flags
// gaps in either direction so the repo can't silently diverge from production.
//
//   npm run check:ledger

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, "..", "migrations");

const ledger = JSON.parse(readFileSync(join(migDir, "LEDGER.json"), "utf8"));
const ledgerVersions = new Set(ledger.migrations.map((m) => m.version));

const files = readdirSync(migDir).filter((f) => f.endsWith(".sql"));
const fileVersions = new Set(files.map((f) => f.split("_")[0]));

if (files.length === 0) {
  console.log(
    `Ledger has ${ledgerVersions.size} migrations; migrations/ holds 0 .sql files yet.\n` +
      `Seed them with \`supabase db pull\` against the anchor (see migrations/README.md).`
  );
  process.exit(0);
}

const missingBodies = [...ledgerVersions].filter((v) => !fileVersions.has(v)).sort();
const notInLedger = [...fileVersions].filter((v) => !ledgerVersions.has(v)).sort();

if (missingBodies.length) {
  console.log(`\n✗ ${missingBodies.length} ledger version(s) have no .sql body:`);
  for (const v of missingBodies) {
    const m = ledger.migrations.find((x) => x.version === v);
    console.log(`    ${v}  ${m?.name ?? ""}`);
  }
}
if (notInLedger.length) {
  console.log(`\n⚠ ${notInLedger.length} local .sql not in the ledger (drift from prod):`);
  for (const v of notInLedger) console.log(`    ${v}`);
}
if (!missingBodies.length && !notInLedger.length) {
  console.log(`✓ migrations/ matches the anchor ledger (${ledgerVersions.size} migrations).`);
}
process.exit(missingBodies.length + notInLedger.length === 0 ? 0 : 1);
