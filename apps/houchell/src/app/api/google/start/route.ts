// src/app/api/google/start/route.ts
//
// Step 1 of the Google OAuth dance. Builds the Google sign-in URL and
// redirects the user to it. Mirrors api/microsoft/start. The `state` param
// carries the Supabase user_id so the callback knows which teacher to attach
// the tokens to; we HMAC-sign it so callbacks from elsewhere can't spoof it.
//
// Scope note: we request `drive.file`, NOT the broad `drive`/`drive.readonly`.
// drive.file is the privacy-preserving scope — combined with the Google Picker
// it grants the app access only to the specific files the teacher picks (and
// files the app creates), so no Google security review of the whole Drive is
// needed.

import { NextResponse } from "next/server";
import crypto from "crypto";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
// Reuse the client secret for HMAC if a dedicated state-signing secret isn't set.
const STATE_SECRET = process.env.GOOGLE_STATE_SECRET || process.env.GOOGLE_CLIENT_SECRET;

const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file"];

function signState(payload: Record<string, unknown>) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = crypto.createHmac("sha256", STATE_SECRET!).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export async function GET(req: Request) {
  if (!CLIENT_ID || !STATE_SECRET) {
    return NextResponse.json({ error: "Google OAuth not configured on server" }, { status: 500 });
  }

  const url = new URL(req.url);
  const skUser = url.searchParams.get("sk_user");
  if (!skUser) {
    return NextResponse.json({ error: "Missing sk_user query param" }, { status: 400 });
  }

  const origin = url.origin;
  const redirectUri = `${origin}/api/google/callback`;

  const state = signState({
    u: skUser,
    n: crypto.randomBytes(8).toString("base64url"), // nonce, prevents replay
    t: Date.now(),
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  // access_type=offline + prompt=consent guarantee a refresh_token on first and
  // subsequent connects (Google only returns refresh_token with consent prompt).
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");

  return NextResponse.redirect(authUrl.toString());
}
