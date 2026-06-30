// Single source of truth for the Supabase project URL + anon key in the
// retrieval app. Side-effect-free and safe to import from client, server (Node)
// and edge runtimes alike — it only reads env and exposes two constants.
//
// The anon key is public by design (it ships in the browser bundle and RLS is
// what protects data), but reading both from NEXT_PUBLIC_SUPA_* env lets you
// rotate the key / point at a different project without code changes. The
// literals below are the current production values, kept as fallbacks so
// existing deployments keep working unchanged when the env vars aren't set.
export const SUPA_URL = process.env.NEXT_PUBLIC_SUPA_URL || "https://uvzukwoxqhcxaxtzrziy.supabase.co";
export const SUPA_ANON = process.env.NEXT_PUBLIC_SUPA_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
