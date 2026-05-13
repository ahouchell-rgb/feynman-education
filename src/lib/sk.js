"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

/* ─── Config ─── */
export const SK_URL  = "https://uujbgdwnuspfnvfpdtvr.supabase.co";
export const SK_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1amJnZHdudXNwZm52ZnBkdHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjgyODksImV4cCI6MjA5MDIwNDI4OX0.eMMhPSXTsTMEgnXloEnQpcGpQAwHHI-eHCLapRdSOV4";
export const RET_URL = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
export const RET_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
export const SK_API_KEY = "MIHy7pb5UoumNqcqxkGfAREqRQkWFP64M1eYPsvc5oo";

const STORAGE_KEY = "sk_auth";
const REFRESH_BUFFER_MS = 60 * 1000; // refresh 60s before expiry

/* ─── Session storage ─── */
const readSession = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const writeSession = (s) => {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
};

/* ─── Module-level token holder, kept in sync with context ─── */
let _session = null;
const getToken = () => _session?.access_token || null;
const setSession = (s) => {
  _session = s;
  writeSession(s);
};

/* ─── HTTP helpers ─── */
const h = (extra = {}) => ({
  "Content-Type": "application/json",
  apikey: SK_KEY,
  Authorization: `Bearer ${getToken() || SK_KEY}`,
  ...extra,
});

const refreshAccessToken = async () => {
  if (!_session?.refresh_token) return null;
  try {
    const r = await fetch(`${SK_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SK_KEY },
      body: JSON.stringify({ refresh_token: _session.refresh_token }),
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) throw new Error("refresh failed");
    const updated = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      user: d.user || _session.user,
    };
    setSession(updated);
    return updated;
  } catch (e) {
    setSession(null);
    return null;
  }
};

const ensureFreshToken = async () => {
  if (!_session) return;
  const now = Math.floor(Date.now() / 1000);
  if (_session.expires_at && _session.expires_at * 1000 - Date.now() < REFRESH_BUFFER_MS) {
    await refreshAccessToken();
  }
};

/* ─── REST client ─── */
const skFetch = async (input, init = {}) => {
  await ensureFreshToken();
  let r = await fetch(input, init);
  if (r.status === 401 && _session?.refresh_token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // retry once with new token
      const newInit = { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${refreshed.access_token}` } };
      r = await fetch(input, newInit);
    }
  }
  return r;
};

export const sk = {
  q: async (tbl, { method = "GET", body, params = {}, single } = {}) => {
    const u = new URL(`${SK_URL}/rest/v1/${tbl}`);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const hd = h();
    if (single) hd["Accept"] = "application/vnd.pgrst.object+json";
    if (method === "POST" || method === "PATCH") hd["Prefer"] = "return=representation";
    const r = await skFetch(u, { method, headers: hd, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `${method} ${tbl} failed`); }
    if (method === "DELETE") return null;
    return r.json();
  },

  del: async (tbl, p = {}) => {
    const u = new URL(`${SK_URL}/rest/v1/${tbl}`);
    Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, v));
    await skFetch(u, { method: "DELETE", headers: h() });
  },

  upload: async (path, file) => {
    await ensureFreshToken();
    const r = await fetch(`${SK_URL}/storage/v1/object/resources/${path}`, {
      method: "POST",
      headers: { apikey: SK_KEY, Authorization: `Bearer ${getToken() || SK_KEY}`, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Upload failed"); }
    return `${SK_URL}/storage/v1/object/public/resources/${path}`;
  },

  rpc: async (fn, body = {}) => {
    const r = await skFetch(`${SK_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `RPC ${fn} failed`); }
    return r.json();
  },

  storageDelete: async (path) => {
    await ensureFreshToken();
    await fetch(`${SK_URL}/storage/v1/object/resources/${path}`, {
      method: "DELETE",
      headers: { apikey: SK_KEY, Authorization: `Bearer ${getToken() || SK_KEY}` },
    });
  },

  auth: {
    signIn: async (email, pw) => {
      const r = await fetch(`${SK_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SK_KEY },
        body: JSON.stringify({ email, password: pw }),
      });
      const d = await r.json();
      if (!r.ok || !d.access_token) throw new Error(d.error_description || "Login failed");
      const s = {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
        user: d.user,
      };
      setSession(s);
      return s;
    },
    signUp: async (email, pw, name) => {
      const r = await fetch(`${SK_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SK_KEY },
        body: JSON.stringify({ email, password: pw, data: { full_name: name } }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error?.message || "Signup failed");
      if (d.access_token) {
        const s = {
          access_token: d.access_token,
          refresh_token: d.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
          user: d.user,
        };
        setSession(s);
      }
      return d;
    },
    out: () => setSession(null),
    user: () => _session?.user || null,
    getToken,
    getSession: () => _session,
  },
};

/* ─── Retrieval-app helper (separate Supabase, anon-only reads) ─── */
export const ret = {
  fetchClasses: async () => {
    try {
      const r = await fetch(`${RET_URL}/rest/v1/classes?select=id,name,join_code&order=name.asc`, {
        headers: { apikey: RET_KEY, Authorization: `Bearer ${RET_KEY}` },
      });
      return r.ok ? r.json() : [];
    } catch { return []; }
  },
};

/* ─── Misc helpers ─── */
export const pubUrl = (path) => `${SK_URL}/storage/v1/object/public/resources/${path}`;
export const officeUrl = (url) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;

/* ─── React auth context ─── */
const AuthCtx = createContext({ user: null, profile: null, loading: true });

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: true });

  const hydrate = useCallback(async () => {
    const stored = readSession();
    if (!stored) { setState({ user: null, profile: null, loading: false }); return; }
    _session = stored;
    // If expired, try refresh; on failure clear
    const now = Math.floor(Date.now() / 1000);
    if (stored.expires_at && stored.expires_at <= now) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) { setState({ user: null, profile: null, loading: false }); return; }
    }
    let profile = null;
    try { profile = await sk.q("profiles", { params: { id: `eq.${_session.user.id}` }, single: true }); }
    catch { profile = { id: _session.user.id, role: "teacher", full_name: _session.user.email }; }
    setState({ user: _session.user, profile, loading: false });
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Periodic refresh check (every 5 min)
  useEffect(() => {
    if (!state.user) return;
    const t = setInterval(() => { ensureFreshToken(); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [state.user]);

  const login = async (email, pw) => {
    await sk.auth.signIn(email, pw);
    let profile;
    try { profile = await sk.q("profiles", { params: { id: `eq.${_session.user.id}` }, single: true }); }
    catch { profile = { id: _session.user.id, role: "teacher", full_name: email }; }
    setState({ user: _session.user, profile, loading: false });
    return profile;
  };

  const signup = async (email, pw, name) => {
    const res = await sk.auth.signUp(email, pw, name);
    if (!res.access_token) return { needsConfirmation: true };
    let profile;
    try { profile = await sk.q("profiles", { params: { id: `eq.${_session.user.id}` }, single: true }); }
    catch { profile = { id: _session.user.id, role: "teacher", full_name: name || email }; }
    setState({ user: _session.user, profile, loading: false });
    return { profile };
  };

  const logout = () => {
    sk.auth.out();
    setState({ user: null, profile: null, loading: false });
  };

  const setProfile = (p) => setState(s => ({ ...s, profile: p }));

  return (
    <AuthCtx.Provider value={{ ...state, login, signup, logout, setProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
