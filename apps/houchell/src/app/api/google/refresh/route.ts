// src/app/api/google/refresh/route.ts
//
// Server-side refresh: swap the stored refresh_token for a new access_token.
// Mirrors api/microsoft/refresh. Unlike Microsoft, Google does NOT rotate
// refresh tokens — the refresh response has no refresh_token, so we keep the
// stored one.
//
// Requires the caller to send their Supabase JWT in Authorization: Bearer ...
// We use that to identify the teacher and look up their google_tokens row,
// then use SUPABASE_SERVICE_ROLE_KEY to write the new access token back.

import { NextResponse } from "next/server";
import { supaRest } from "@/lib/supabaseRest";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const SK_URL = process.env.NEXT_PUBLIC_SK_URL || "https://uvzukwoxqhcxaxtzrziy.supabase.co";
const SK_ANON_KEY = process.env.NEXT_PUBLIC_SK_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
const SK_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  if (!CLIENT_ID || !CLIENT_SECRET || !SK_SERVICE_KEY) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "no_bearer" }, { status: 401 });
  }

  // Identify the user via /auth/v1/user — Supabase will reject an invalid JWT.
  const meRes = await fetch(`${SK_URL}/auth/v1/user`, {
    headers: { apikey: SK_ANON_KEY, Authorization: auth },
  });
  if (!meRes.ok) {
    return NextResponse.json({ error: "invalid_jwt" }, { status: 401 });
  }
  const meData = await meRes.json().catch(() => ({}));
  const userId = meData?.id;
  if (!userId) {
    return NextResponse.json({ error: "no_user_id" }, { status: 401 });
  }

  // Fetch the row using service role (bypasses RLS) so we can read refresh_token.
  let rows;
  try {
    rows = await supaRest(SK_URL, "google_tokens", {
      params: { teacher_id: `eq.${userId}`, select: "refresh_token" },
      apikey: SK_SERVICE_KEY!, bearer: SK_SERVICE_KEY,
    });
  } catch {
    return NextResponse.json({ error: "row_lookup_failed" }, { status: 500 });
  }
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.refresh_token) {
    return NextResponse.json({ error: "no_refresh_token" }, { status: 404 });
  }

  // Exchange refresh_token for a new access_token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    console.error("Google refresh failed:", tokenRes.status, text);
    // If the refresh token is genuinely dead/revoked, the user must re-connect.
    return NextResponse.json({ error: "refresh_failed", status: tokenRes.status }, { status: 401 });
  }
  const tokenData = await tokenRes.json();
  const newAccess = tokenData.access_token;
  const expiresIn = Number(tokenData.expires_in) || 3600;
  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

  if (!newAccess) {
    return NextResponse.json({ error: "no_access_token" }, { status: 500 });
  }

  // Persist (Google does not return a new refresh_token — keep the existing one).
  try {
    await supaRest(SK_URL, "google_tokens", {
      method: "PATCH", params: { teacher_id: `eq.${userId}` },
      body: { access_token: newAccess, expires_at: expiresAt, updated_at: new Date().toISOString() },
      apikey: SK_SERVICE_KEY!, bearer: SK_SERVICE_KEY, prefer: "return=minimal",
    });
  } catch {
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  return NextResponse.json({ access_token: newAccess });
}
