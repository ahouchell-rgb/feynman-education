"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SK_URL, SK_KEY } from "@/lib/sk";
import { C } from "@/lib/theme";
import { Btn, Inp, Card } from "@/lib/primitives";

const STORAGE_KEY = "sk_auth";

/**
 * Password recovery landing page.
 *
 * Supabase password-recovery emails redirect to <site_url>/#access_token=...&refresh_token=...&type=recovery
 * — note the fragment, not query string. We parse the fragment, validate
 * the token by calling /auth/v1/user, then show a "set new password" form.
 *
 * On successful password update we also stash the session in localStorage
 * so the user is logged in immediately and doesn't have to type the new
 * password again.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [expiresIn, setExpiresIn] = useState(3600);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    // Parse the URL fragment for recovery tokens.
    // Supabase puts them after '#' so they never hit any server log.
    const hash = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const at = params.get("access_token");
    const rt = params.get("refresh_token") || "";
    const exp = parseInt(params.get("expires_in") || "3600", 10);

    if (!at) {
      setParsed(true);
      return;
    }

    setAccessToken(at);
    setRefreshToken(rt);
    setExpiresIn(exp);

    // Validate the token by fetching /user. If it works, the token is good.
    (async () => {
      try {
        const r = await fetch(`${SK_URL}/auth/v1/user`, {
          headers: { apikey: SK_KEY, Authorization: `Bearer ${at}` },
        });
        if (!r.ok) {
          setError("This recovery link has expired or is invalid. Please request a new one.");
          setParsed(true);
          return;
        }
        const d = await r.json();
        setEmail(d?.email || "");
        setTokenValid(true);
      } catch (e) {
        setError("Could not validate recovery link. Please try again.");
      }
      setParsed(true);
    })();
  }, []);

  const submit = async () => {
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      // Update the password via Supabase auth REST API. The access_token
      // from the recovery link authorises this single update.
      const r = await fetch(`${SK_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: SK_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(d.msg || d.error_description || d.error || "Failed to update password.");
      }

      // Save the session so the user is logged in immediately.
      const session = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + expiresIn,
        user: d,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

      // Clear the fragment so the token isn't lying around in history,
      // then go home. AppShell's auth gate will see the session.
      window.history.replaceState(null, "", "/");
      router.push("/");
      // Hard reload so AuthProvider re-hydrates from the new localStorage.
      setTimeout(() => { window.location.href = "/"; }, 50);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: C.bg }}>
      <Card style={{ width: "100%", maxWidth: 420, padding: 28 }}>
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: C.dim, marginBottom: 10 }}>
          ScienceKit
        </div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.01em", color: C.text, marginBottom: 16 }}>
          Set a new password
        </h1>

        {!parsed ? (
          <div style={{ fontSize: 12, fontFamily: C.mono, color: C.dim }}>Checking recovery link…</div>
        ) : !accessToken ? (
          <>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
              This page is for password recovery. Use the link in your recovery email to get here.
            </div>
            <Btn v="ghost" onClick={() => router.push("/login")}>Back to login</Btn>
          </>
        ) : !tokenValid ? (
          <>
            <div style={{ padding: "10px 12px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, fontFamily: C.mono, marginBottom: 14 }}>
              {error || "This recovery link is no longer valid."}
            </div>
            <Btn v="ghost" onClick={() => router.push("/login")}>Back to login</Btn>
          </>
        ) : (
          <>
            {email && (
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16, fontFamily: C.mono }}>
                Account: <span style={{ color: C.text }}>{email}</span>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 6 }}>New password</div>
              <Inp type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontFamily: C.mono, color: C.muted, marginBottom: 6 }}>Confirm password</div>
              <Inp type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>

            {error && (
              <div style={{ padding: "8px 10px", borderRadius: 6, background: C.redS, color: C.red, fontSize: 12, fontFamily: C.mono, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={submit} disabled={busy || !password || !confirm} style={{ flex: 1 }}>
                {busy ? "Updating…" : "Set password & sign in"}
              </Btn>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
