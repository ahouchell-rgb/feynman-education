// src/app/api/microsoft/callback/route.js
//
// Step 2 of the OAuth dance. Microsoft redirects the user here with a
// short-lived authorization code. We:
//   1. Verify the signed state (CSRF protection + recovers the sk user_id)
//   2. Exchange the code for access_token + refresh_token (server-side, using
//      the client secret — never exposed to the browser)
//   3. Call Graph /me to get the user's display name + email
//   4. Upsert the tokens into public.microsoft_tokens using the service role
//      (the table has no client-side INSERT/UPDATE policy)
//   5. Redirect the browser back to /?ms_connected=1 so Settings can show
//      a success banner.

import { NextResponse } from "next/server";
import crypto from "crypto";

const TENANT = process.env.MICROSOFT_TENANT;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const STATE_SECRET = process.env.MICROSOFT_STATE_SECRET || CLIENT_SECRET;

const SK_URL = process.env.NEXT_PUBLIC_SK_URL || "https://uujbgdwnuspfnvfpdtvr.supabase.co";
const SK_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function verifyState(stateStr) {
  if (!stateStr || !stateStr.includes(".")) return null;
  const [b64, sig] = stateStr.split(".");
  const expected = crypto.createHmac("sha256", STATE_SECRET).update(b64).digest("base64url");
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

function errorRedirect(origin, code) {
  const u = new URL("/", origin);
  u.searchParams.set("ms_error", code);
  return NextResponse.redirect(u.toString());
}

export async function GET(req) {
  const url = new URL(req.url);
  const origin = url.origin;

  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET || !SK_SERVICE_KEY) {
    return errorRedirect(origin, "server_misconfigured");
  }

  // Microsoft can send error= if user denied consent or similar.
  const errorCode = url.searchParams.get("error");
  if (errorCode) {
    return errorRedirect(origin, errorCode);
  }

  const code = url.searchParams.get("code");
  const stateStr = url.searchParams.get("state");
  if (!code || !stateStr) {
    return errorRedirect(origin, "missing_params");
  }

  const state = verifyState(stateStr);
  if (!state) {
    return errorRedirect(origin, "invalid_state");
  }

  const skUserId = state.u;
  const redirectUri = `${origin}/api/microsoft/callback`;

  // 1) Exchange code for tokens
  const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
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
    console.error("MS token exchange failed:", tokenRes.status, text);
    return errorRedirect(origin, "token_exchange_failed");
  }
  const tokenData = await tokenRes.json();
  // { access_token, refresh_token, expires_in, scope, token_type, id_token }
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = Number(tokenData.expires_in) || 3600;
  const scope = tokenData.scope || "";
  if (!accessToken || !refreshToken) {
    return errorRedirect(origin, "no_tokens_returned");
  }

  // 2) Fetch /me for display + stable id
  let msUserId = null, msEmail = null, msName = null;
  try {
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      msUserId = me.id || null;
      msEmail = me.mail || me.userPrincipalName || null;
      msName = me.displayName || null;
    }
  } catch (e) {
    console.error("MS /me fetch failed:", e);
    // Non-fatal — we still have tokens. Continue without display info.
  }

  // 3) Upsert into microsoft_tokens via service role (bypasses RLS)
  const expiresAtIso = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
  const upsertBody = [{
    teacher_id: skUserId,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAtIso,
    scope,
    ms_user_id: msUserId,
    ms_user_email: msEmail,
    ms_display_name: msName,
    updated_at: new Date().toISOString(),
  }];

  const upsertRes = await fetch(`${SK_URL}/rest/v1/microsoft_tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SK_SERVICE_KEY,
      Authorization: `Bearer ${SK_SERVICE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(upsertBody),
  });

  if (!upsertRes.ok) {
    const text = await upsertRes.text().catch(() => "");
    console.error("MS tokens upsert failed:", upsertRes.status, text);
    return errorRedirect(origin, "token_persist_failed");
  }

  // 4) Success — redirect back to a page that closes the loop in the UI
  const success = new URL("/", origin);
  success.searchParams.set("ms_connected", "1");
  return NextResponse.redirect(success.toString());
}
