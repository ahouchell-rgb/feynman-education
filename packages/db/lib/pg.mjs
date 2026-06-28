import pg from "pg";

// One connection helper for the contract test and the live-verify script.
// DATABASE_URL points at whatever you're checking:
//   • CI            → the ephemeral postgres service (built from migrations/)
//   • verify:live   → the anchor or a read-only pooler URI (read-only check)
//   • local rehears → a throwaway Supabase branch
export function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. CI sets it to the postgres service; for verify:live " +
        "export the anchor (or a read-only pooler) URI. Never commit it."
    );
  }
  // Supabase requires TLS; the platform cert isn't in the default CA bundle, so
  // disable verification for *.supabase.co only (we connect outbound, read-only).
  const ssl = /supabase\.(co|com)/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined;
  return new pg.Client({ connectionString, ssl });
}
