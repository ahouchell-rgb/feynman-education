// src/app/api/google/callback/route.ts
//
// Step 2 of the Google OAuth dance. Mirrors api/microsoft/callback. Google
// redirects the user here with a short-lived authorization code. We:
//   1. Verify the signed state (CSRF protection + recovers the sk user_id)
//   2. Exchange the code for access_token + refresh_token (server-side, using
//      the client secret — never exposed to the browser)
//   3. Call the OpenID userinfo endpoint for the user's name + email
//   4. Upsert the tokens into public.google_tokens using the service role
//      (the table has no client-side INSERT/UPDATE policy)
//   5. Redirect the browser back to /?google_connected=1 so Settings can show
//      a success banner.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { supaRest } from "@/lib/supabaseRest";
import { SK_URL } from "@/lib/serverHelpers";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const STATE_SECRET = process.env.GOOGLE_STATE_SECRET || CLIENT_SECRET;

const SK_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function verifyState(stateStr: string | null) {
  if (!stateStr || !stateStr.includes(".")) return null;
  const [b64, sig] = stateStr.split(".");
  const expected = crypto.createHmac("sha256", STATE_SECRET!).update(b64).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (!payload?.u || !payload?.t) return null;
    if (Date.now() - payload.t > STATE_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function errorRedirect(origin: string, code: string) {
  const u = new URL("/", origin);
  u.searchParams.set("google_error", code);
  return NextResponse.redirect(u.toString());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  if (!CLIENT_ID || !CLIENT_SECRET || !SK_SERVICE_KEY) {
    return errorRedirect(origin, "server_misconfigured");
  }

  // Google can send error= if the user denied consent or similar.
  const errorCode = url.searchParams.get("error");
  if (errorCode) return errorRedirect(origin, errorCode);

  const code = url.searchParams.get("code");
  const stateStr = url.searchParams.get("state");
  if (!code || !stateStr) return errorRedirect(origin, "missing_params");

  const state = verifyState(stateStr);
  if (!state) return errorRedirect(origin, "invalid_state");

  const skUserId = state.u;
  const redirectUri = `${origin}/api/google/callback`;

  // 1) Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    console.error("Google token exchange failed:", tokenRes.status, text);
    return errorRedirect(origin, "token_exchange_failed");
  }
  const tokenData = await tokenRes.json();
  // { access_token, refresh_token, expires_in, scope, token_type, id_token }
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = Number(tokenData.expires_in) || 3600;
  const scope = tokenData.scope || "";
  if (!accessToken || !refreshToken) {
    // No refresh_token usually means the user previously consented and Google
    // skipped re-issuing one. prompt=consent in the start route prevents this.
    return errorRedirect(origin, "no_tokens_returned");
  }

  // 2) Fetch the OpenID userinfo for display + stable id
  let gUserId = null, gEmail = null, gName = null;
  try {
    const meRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      gUserId = me.sub || null;
      gEmail = me.email || null;
      gName = me.name || null;
    }
  } catch (e) {
    console.error("Google userinfo fetch failed:", e);
    // Non-fatal — we still have tokens. Continue without display info.
  }

  // 3) Upsert into google_tokens via service role (bypasses RLS)
  const expiresAtIso = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
  const upsertBody = [{
    teacher_id: skUserId,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAtIso,
    scope,
    google_user_id: gUserId,
    google_user_email: gEmail,
    google_display_name: gName,
    updated_at: new Date().toISOString(),
  }];

  try {
    await supaRest(SK_URL, "google_tokens", {
      method: "POST", body: upsertBody, apikey: SK_SERVICE_KEY!, bearer: SK_SERVICE_KEY,
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  } catch (e) {
    console.error("Google tokens upsert failed:", e);
    return errorRedirect(origin, "token_persist_failed");
  }

  // 4) Success — redirect back to a page that closes the loop in the UI
  const success = new URL("/", origin);
  success.searchParams.set("google_connected", "1");
  return NextResponse.redirect(success.toString());
}
