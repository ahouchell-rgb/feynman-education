// Apply every migrations/*.sql to DATABASE_URL in ledger (filename) order.
// Used by the db-contract CI job to build the ephemeral Postgres before the
// contract test runs. Filenames are the ledger `version` prefix, so lexical
// sort == apply order.
//
// Prepared-state behaviour: migrations/ currently holds only LEDGER.json +
// README until you seed the SQL bodies (`supabase db pull` against the anchor —
// see migrations/README.md). With no .sql files this exits 0 and records
// seeded=false so CI can skip the contract test rather than fail spuriously.

import { readdirSync, appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeClient } from "./pg.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

function setOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `${key}=${value}\n`);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log(
    "::notice::No SQL migrations seeded yet. Run `supabase db pull` against the " +
      "anchor to populate packages/db/migrations (see migrations/README.md). " +
      "Skipping apply; contract test will be skipped."
  );
  setOutput("seeded", "false");
  process.exit(0);
}

const client = makeClient();
await client.connect();
try {
  console.log(`Applying ${files.length} migration(s) to DATABASE_URL…`);
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    process.stdout.write(`  • ${f} … `);
    await client.query(sql);
    console.log("ok");
  }
  setOutput("seeded", "true");
  console.log("All migrations applied.");
} finally {
  await client.end();
}
