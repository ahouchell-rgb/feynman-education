// Pure-ish check: given a connected pg client and the contract, classify each
// required RPC as ok / missing / mismatched. No assertions here so it can back
// both the test (assert) and the verify script (print) without duplication.

/**
 * @param {import('pg').Client} client
 * @param {import('../contracts/rpcs.mjs').Rpc[]} required
 */
export async function checkRpcs(client, required) {
  const names = [...new Set(required.map((r) => r.name))];
  const { rows } = await client.query(
    `select p.proname,
            pg_get_function_identity_arguments(p.oid) as args
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = any($1::text[])`,
    [names]
  );

  /** @type {Map<string,string[]>} */
  const live = new Map();
  for (const r of rows) {
    if (!live.has(r.proname)) live.set(r.proname, []);
    live.get(r.proname).push(r.args);
  }

  const missing = [];
  const mismatched = [];
  const ok = [];
  for (const r of required) {
    const sigs = live.get(r.name);
    if (!sigs || sigs.length === 0) {
      missing.push(r);
    } else if (r.args !== null && !sigs.includes(r.args)) {
      mismatched.push({ ...r, live: sigs });
    } else {
      ok.push(r);
    }
  }
  return { ok, missing, mismatched };
}
