"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { buildRestUrl, restError } from "./supabaseRest";

/* ─── Config — UNIFIED (Phase 3): one project = the retrieval-app anchor. ───
   The teacher app's data + auth now live in the anchor, so SK_* point there.
   RET_* are kept as aliases (retrieval IS the anchor) so existing imports compile.
   SK_API_KEY (the x-sciencekit-key shared secret) is retained ONLY for the server
   cron's service path until those RPCs are re-gated by role (Phase 5); client calls
   no longer send it. */
export const SK_URL  = "https://uvzukwoxqhcxaxtzrziy.supabase.co";
export const SK_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2enVrd294cWhjeGF4dHpyeml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDUyNTIsImV4cCI6MjA4OTkyMTI1Mn0.PtT24EfMfTckYaq9jXBPRuCsG6utWMLcHs9H8buM70c";
export const RET_URL = SK_URL;
export const RET_KEY = SK_KEY;
export const SK_API_KEY = "MIHy7pb5UoumNqcqxkGfAREqRQkWFP64M1eYPsvc5oo";

const STORAGE_KEY = "sk_auth";
const REFRESH_BUFFER_MS = 60 * 1000; // refresh 60s before expiry

/* ─── Types ─── */
export interface SkUser { id: string; email?: string; [k: string]: any; }
export interface SkSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: SkUser;
}
export interface QueryOpts {
  method?: string;
  body?: any;
  params?: Record<string, string>;
  single?: boolean;
}
export type Profile = any;
interface AuthState { user: SkUser | null; profile: Profile; loading: boolean; }
interface AuthValue extends AuthState {
  login: (email: string, pw: string) => Promise<Profile>;
  signup: (email: string, pw: string, name?: string) => Promise<{ needsConfirmation?: boolean; profile?: Profile }>;
  logout: () => void;
  setProfile: (p: Profile) => void;
}

/* ─── Session storage ─── */
const readSession = (): SkSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const writeSession = (s: SkSession | null) => {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
};

/* ─── Module-level token holder, kept in sync with context ─── */
let _session: SkSession | null = null;
const getToken = () => _session?.access_token || null;
const setSession = (s: SkSession | null) => {
  _session = s;
  writeSession(s);
};

/* ─── HTTP helpers ─── */
const h = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: SK_KEY,
  Authorization: `Bearer ${getToken() || SK_KEY}`,
  ...extra,
});

