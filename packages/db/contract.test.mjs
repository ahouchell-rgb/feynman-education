// The contract test. Fails red if any RPC the apps depend on is missing from the
// unified schema or has drifted from its expected signature — turning what is
// today a SILENT production fallback into a build error.
//
// Named *.test.mjs so `node --test` discovers it. The repo's root vitest is
// scoped to src/**, so this never runs in the app's jsdom suite.
//
// DATABASE_URL: in CI, the ephemeral postgres built by lib/applyMigrations.mjs.
// Locally you can also point it at a read-only anchor URI to prove the live DB
// still honours the contract.

import test from "node:test";
import assert from "node:assert/strict";
import { REQUIRED_RPCS } from "./contracts/rpcs.mjs";
import { makeClient } from "./lib/pg.mjs";
import { checkRpcs } from "./lib/checkRpcs.mjs";

// Skip (don't fail) when there's no DB to check against — so a repo-wide
// `turbo run test` stays green without a Postgres. The dedicated db-contract.yml
// workflow sets DATABASE_URL (ephemeral postgres) and runs this for real.
test("every RPC the apps depend on exists on the unified anchor with the expected signature", { skip: !process.env.DATABASE_URL && "DATABASE_URL unset — run via db-contract workflow" }, async () => {
  const client = makeClient();
  await client.connect();
  try {
    const { missing, mismatched } = await checkRpcs(client, REQUIRED_RPCS);

    assert.equal(
      missing.length,
      0,
      `MISSING RPC(s) — the cross-repo drift bug, caught as a red check:\n` +
        missing.map((m) => `  · ${m.name}(${m.args ?? "?"})  [${m.origin}]`).join("\n")
    );

    assert.equal(
      mismatched.length,
      0,
      `RPC SIGNATURE DRIFT — the schema no longer matches the contract:\n` +
        mismatched
          .map(
            (m) =>
              `  · ${m.name}\n      contract: (${m.args})\n      live:     ${m.live
                .map((s) => `(${s})`)
                .join(" | ")}`
          )
          .join("\n")
    );
  } finally {
    await client.end();
  }
});
