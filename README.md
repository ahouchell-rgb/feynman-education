# Feynman monorepo

One repo, three sites, one database contract. Created by merging
`feynman-education`, `retrieval-app`, and `interactive-science` (full history
preserved). See [docs/MONOREPO_AND_DOMAIN_PLAN.md](docs/MONOREPO_AND_DOMAIN_PLAN.md)
for the why and the sequencing.

## Layout

```
apps/
  feynman/      @feynman/web        TypeScript · Next 14    → app.feynman.education
  retrieval/    @feynman/retrieval  JavaScript · Next 14    → practice.feynman.education
  interactive/  (no package.json)   static HTML built by    → interactive.feynman.education
                                    python build.py
packages/
  db/           @feynman/db         migration ledger + RPC contract + contract test
```

`apps/interactive` is **not** a JS workspace member — it is a static site
assembled by `python3 apps/interactive/build.py`.

## Workspaces & tasks

npm workspaces + [Turborepo](https://turbo.build). From the root:

```bash
npm install              # installs all JS workspaces
npm run build            # turbo build (feynman, retrieval, db)
npm run typecheck        # turbo typecheck
npm test                 # turbo test
npm run build:interactive # python3 apps/interactive/build.py
```

Per-app: `npm run dev -w @feynman/web` (or `-w @feynman/retrieval`).

## Deploy

Three Vercel projects pointed at the subdirs (Root Directory = `apps/<name>`).
Domains are still the original `.com`s — the subdomain cutover is Phase C in the
plan and has **not** run. The DB is already unified (one anchor Supabase
project); see the plan §1.