const refreshAccessToken = async (): Promise<SkSession | null> => {
  if (!_session?.refresh_token) return null;
  try {
    const r = await fetch(`${SK_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SK_KEY },
      body: JSON.stringify({ refresh_token: _session.refresh_token }),
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) throw new Error("refresh failed");
    const updated: SkSession = {
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
  if (_session.expires_at && _session.expires_at * 1000 - Date.now() < REFRESH_BUFFER_MS) {
    await refreshAccessToken();
  }
};

/* ─── REST client ─── */
const skFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
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
  q: async (tbl: string, { method = "GET", body, params = {}, single }: QueryOpts = {}): Promise<any> => {
    const u = buildRestUrl(SK_URL, tbl, params);
    const hd = h();
    if (single) hd["Accept"] = "application/vnd.pgrst.object+json";
    if (method === "POST" || method === "PATCH") hd["Prefer"] = "return=representation";
    const r = await skFetch(u, { method, headers: hd, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw await restError(r, `${method} ${tbl} failed`);
    if (method === "DELETE") return null;
    return r.json();
  },

  del: async (tbl: string, p: Record<string, string> = {}) => {
    await skFetch(buildRestUrl(SK_URL, tbl, p), { method: "DELETE", headers: h() });
  },

  upload: async (path: string, file: File) => {
    await ensureFreshToken();
    const r = await fetch(`${SK_URL}/storage/v1/object/resources/${path}`, {
      method: "POST",
      headers: { apikey: SK_KEY, Authorization: `Bearer ${getToken() || SK_KEY}`, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Upload failed"); }
    return `${SK_URL}/storage/v1/object/public/resources/${path}`;
  },

  rpc: async (fn: string, body: any = {}): Promise<any> => {
    const r = await skFetch(buildRestUrl(SK_URL, `rpc/${fn}`), {
      method: "POST",
      headers: h(),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw await restError(r, `RPC ${fn} failed`);
    return r.json();
  },

  storageDelete: async (path: string) => {
    await ensureFreshToken();
    await fetch(`${SK_URL}/storage/v1/object/resources/${path}`, {
      method: "DELETE",
      headers: { apikey: SK_KEY, Authorization: `Bearer ${getToken() || SK_KEY}` },
    });
  },

  auth: {
    signIn: async (email: string, pw: string): Promise<SkSession> => {
      const r = await fetch(`${SK_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SK_KEY },
        body: JSON.stringify({ email, password: pw }),
      });
      const d = await r.json();
      if (!r.ok || !d.access_token) throw new Error(d.error_description || "Login failed");
      const s: SkSession = {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
        user: d.user,
      };
      setSession(s);
      return s;
    },
    signUp: async (email: string, pw: string, name?: string): Promise<any> => {
      const r = await fetch(`${SK_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SK_KEY },
        body: JSON.stringify({ email, password: pw, data: { full_name: name } }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error?.message || "Signup failed");
      if (d.access_token) {
        const s: SkSession = {
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

/* ─── Retrieval data — now the SAME anchor DB (Phase 3). Read through the
   authenticated `sk` client under the teacher's own JWT + RLS: no separate
   project, no anon key, no shared secret. (Depends on Phase 5 re-gating
   class_unit_gaps by role/RLS instead of the x-sciencekit-key header.) ─── */
export const ret = {
  fetchClasses: async (): Promise<any[]> => {
    try { return await sk.q("classes", { params: { select: "id,name,join_code", order: "name.asc" } }); }
    catch { return []; }
  },
  // Aggregate weak objectives for one unit across the teacher's linked classes.
  // Calls the class_unit_gaps RPC (security-definer; non-personal aggregates) once
  // per class id and merges. Closes the loop: surface what a class is weak on where you plan.
  unitGaps: async (classIds: string[], unitId: string): Promise<any[]> => {
    if (!classIds?.length || !unitId) return [];
    try {
      const per = await Promise.all(classIds.map(cid =>
        sk.rpc("class_unit_gaps", { p_class_id: cid, p_unit_id: unitId }).catch(() => [])
      ));
      // If several linked classes hit the same topic, keep the weakest reading.
      const byTopic = new Map<string, any>();
      for (const row of per.flat()) {
        const prev = byTopic.get(row.topic_id);
        if (!prev || row.pct_correct < prev.pct_correct) byTopic.set(row.topic_id, row);
      }
      return [...byTopic.values()].sort((a, b) => a.pct_correct - b.pct_correct);
    } catch { return []; }
  },
  // Past-paper equivalent of unitGaps: a class's weakest topics by EXAM marks lost
  // (class_paper_gaps RPC — identity-gated, non-personal aggregates). Merges across
  // the linked classes, keeping the weakest reading per topic.
  paperGaps: async (classIds: string[]): Promise<any[]> => {
    if (!classIds?.length) return [];
    try {
      const per = await Promise.all(classIds.map(cid =>
        sk.rpc("class_paper_gaps", { p_class_id: cid }).catch(() => [])
      ));
      const byTopic = new Map<string, any>();
      for (const row of per.flat()) {
        const prev = byTopic.get(row.topic_id);
        if (!prev || row.pct_correct < prev.pct_correct) byTopic.set(row.topic_id, row);
      }
      return [...byTopic.values()].sort((a, b) => a.pct_correct - b.pct_correct);
    } catch { return []; }
  },
};

/* ─── Misc helpers ─── */
export const pubUrl = (path: string) => `${SK_URL}/storage/v1/object/public/resources/${path}`;
export const officeUrl = (url: string) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;

/* ─── React auth context ─── */
const AuthCtx = createContext<AuthValue>({ user: null, profile: null, loading: true } as AuthValue);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, profile: null, loading: true });

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

  const login = async (email: string, pw: string) => {
    await sk.auth.signIn(email, pw);
    let profile;
    try { profile = await sk.q("profiles", { params: { id: `eq.${_session!.user.id}` }, single: true }); }
    catch { profile = { id: _session!.user.id, role: "teacher", full_name: email }; }
    setState({ user: _session!.user, profile, loading: false });
    return profile;
  };

  const signup = async (email: string, pw: string, name?: string) => {
    const res = await sk.auth.signUp(email, pw, name);
    if (!res.access_token) return { needsConfirmation: true };
    let profile;
    try { profile = await sk.q("profiles", { params: { id: `eq.${_session!.user.id}` }, single: true }); }
    catch { profile = { id: _session!.user.id, role: "teacher", full_name: name || email }; }
    setState({ user: _session!.user, profile, loading: false });
    return { profile };
  };

  const logout = () => {
    sk.auth.out();
    setState({ user: null, profile: null, loading: false });
  };

  const setProfile = (p: Profile) => setState(s => ({ ...s, profile: p }));

  return (
    <AuthCtx.Provider value={{ ...state, login, signup, logout, setProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
