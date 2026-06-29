// src/app/api/microsoft/start/route.js
//
// Step 1 of the OAuth dance. Builds the Microsoft sign-in URL and redirects
// the user to it. The `state` param carries the Supabase user_id so the
// callback knows which teacher to attach the tokens to. We HMAC-sign the
// state with a shared secret so callbacks from elsewhere can't spoof it.

import { NextResponse } from "next/server";
import crypto from "crypto";

const TENANT = process.env.MICROSOFT_TENANT;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
// Reuse client secret for HMAC if a dedicated state-signing secret isn't set.
const STATE_SECRET = process.env.MICROSOFT_STATE_SECRET || process.env.MICROSOFT_CLIENT_SECRET;

const SCOPES = ["openid", "profile", "offline_access", "User.Read", "Files.ReadWrite"];

function signState(payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = crypto.createHmac("sha256", STATE_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export async function GET(req) {
  if (!TENANT || !CLIENT_ID || !STATE_SECRET) {
    return NextResponse.json({ error: "Microsoft OAuth not configured on server" }, { status: 500 });
  }

  const url = new URL(req.url);
  const skUser = url.searchParams.get("sk_user");
  if (!skUser) {
    return NextResponse.json({ error: "Missing sk_user query param" }, { status: 400 });
  }

  const origin = url.origin;
  const redirectUri = `${origin}/api/microsoft/callback`;

  const state = signState({
    u: skUser,
    n: crypto.randomBytes(8).toString("base64url"), // nonce, prevents replay
    t: Date.now(),
  });

  const authUrl = new URL(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl.toString());
}
