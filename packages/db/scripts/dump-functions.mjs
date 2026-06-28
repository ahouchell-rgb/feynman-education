#!/usr/bin/env node
// Dump the LIVE definitions of the contract RPCs + auth/role helper functions
// from the anchor into packages/db/live-defs/<name>.sql — so the out-of-band
// schema (functions that today exist ONLY on the live DB, applied directly to
// the anchor and never committed) becomes reviewable source. This is the
// keystone for Phase 5: you can't write/review the slt/trust scope predicates
// until the existing is_moderator/is_hod helpers are visible in the repo.
//
// Read-only. Needs DATABASE_URL pointed at the anchor (a read-only pooler URI
// is ideal). See docs/SCHEMA_RECONCILIATION.md.
//
//   DATABASE_URL="postgres://…anchor…" node scripts/dump-functions.mjs
//
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { REQUIRED_RPCS } from "../contracts/rpcs.mjs";
import { makeClient } from "../lib/pg.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "live-defs");
mkdirSync(outDir, { recursive: true });

const rpcNames = [...new Set(REQUIRED_RPCS.map((r) => r.name))];

const client = makeClient();
await client.connect();
try {
  // Capture: every contract RPC by exact name, plus anything that looks like an
  // authZ helper (is_*/current_*/has_*/auth_*/user_* or *_role/_scope/_school/_trust).
  const { rows } = await client.query(
    `select p.proname as name,
            pg_get_function_identity_arguments(p.oid) as args,
            p.prosecdef as security_definer,
            pg_get_functiondef(p.oid) as def
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and ( p.proname = any($1::text[])
              or p.proname ~ '^(is_|current_|has_|auth_|user_)'
              or p.proname ~ '(_role|_scope|_school|_trust)$' )
      order by p.proname`,
    [rpcNames]
  );

  if (!rows.length) {
    console.error("No matching functions found — does DATABASE_URL point at the anchor?");
    process.exit(1);
  }

  const contractSet = new Set(rpcNames);
  const seen = new Map();
  let nContract = 0, nHelper = 0;
  for (const r of rows) {
    const isContract = contractSet.has(r.name);
    isContract ? nContract++ : nHelper++;
    const n = seen.get(r.name) || 0;
    seen.set(r.name, n + 1);
    const fname = n === 0 ? r.name : `${r.name}__${n}`; // disambiguate overloads
    const header =
      `-- ${r.name}(${r.args})\n` +
      `-- ${isContract ? "CONTRACT RPC" : "auth/role helper"} · SECURITY DEFINER=${r.security_definer}\n` +
      `-- read-only snapshot of the LIVE anchor for reconciliation — see docs/SCHEMA_RECONCILIATION.md\n` +
      `-- NOT a migration; do not apply. Promote into packages/db/migrations once reconciled.\n\n`;
    writeFileSync(join(outDir, `${fname}.sql`), header + r.def + "\n");
  }

  console.log(`Wrote ${rows.length} function definition(s) to packages/db/live-defs/`);
  console.log(`  contract RPCs:     ${nContract}/${rpcNames.length}`);
  console.log(`  auth/role helpers: ${nHelper}`);
  const got = new Set(rows.map((r) => r.name));
  const missing = rpcNames.filter((n) => !got.has(n));
  if (missing.length) console.log(`  ⚠ contract RPCs NOT found on this DB: ${missing.join(", ")}`);
} finally {
  await client.end();
}
