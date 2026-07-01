// Static scan of the app source for every RPC call site — no DB, no network.
//
// The DB contract test (contract.test.mjs) proves the *schema* honours the
// contract. This proves the *app* stays inside it: that every RPC the code calls
// is declared in the contract, and that each call passes only parameters the
// contract knows about. Together they close the cross-repo drift loop from both
// ends — and this half runs on every push (it needs no Postgres), turning a
// silent production fallback into a red check in plain CI.
//
// Scope: the houchell web app only. It is the app that reaches the unified anchor
// through the documented RPC contract. The retrieval app calls its own internal
// RPCs (admin/funnel/etc.) that are deliberately NOT in this contract, so scanning
// it would produce false "undeclared" failures.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every RPC call site reaches the anchor through one of these helper callees
 *  (all ultimately `fetch(.../rest/v1/rpc/${fn})`), or the Supabase client's
 *  `.rpc()`. Match the callee so we don't mistake a table-query helper
 *  (`sk.q("table", {...})`) for an RPC. Longer names first so the alternation
 *  doesn't settle for a prefix. */
const HELPER_CALL =
  /(?<![\w$.])(?:[A-Za-z_$][\w$]*\.)?(?:retRpc|rpcRet|rpcT|rpc|call)\(\s*(["'`])([a-z_][a-z0-9_]*)\1\s*(?:,\s*(\{[^}]*\}))?/g;

/** Direct REST calls: `fetch(`${URL}/rest/v1/rpc/<name>`)`. The name is a literal
 *  here (the dynamic `/rpc/${fn}` forms are caught at the helper call site above). */
const REST_RPC = /\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)/g;

/** Parameter keys are all `p_*` in this schema; pulling only those avoids
 *  mistaking a ternary's `:` for an object key. */
const PARAM_KEY = /\bp_[a-z0-9_]+(?=\s*:)/g;

function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(p));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/**
 * Scan a source tree for RPC call sites.
 * @param {string} root  directory to scan (e.g. apps/houchell/src)
 * @returns {{ file: string, line: number, name: string, argKeys: string[]|null, via: 'helper'|'rest' }[]}
 */
export function scanCallsites(root) {
  /** @type {ReturnType<typeof scanCallsites>} */
  const sites = [];
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");

    for (const m of text.matchAll(HELPER_CALL)) {
      const name = m[2];
      const objLit = m[3];
      const argKeys = objLit ? [...new Set(objLit.match(PARAM_KEY) || [])] : null;
      sites.push({ file, line: lineOf(text, m.index), name, argKeys, via: "helper" });
    }
    for (const m of text.matchAll(REST_RPC)) {
      sites.push({ file, line: lineOf(text, m.index), name: m[1], argKeys: null, via: "rest" });
    }
  }
  return sites;
}

/** The declared parameter names for an RPC, parsed from the contract's identity
 *  args string (`"p_class_id uuid, p_limit integer"` → `["p_class_id","p_limit"]`).
 *  Returns null when the contract opts out of signature assertion (`args: null`). */
export function contractParamNames(argsString) {
  if (argsString == null) return null;
  if (argsString.trim() === "") return [];
  return argsString
    .split(",")
    .map((seg) => seg.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/**
 * Classify call sites against the contract.
 * @param {ReturnType<typeof scanCallsites>} sites
 * @param {import('../contracts/rpcs.mjs').Rpc[]} required
 */
export function classifyCallsites(sites, required) {
  const byName = new Map(required.map((r) => [r.name, r]));

  const undeclared = []; // call site for an RPC not in the contract
  const argDrift = []; // call site passing a param the contract doesn't declare
  const calledNames = new Set();

  for (const site of sites) {
    calledNames.add(site.name);
    const rpc = byName.get(site.name);
    if (!rpc) {
      undeclared.push(site);
      continue;
    }
    if (site.argKeys && site.argKeys.length) {
      const declared = contractParamNames(rpc.args);
      if (declared) {
        const unknown = site.argKeys.filter((k) => !declared.includes(k));
        if (unknown.length) argDrift.push({ ...site, unknown, declared });
      }
    }
  }

  // Contract entries no call site in THIS tree reaches (informational: some are
  // consumed by the retrieval app, e.g. parent_report).
  const uncovered = required.filter((r) => !calledNames.has(r.name)).map((r) => r.name);

  return { undeclared, argDrift, uncovered, calledNames };
}
