// src/lib/google.ts
//
// Google Drive client. Pattern mirrors src/lib/ms.ts — a small wrapper that
// handles auth, token refresh, and presents Drive helpers to the rest of the
// app (import a Slides/.pptx file, save a deck back as .pptx).
//
// Token lifecycle:
//   - Access tokens last ~1 hour. Refresh tokens are long-lived and (unlike
//     Microsoft) are NOT rotated by Google, so we keep the original.
//   - We store both in public.google_tokens (one row per teacher).
//   - The CLIENT cannot write that table (RLS blocks it). When an access token
//     expires we call /api/google/refresh, which uses the service role to swap
//     refresh -> new access.
//   - The access_token column IS owner-readable via RLS, because the browser
//     Google Picker needs a live OAuth token.
//
// Public API:
//   google.getStatus(profileId)                  -> { connected, email, name } | null
//   google.disconnect(profileId)                 -> deletes the row (RLS-owner delete)
//   google.startUrl(profileId)                   -> URL to navigate to in order to connect
//   google.getAccessToken(profileId)             -> live OAuth token (refreshes if stale)
//   google.fetchAsPptxBlob(profileId, file)      -> Blob of the file as .pptx
//   google.saveDeckPptx(profileId, {...})        -> { id, name } of the written Drive file

import { sk } from "@/lib/sk";

const REFRESH_ROUTE = "/api/google/refresh";

// MIME types we deal with.
export const SLIDES_MIME = "application/vnd.google-apps.presentation"; // native Google Slides
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
// Picker shows both native Slides and uploaded PowerPoint files.
export const PICKER_MIME_TYPES = `${SLIDES_MIME},${PPTX_MIME}`;

const DRIVE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export const google = {
  getStatus: async (profileId: string | null) => {
    if (!profileId) return null;
    try {
      const rows = await sk.q("google_tokens", {
        params: {
          teacher_id: `eq.${profileId}`,
          select: "teacher_id,google_user_email,google_display_name,expires_at,updated_at",
        },
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return null;
      return {
        connected: true,
        email: row.google_user_email,
        name: row.google_display_name,
        expiresAt: row.expires_at,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  },

  /** Owner deletes their own row (RLS policy "google_tokens_owner_delete"). */
  disconnect: async (profileId: string | null) => {
    if (!profileId) return;
    await sk.del("google_tokens", { teacher_id: `eq.${profileId}` });
  },

  /** The URL Settings navigates to in order to start the OAuth dance. */
  startUrl: (profileId: string) => `/api/google/start?sk_user=${encodeURIComponent(profileId)}`,

  /** Refresh the access token via the server-side route. Returns the new token or null. */
  refreshToken: async (): Promise<string | null> => {
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
   * Read the current access token from the DB, refreshing first if it is
   * expired or expiring within 60s. Returns null if there is no connection.
   */
  getAccessToken: async (profileId: string | null): Promise<string | null> => {
    if (!profileId) return null;
    try {
      const rows = await sk.q("google_tokens", {
        params: { teacher_id: `eq.${profileId}`, select: "access_token,expires_at" },
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.access_token) return null;
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
      if (Date.now() > expiresAt - 60_000) {
        const fresh = await google.refreshToken();
        return fresh || row.access_token; // fall back to old if refresh failed
      }
      return row.access_token;
    } catch {
      return null;
    }
  },

  /**
   * Call the Drive API. Auto-refreshes on 401 once. `raw:true` returns the
   * Response (for binary downloads); otherwise returns parsed JSON or null.
   */
  driveFetch: async (
    profileId: string,
    url: string,
    opts: { method?: string; body?: any; headers?: Record<string, string>; raw?: boolean } = {},
  ): Promise<any> => {
    let token = await google.getAccessToken(profileId);
    if (!token) throw new Error("Google account not connected");

    const full = url.startsWith("http") ? url : `${DRIVE}${url}`;
    const doFetch = (tok: string) =>
      fetch(full, { method: opts.method || "GET", headers: { Authorization: `Bearer ${tok}`, ...(opts.headers || {}) }, body: opts.body });

    let res = await doFetch(token);
    if (res.status === 401) {
      const fresh = await google.refreshToken();
      if (fresh) { token = fresh; res = await doFetch(token); }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Drive ${res.status}: ${text.slice(0, 200)}`);
    }
    if (opts.raw) return res;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  /**
   * Lightweight metadata for a Drive file: { id, name, mimeType, modifiedTime }.
   * `modifiedTime` (RFC-3339) is the change-detection key for linked decks — we
   * only re-import on open when it has moved since the last sync, so opening an
   * unchanged deck costs one cheap metadata call instead of a full re-convert.
   */
  getFileMeta: async (
    profileId: string,
    fileId: string,
  ): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string }> => {
    return await google.driveFetch(
      profileId,
      `/files/${fileId}?fields=id,name,mimeType,modifiedTime&supportsAllDrives=true`,
    );
  },

  /**
   * Download a picked Drive file as a .pptx Blob:
   *   - native Google Slides → Drive `export` (server-side conversion to pptx)
   *   - an existing .pptx     → `alt=media` (raw bytes, no conversion)
   * `file` is what the Picker returns: { id, name, mimeType }.
   */
  fetchAsPptxBlob: async (profileId: string, file: { id: string; mimeType?: string }): Promise<Blob> => {
    const isSlides = file.mimeType === SLIDES_MIME;
    const url = isSlides
      ? `/files/${file.id}/export?mimeType=${encodeURIComponent(PPTX_MIME)}`
      : `/files/${file.id}?alt=media`;
    const res = await google.driveFetch(profileId, url, { raw: true });
    return await res.blob();
  },

  /**
   * Write a deck back to Drive as a .pptx. Updates `fileId` in place when given
   * (the app-managed export), otherwise creates a new file. Returns { id, name }.
   */
  saveDeckPptx: async (
    profileId: string,
    { name, blob, fileId }: { name: string; blob: Blob; fileId?: string | null },
  ): Promise<{ id: string; name: string }> => {
    const fileName = name.endsWith(".pptx") ? name : `${name}.pptx`;

    if (fileId) {
      // Update the existing file's bytes (media-only). Name is left unchanged.
      const out = await google.driveFetch(
        profileId,
        `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media&fields=id,name`,
        { method: "PATCH", headers: { "Content-Type": PPTX_MIME }, body: blob },
      );
      return { id: out.id, name: out.name || fileName };
    }

    // Create a new file via multipart/related (metadata + media in one request).
    const boundary = "feynman" + Math.floor(performance.now()).toString(36);
    const metadata = { name: fileName, mimeType: PPTX_MIME };
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\nContent-Type: ${PPTX_MIME}\r\n\r\n`,
        blob,
        `\r\n--${boundary}--`,
      ],
      { type: `multipart/related; boundary=${boundary}` },
    );
    const out = await google.driveFetch(
      profileId,
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name`,
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    );
    return { id: out.id, name: out.name || fileName };
  },
};
