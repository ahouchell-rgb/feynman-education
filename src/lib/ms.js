// src/lib/ms.js
//
// Microsoft Graph client. Pattern mirrors src/lib/sk.js — a small wrapper
// that handles auth, token refresh, and presents nicer helpers to the rest
// of the app.
//
// Token lifecycle:
//   - Access tokens last ~1 hour. Refresh tokens last ~90 days but get
//     renewed every time we use them.
//   - We store both in public.microsoft_tokens (one row per teacher).
//   - The CLIENT cannot directly write to that table (RLS blocks it).
//     So when an access token expires, we call /api/microsoft/refresh
//     which uses the service role to swap refresh -> new access+refresh.
//
// Public API used elsewhere in the app:
//   ms.getStatus(profileId)               -> { connected: bool, email, name } | null
//   ms.disconnect(profileId)              -> deletes the row (RLS-owner delete)
//   ms.startUrl(profileId)                -> string URL to navigate to in order to connect
//   ms.graphFetch(profileId, path, opts)  -> fetch wrapper, auto-refreshes on 401

import { sk } from "@/lib/sk";

const REFRESH_ROUTE = "/api/microsoft/refresh";

export const ms = {
  /**
   * Returns connection status for the given profile, or null if not connected.
   * The token columns are owner-readable via RLS, but we don't actually
   * read access_token here — only the display fields.
   */
  getStatus: async (profileId) => {
    if (!profileId) return null;
    try {
      const rows = await sk.q("microsoft_tokens", {
        params: {
          teacher_id: `eq.${profileId}`,
          select: "teacher_id,ms_user_email,ms_display_name,expires_at,updated_at",
        },
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return null;
      return {
        connected: true,
        email: row.ms_user_email,
        name: row.ms_display_name,
        expiresAt: row.expires_at,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  },

  /**
   * Owner deletes their own row. RLS policy "ms_tokens_owner_delete" allows
   * the teacher to delete iff teacher_id = auth.uid().
   */
  disconnect: async (profileId) => {
    if (!profileId) return;
    await sk.del("microsoft_tokens", { teacher_id: `eq.${profileId}` });
  },

  /**
   * The URL Settings should navigate to in order to start the OAuth dance.
   */
  startUrl: (profileId) => `/api/microsoft/start?sk_user=${encodeURIComponent(profileId)}`,

  /**
   * Refresh the access token via the server-side refresh route. Returns
   * the new access token on success, null on failure.
   */
  refreshToken: async () => {
    try {
      const r = await fetch(REFRESH_ROUTE, {
        method: "POST",
        headers: { Authorization: `Bearer ${sk.auth.getToken() || ""}` },
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d.access_token || null;
    } catch {
      return null;
    }
  },

  /**
   * Fetch the current access token from the DB. Server-side refresh route
   * keeps this current; client just reads it. Returns null if no row.
   * Note: the access_token column is RLS-protected to owner only.
   */
  getAccessToken: async (profileId) => {
    if (!profileId) return null;
    try {
      const rows = await sk.q("microsoft_tokens", {
        params: { teacher_id: `eq.${profileId}`, select: "access_token,expires_at" },
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.access_token) return null;
      // If expired or expiring within 30s, refresh first
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
      if (Date.now() > expiresAt - 30_000) {
        const fresh = await ms.refreshToken();
        return fresh || row.access_token; // fall back to old if refresh failed
      }
      return row.access_token;
    } catch {
      return null;
    }
  },

  /**
   * Call Microsoft Graph. Auto-refreshes on 401 once.
   *   path: e.g. "/me" or "/me/drive/root/children"
   *   opts: { method, body, headers, raw? }
   */
  graphFetch: async (profileId, path, opts = {}) => {
    let token = await ms.getAccessToken(profileId);
    if (!token) throw new Error("Microsoft account not connected");

    const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(opts.body && !opts.raw ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    };
    let res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body && !opts.raw ? JSON.stringify(opts.body) : opts.body,
    });

    if (res.status === 401) {
      const fresh = await ms.refreshToken();
      if (fresh) {
        headers.Authorization = `Bearer ${fresh}`;
        res = await fetch(url, {
          method: opts.method || "GET",
          headers,
          body: opts.body && !opts.raw ? JSON.stringify(opts.body) : opts.body,
        });
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Graph ${path} failed: ${res.status} ${text}`);
    }
    if (opts.raw) return res;
    // Some endpoints return empty body
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },
};
