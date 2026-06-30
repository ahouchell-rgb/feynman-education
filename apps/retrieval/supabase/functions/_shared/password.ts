// Staff-account password floor (A2). manage-student creates and resets staff
// accounts through the Supabase admin API (auth.admin.createUser /
// auth.admin.updateUser), which BYPASSES the project's dashboard "leaked password
// protection" — that protection only runs on the normal client signup/password
// flows, not on admin-API writes. This module is the code-side defence that closes
// that gap on the admin path.
//
// Two checks:
//   1. A hard MINIMUM LENGTH FLOOR (10). This is ALWAYS enforced — it needs no
//      network and so can never be skipped.
//   2. A Have I Been Pwned (HIBP) k-anonymity breach check. We SHA-1 the password,
//      send only the first 5 hex chars of the digest to the HIBP range API, and
//      look for our suffix in the response. The full password (and the full hash)
//      never leave this function — HIBP only ever sees a 5-char prefix shared by
//      tens of thousands of hashes, so it cannot learn the password.
//
// FAIL-OPEN ON HIBP OUTAGE (deliberate): if the HIBP request itself fails
// (network error, non-200, timeout) we LOG and ALLOW the password, rather than
// blocking account creation/reset. Rationale: HIBP being unreachable must never
// break staff onboarding or a password reset — that would turn a third-party
// outage into an outage of our own admin tooling. The length floor is enforced
// regardless, so even in the fail-open case the password is never weaker than the
// floor; we only forgo the *additional* breach signal. A password that HIBP
// positively reports as breached is always rejected.

export const MIN_PASSWORD_LENGTH = 10;

// Student-account password floor. Pupils are NOT staff: they hold no third-party
// PII, and a 10-char + HIBP requirement is too heavy for a child's login (and
// would frustrate the classroom reset flow). So students get a MODEST length-only
// floor — a real guard against empty / 1-char passwords, but no breach check.
//
// The floor (6) is deliberately set at or below what generatePassword() in
// manage-student/index.ts can produce: its shortest output is a 4-char word + 2
// digits + 1 symbol = 7 chars. Keeping the floor <= 7 means every legitimately
// bulk-generated student password still satisfies it, so this guard never blocks
// a system-issued credential.
export const MIN_STUDENT_PASSWORD_LENGTH = 6;

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";

// SHA-1 the password and return the uppercase hex digest. HIBP indexes by
// uppercase SHA-1, so we match its casing.
async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// True if the password appears in the HIBP breach corpus. Uses k-anonymity: only
// the 5-char hash prefix is sent. Returns false (i.e. "allow") on ANY HIBP error —
// see the fail-open note at the top of this file.
export async function isPwned(password: string): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(HIBP_RANGE_URL + prefix, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) {
      console.error("HIBP check unavailable (status " + res.status + ") — allowing password (length floor still enforced)");
      return false;
    }
    const text = await res.text();
    // Each line is "<HASH_SUFFIX>:<count>". A real breached match has count > 0
    // (the "Add-Padding" decoy lines are returned with a count of 0).
    for (const line of text.split("\n")) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      const lineSuffix = line.slice(0, sep).trim().toUpperCase();
      if (lineSuffix !== suffix) continue;
      const count = parseInt(line.slice(sep + 1).trim(), 10);
      return Number.isFinite(count) && count > 0;
    }
    return false;
  } catch (e) {
    console.error("HIBP check failed — allowing password (length floor still enforced):", e);
    return false;
  }
}

// Validate a staff password against the length floor and the HIBP breach list.
// Returns an error string suitable for returning to the client, or null if the
// password is acceptable. The length floor is checked first and never depends on
// the network; the HIBP check is fail-open (see top of file).
export async function assertStrongPassword(password: string): Promise<string | null> {
  const pw = String(password ?? "");
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (await isPwned(pw)) {
    return "That password has appeared in a known data breach — please choose a different one";
  }
  return null;
}

// Validate a STUDENT password. Length-only floor (no HIBP, no 10-char staff
// requirement) — see MIN_STUDENT_PASSWORD_LENGTH above for the rationale and why
// the floor is kept consistent with generatePassword(). Returns an error string
// suitable for returning to the client, or null if the password is acceptable.
export function assertStudentPassword(password: string): string | null {
  const pw = String(password ?? "");
  if (pw.length < MIN_STUDENT_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_STUDENT_PASSWORD_LENGTH} characters`;
  }
  return null;
}
