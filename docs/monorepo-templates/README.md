# monorepo-templates/

**Inert, ready-to-drop-in** workspace config for the real Phase B move. These live under `docs/` on
purpose — at the repo root they'd be picked up by tooling and fight the app's current `package.json`
(rehearsal conflict #1). They do nothing here.

During Phase B (after `git mv` of the app into `apps/feynman/`), promote them to the repo root:

```bash
git mv apps/feynman/package.json apps/feynman/package.json   # app keeps its own manifest
cp docs/monorepo-templates/root-package.json   ./package.json
cp docs/monorepo-templates/turbo.json          ./turbo.json
cp docs/monorepo-templates/pnpm-workspace.yaml ./pnpm-workspace.yaml
rm -f apps/*/package-lock.json                                 # rehearsal conflict #2
corepack enable && pnpm install                                # one root pnpm-lock.yaml
pnpm exec turbo run build                                      # rehearsal: 2/2, exit 0
```

Values match the working set proven in the rehearsal (`docs/MONOREPO_REHEARSAL.md`): pnpm 9.12.3,
turbo 2.x, three workspace members (`apps/feynman`, `apps/retrieval`, `packages/*`). `apps/interactive`
is **not** a workspace member — it's the Python static site, built by `python3 build.py`.
