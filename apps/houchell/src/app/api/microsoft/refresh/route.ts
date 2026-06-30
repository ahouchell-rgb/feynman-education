// src/app/api/microsoft/refresh/route.js
//
// Server-side refresh: swap the stored refresh_token for a new access_token
// (and updated refresh_token — Microsoft rotates them on each use).
//
// Requires the caller to send their Supabase JWT in Authorization: Bearer ...
// We use that to:
//   1. Identify which teacher is asking
//   2. Look up their microsoft_tokens row
// Then we use SUPABASE_SERVICE_ROLE_KEY to write the new tokens back, since
// the table has no client-write RLS policy.

import { NextResponse } from "next/server";
import { supaRest } from "@/lib/supabaseRest";
import { SK_ANON, SK_URL } from "@/lib/serverHelpers";

const TENANT = process.env.MICROSOFT_TENANT;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

const SK_ANON_KEY = SK_ANON;
const SK_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req) {
  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET || !SK_SERVICE_KEY) {
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
    rows = await supaRest(SK_URL, "microsoft_tokens", {
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

  // Exchange refresh_token for new tokens
  const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
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
    console.error("MS refresh failed:", tokenRes.status, text);
    // If the refresh token is genuinely dead, the user needs to re-connect.
    return NextResponse.json({ error: "refresh_failed", status: tokenRes.status }, { status: 401 });
  }
  const tokenData = await tokenRes.json();
  const newAccess = tokenData.access_token;
  const newRefresh = tokenData.refresh_token || row.refresh_token; // Microsoft sometimes returns the same one
  const expiresIn = Number(tokenData.expires_in) || 3600;
  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

  if (!newAccess) {
    return NextResponse.json({ error: "no_access_token" }, { status: 500 });
  }

  // Persist
  try {
    await supaRest(SK_URL, "microsoft_tokens", {
      method: "PATCH", params: { teacher_id: `eq.${userId}` },
      body: { access_token: newAccess, refresh_token: newRefresh, expires_at: expiresAt, updated_at: new Date().toISOString() },
      apikey: SK_SERVICE_KEY!, bearer: SK_SERVICE_KEY, prefer: "return=minimal",
    });
  } catch {
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  return NextResponse.json({ access_token: newAccess });
}
