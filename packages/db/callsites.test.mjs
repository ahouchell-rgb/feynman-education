// Static call-site contract test — the DB-free half of the cross-repo guard.
//
// Fails red if the houchell app calls an RPC that isn't in the contract, or passes
// a parameter the contract doesn't declare. Unlike contract.test.mjs this needs no
// Postgres, so it runs on every push via `turbo run test` and catches drift the
// moment a call site changes — before it becomes a silent production fallback.
//
// Named *.test.mjs so `node --test` discovers it. Imports only the contract + the
// pure scanner (no `pg`), so it runs even where the DB driver isn't installed.

import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { REQUIRED_RPCS } from "./contracts/rpcs.mjs";
import { scanCallsites, classifyCallsites } from "./lib/scanCallsites.mjs";

const APP_SRC = fileURLToPath(new URL("../../apps/houchell/src", import.meta.url));

test("every RPC the houchell app calls is declared in the contract (no DB)", () => {
  assert.ok(existsSync(APP_SRC), `houchell src not found at ${APP_SRC}`);

  const sites = scanCallsites(APP_SRC);
  assert.ok(sites.length > 0, "scanner found no RPC call sites — the regex or path is wrong");

  const { undeclared, argDrift, uncovered, calledNames } = classifyCallsites(sites, REQUIRED_RPCS);

  assert.equal(
    undeclared.length,
    0,
    `UNDECLARED RPC call site(s) — the app reaches an RPC not in the contract.\n` +
      `Add it to contracts/rpcs.mjs (and ship the migration), or fix the call:\n` +
      undeclared.map((s) => `  · ${s.name}()  ${rel(s.file)}:${s.line}`).join("\n")
  );

  assert.equal(
    argDrift.length,
    0,
    `RPC ARG DRIFT — a call site passes a parameter the contract doesn't declare:\n` +
      argDrift
        .map(
          (s) =>
            `  · ${s.name}(${s.unknown.join(", ")})  ${rel(s.file)}:${s.line}\n` +
            `      contract params: ${s.declared.join(", ") || "(none)"}`
        )
        .join("\n")
  );

  // Informational, not a failure: contract entries this tree never calls (some are
  // consumed by the retrieval app, e.g. parent_report).
  console.log(
    `call-site contract OK — ${sites.length} call sites, ${calledNames.size} distinct RPCs, ` +
      `${REQUIRED_RPCS.length} in contract` +
      (uncovered.length ? ` (not called from houchell: ${uncovered.join(", ")})` : "")
  );
});

const rel = (p) => p.replace(/.*\/apps\//, "apps/");
