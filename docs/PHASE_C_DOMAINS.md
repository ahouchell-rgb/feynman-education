# Phase C — domain consolidation runbook

Companion to [MONOREPO_AND_DOMAIN_PLAN.md](MONOREPO_AND_DOMAIN_PLAN.md) §7 Phase C.
Phase B (the monorepo) is done on branch `chore/monorepo`. This phase moves the
three live sites onto `*.houchelleducation.com`. It is **incremental and reversible** —
every step keeps the old domain working until the new one is verified.

> **Why this can't be fully scripted from the repo:** the live steps touch the
> Vercel dashboard, your domain registrar's DNS, and the Google / Microsoft OAuth
> consoles. Those need your logins — they are not repo changes. This doc makes
> each one a copy-paste checklist.

---

## 0. Current live state (read from Vercel 2026-06-28)

| Site | Vercel project | Project ID | Custom domain today | Latest deploy |
|---|---|---|---|---|
| feynman web | `science-kit` | `prj_WqLAC55On24hvlkzUc0JrQrvM9nl` | **none** (only `*.vercel.app`) | ⚠️ **ERROR** |
| retrieval | `retrieval-app` | `prj_dt0lCEspm8GOQoRveGrldLIeSf4D` | `retrieval-app.com` | READY (prod) |
| interactive | `science-tools` | `prj_0FkG9TKPFsAivL0JQyNzBeya2krb` | `interactive-science.com` + www | READY |

Team: `adam houchell's projects` / `team_JCZkEbKe2AXWStL8y1nCbsc6`.
(`parent-hub`, `pulse-hub` are the decommissioned projects — out of scope.)

**Two things to fix before Phase C proper:**
1. **`science-kit`'s `chore/monorepo` previews ERROR — diagnosed: Root Directory.**
   Production (`main`) is healthy; only the monorepo-branch previews fail. The build
   itself *succeeds* (`turbo run build` → 2/2 apps); Vercel then can't find
   `.next/routes-manifest.json` because the project's **Root Directory is still the
   repo root**, so it looks for output at root `.next` instead of `apps/houchell/.next`.
   **Fix:** project → Settings → set **Root Directory = `apps/houchell`** (keep
   "Include files outside the Root Directory" ON for the workspace install), redeploy.
   (The turbo env warning that also showed is already fixed in `turbo.json`.)
2. **No `houchelleducation.com` domain exists on any project.** The whole phase assumes
   you own `houchelleducation.com`. Confirm it's registered and you can edit its DNS
   before starting — otherwise step 2 has nothing to point at.

---

## 1. Repoint each Vercel project at the monorepo (no domain changes yet)

Each project is still wired to its old standalone repo. Point all three at
`ahouchell-rgb/feynman-education` and set the subdir. **Dashboard → project →
Settings → Git / Build & Output:**

| Project | Connected repo → set to | Root Directory | Build command |
|---|---|---|---|
| `science-kit` | `ahouchell-rgb/feynman-education` | `apps/houchell` | (default `next build`) |
| `retrieval-app` | `ahouchell-rgb/feynman-education` | `apps/retrieval` | (default `next build`) |
| `science-tools` | `ahouchell-rgb/feynman-education` | `apps/interactive` | `python3 build.py`, Output Directory `.` |

- Set **Ignored Build Step** = `npx turbo-ignore` on the two Next projects so a
  push only rebuilds the app that changed.
- Move each app's env vars into its project if not already there. Names differ today
  (feynman `SK_URL` + anon literal; retrieval `NEXT_PUBLIC_SUPA_URL` /
  `NEXT_PUBLIC_SUPA_KEY`) — reconcile to one convention while you're in here.
- **Verify on the `*.vercel.app` preview URL of each project before touching any
  custom domain.** This is the reversible checkpoint.

Merge `chore/monorepo` to `main` (after Phase 5) so the production branch is the
monorepo. Until then, deploy the branch as a preview.

---

## 2. Add the subdomains alongside the existing domains (keep both)

In each project → Settings → Domains, **add** (do not remove the old one):

| Project | Add domain | DNS record at registrar |
|---|---|---|
| `science-kit` | `app.houchelleducation.com` | CNAME `app` → `cname.vercel-dns.com` |
| `retrieval-app` | `practice.houchelleducation.com` | CNAME `practice` → `cname.vercel-dns.com` |
| `science-tools` | `interactive.houchelleducation.com` | CNAME `interactive` → `cname.vercel-dns.com` |

Vercel shows the exact target value per domain — use what it shows. Wait for the
SSL cert to issue (green check) and load each subdomain before proceeding. The old
`.com` domains keep serving throughout.

---

## 3. Scope the auth session cookie to `.houchelleducation.com`

Only after all three serve from `*.houchelleducation.com`. This gives one first-party
session across the three subdomains (the "one Auth pool" the DB unification already
created on the backend).

- The feynman app does **not** set an explicit cookie `domain` today — Supabase
  manages it (`apps/houchell/src/lib/sk.tsx`, `serverHelpers.ts`). To share the
  session across subdomains, configure the Supabase client cookie options with
  `domain: ".houchelleducation.com"` (server client `cookies.setAll` / SSR helper).
- **Do not do this while the apps are still on different apex `.com`s** — a
  `.houchelleducation.com` cookie does nothing for `retrieval-app.com` and can confuse
  the transition. It's a no-op until step 2 is live, then it's the enabler.

---

## 4. Re-register OAuth redirect URIs + email From-domain

The feynman app builds OAuth `redirect_uri` in:
- `apps/houchell/src/app/api/google/start/route.ts`
- `apps/houchell/src/app/api/microsoft/start/route.ts`

These derive the callback from the request origin/env. Once `app.houchelleducation.com`
is live:
- **Google Cloud Console** → OAuth client → add authorized redirect URI
  `https://app.houchelleducation.com/api/google/callback` (keep the old one during cutover).
- **Microsoft Entra (Azure AD)** → app registration → Redirect URIs → add
  `https://app.houchelleducation.com/api/microsoft/callback`.
- **Supabase Auth** → URL config → add the new site URL + redirect allow-list.
- **Resend** → verify `houchelleducation.com` as a sending domain and switch the
  parent-report / transactional From address to `@houchelleducation.com`.

---

## 5. 301 the old `.com`s → the subdomains

Last, once the subdomains are proven in real use:
- `retrieval-app.com` → 301 → `practice.houchelleducation.com`
- `interactive-science.com` → 301 → `interactive.houchelleducation.com`

Keep the `.com`s registered and redirecting (a descriptive `retrieval-app.com` may
still convert as a D2C front door). Reversible: drop the redirect to fall back.

---

## Rollback

Each step is independently reversible: remove the added subdomain (step 2), revert
the cookie-domain commit (step 3), delete the new redirect URI (step 4), drop the
301 (step 5). The old `.com` + standalone behaviour stays intact until step 5, and
even then only a redirect — the projects still serve.
