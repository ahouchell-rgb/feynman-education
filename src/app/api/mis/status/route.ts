// Feynman Education — MIS connection status for the integrations screen.
// GET /api/mis/status   Authorization: Bearer <teacher JWT>
// Returns whether the MIS is configured, the connection row, staging counts,
// and the last few sync runs. Read-only; school-member RLS scopes the data.

import { wondeConfigured } from "@/lib/wonde";

export const runtime = "nodejs";

const SK_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function rest(path: string, token: string) {
  const r = await fetch(`${SK_URL}/rest/v1/${path}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return j({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7);

  let connection: any = null, runs: any[] = [], students = 0, contacts = 0, withEmail = 0;
  try {
    connection = (await rest(`mis_connections?select=mis_school_id,status,last_full_sync_at,last_error&limit=1`, token))?.[0] || null;
    if (connection) {
      [runs] = await Promise.all([
        rest(`mis_sync_runs?select=kind,status,counts,error,started_at,finished_at&order=started_at.desc&limit=5`, token),
      ]);
      // Counts via Content-Range (head requests with count=exact).
      const count = async (table: string, filter = "") => {
        const r = await fetch(`${SK_URL}/rest/v1/${table}?select=id${filter}`, { headers: { apikey: SK_ANON, Authorization: `Bearer ${token}`, Prefer: "count=exact", Range: "0-0" } });
        const cr = r.headers.get("content-range") || "*/0";
        return Number(cr.split("/")[1] || 0);
      };
      [students, contacts, withEmail] = await Promise.all([
        count("mis_students"), count("mis_contacts"), count("mis_contacts", "&email=not.is.null"),
      ]);
    }
  } catch { /* tolerate — show what we have */ }

  return j({ configured: wondeConfigured(), connection, counts: { students, contacts, contactsWithEmail: withEmail }, runs });
}
