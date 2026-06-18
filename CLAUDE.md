# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Feynman Education** (npm package name `sciencekit`) is a Next.js 14 App Router
web app: a shared curriculum workspace for UK secondary teachers. It covers
timetable/lesson planning, a full 960×540 slide deck editor with `.pptx`
import/export, AI-assisted slide editing, a per-lesson chat assistant, and a
"feedforward" loop that turns class retrieval-practice gaps into targeted
reteach resources.

## Commands

```bash
npm run dev          # next dev — local dev server
npm run build        # next build — production build (CI gate; must pass before deploy)
npm start            # next start — serve the production build
npm test             # vitest run — run all tests once
npm run test:watch   # vitest — watch mode

# Run a single test file or by name:
npx vitest run src/lib/formula.test.ts
npx vitest run -t "richToRuns"
```

Tests use **vitest + jsdom** and live next to the code as `*.test.ts(x)`
(see `vitest.config.js`). jsdom is required because the export tests need a
real `DOMParser`/`document` (e.g. `richToRuns`, crop).

There is no separate lint step configured; `next build` is the type/compile gate.
TypeScript is non-strict (`tsconfig.json` has `strict: false`), and `.js`/`.jsx`
files are allowed alongside `.ts`/`.tsx`. Path alias: `@/*` → `src/*`.

## Backend model — read this before touching data access

There is **no `supabase-js` SDK**. All Supabase access (PostgREST queries,
GoTrue auth, Storage) goes through a hand-rolled `fetch`-based client:

- **`src/lib/sk.tsx`** — the browser client. Exports `sk` (with `.q()` for
  PostgREST table queries, `.rpc()`, `.del()`, `.upload()`, `.storageDelete()`,
  and `.auth.*`), the `AuthProvider`/`useAuth()` React context (session stored in
  `localStorage` under `sk_auth`, JWT auto-refreshed ~60s before expiry), and the
  `ret` helper (retrieval-practice reads). It's a `"use client"` module.
- **`src/lib/supabaseRest.ts`** — framework-agnostic URL/header/error helpers
  (`buildRestUrl`, `restHeaders`, `restError`, `supaRest`). No React, no Node
  APIs — deliberately importable from both `"use client"` components and from
  edge/node route handlers, so URL-building and PostgREST conventions aren't
  re-implemented per caller. Server route handlers use `supaRest` directly with
  the service-role key or the user's bearer.

Client calls run under the **teacher's own JWT + RLS**. Server routes pass the
user's `Authorization: Bearer` through alongside the public anon key as the
`apikey` header, and use `SUPABASE_SERVICE_ROLE_KEY` only for privileged paths
(e.g. token-usage logging, the cron).

### "Phase 3" unification — one Supabase project

This app and the separate "retrieval-app" now share a **single Supabase project,
the retrieval-app anchor** (`uvzukwoxqhcxaxtzrziy.supabase.co`). In `sk.tsx`,
`SK_URL`/`SK_KEY` point at the anchor and `RET_URL`/`RET_KEY` are aliases of
them. The anon key and anchor URL are hardcoded (and duplicated into each edge
route handler) — this is intentional; the anon key is public. `SK_API_KEY` (the
`x-sciencekit-key` shared secret) is retained **only** for the cron's
service-role path until those cross-DB RPCs are re-gated by role.
**`docs/PHASE3_REPOINT.md`** is the authoritative record of this cutover and the
DB-side steps that must ship with it — read it before changing any project
URLs, keys, or the `ret`/RPC gating.

### Schema

Migrations are in `supabase/migrations/` (timestamped SQL). Core tables:
`classes`, `class_timetable_slots`, `class_progress`, `timetable_calendar`,
`lesson_sow` (scheme of work / lessons), `lesson_slides`, `lesson_widgets`,
`lesson_chat_messages`, `feedforward_sheets`, `feedforward_decks`,
`resource_map`, `microsoft_tokens`, `daily_token_usage`. Cross-DB aggregate RPCs
include `class_unit_gaps` (weak objectives per unit). There is no committed
generated-types file; query shapes are implicit.

## App structure & routing

App Router pages under `src/app`:

- `/` — home (next lesson card + schedule)
- `/login`, `/reset-password`, `/setup` — auth + first-run setup
- `/curriculum`, `/manage` — curriculum overview and class management
- `/unit/[unitId]` and `/unit/[unitId]/lesson/[lessonId]` — unit and lesson views
  (the lesson page is the hub: resources, widgets, chat sidebar, retrieval gaps,
  feedforward, mark-as-taught)
- `/slides`, `/slides/[id]/present`, `/slides/[id]/print` — deck list, live
  presenter view, and print/PDF view

`src/app/layout.tsx` wraps everything in `AuthProvider`. **`AppShell`**
(`src/components/AppShell.tsx`) is the authenticated chrome: it renders
`AuthGate` (redirects to `/login` when logged out), the `Sidebar`, and global
overlays. It owns the global keyboard chords (⌘K search, ⌘⇧V visualiser) and
listens for `sk:open-search` / `sk:open-visualiser` window events so any
descendant can open them without prop-drilling.

## Slide editor architecture

The slide deck is a **JSON array of slides on a fixed 960×540 px canvas (16:9)**.
This canvas size is the contract shared by the editor, the renderer, the AI
assistant, and the exporters — coordinates are absolute pixels in that space.

- **`src/lib/types.ts`** — `SlideElement` is deliberately **one broad interface**
  (a `type` discriminant + many optional fields), *not* a discriminated union,
  because the editor/renderer read fields positionally across ~12 element kinds
  (`text`, `rect`, `arrow`, `image`, `table`, `timer`, `video`, `visualiser`,
  `retrieval`, `html`, `equation`, `chart`). The per-type field groups in that
  file document which fields each kind uses.
- **`src/components/SlideStage.tsx`** — pure renderer (`StaticSlide`, `elStyle`,
  `ElInner`, `ArrowSvg`, `MasterFrame`, chart colors, the `VW`/`VH` constants).
  Used by both the editor and the present/print routes.
- **`src/components/SlideEditor.tsx`** — the editing surface (multi-select,
  marquee, smart-align guides, theme/master, panels). Leaf components, constants,
  and pure helpers are split into **`src/components/slideEditor/*`** (`constants.ts`,
  `PropsBar`, `TextEditor`, `TableEditor`, `CropModal`, `ChartDataModal`,
  `ShortcutHelp`, `ui.tsx`).

### Import / export

- **`src/lib/exportPptx.ts`** — maps the 960×540 canvas onto a 10in×5.625in
  PptxGenJS slide; `richToRuns` converts a rich-text box's HTML into styled runs.
  Has unit tests (`exportPptx.test.ts`).
- **`src/lib/importPptx.ts`**, **`src/lib/importHtml.ts`** — bring decks/templates in.
- `pptxgenjs` runs **client-side** and references Node-only modules via `node:`
  imports. `next.config.mjs` strips the `node:` scheme and stubs `fs`/`http`/etc.
  to `false` for the browser bundle — keep that webpack config if you touch the
  exporter or upgrade `pptxgenjs`.

### Formula helpers

**`src/lib/formula.ts`** (unit-tested) maps characters to Unicode sub/superscripts
for chemistry. `autoSub`/`looksLikeFormula` only subscript digits inside
chemical-formula-shaped tokens (CO2, H2O, Ca(OH)2) while leaving lesson codes
(P1.1, C2) and ordinary numbers (Year 7) alone, and are length-preserving so the
caret stays stable while typing.

## AI / API routes

All AI route handlers live in `src/app/api/*/route.ts`. They call the Anthropic
Messages API directly (`https://api.anthropic.com/v1/messages`, version
`2023-06-01`) — there's no SDK.

- **`/api/slides-assistant`** (`runtime = "edge"`, model `claude-opus-4-8`) —
  edits the whole deck. Claude is forced to return the **complete updated deck**
  via an `edit_deck` tool call, so the response is always valid structured JSON
  applied straight to the editor. The system prompt encodes the full element
  schema and the 960×540 coordinate rules — keep it in sync with `types.ts` and
  `SlideStage`.
- **`/api/chat-with-lesson`** (`edge`, model `claude-sonnet-4-6`) — per-lesson
  chat, streamed as SSE (`text`/`done`/`error`/`warning` events).
- **`/api/feedforward`** (`edge`, `claude-sonnet-4-6`) — generates a one-page
  printable HTML reteach sheet from a class's weakest objectives ("close the loop").
- **`/api/cron/halfterm-feedforward`** (`runtime = "nodejs"`, `maxDuration = 300`) —
  weekly Vercel cron (`vercel.json`, daily `0 6 * * *` trigger that no-ops unless a
  half-term just started); generates a feedforward `.pptx` deck per class via
  `src/lib/feedforwardPptx.js` and saves to `feedforward_decks`.
- **`/api/microsoft/{start,callback,refresh}`** — Microsoft (Entra) OAuth for
  Teams/calendar; tokens in `microsoft_tokens`. Helpers in `src/lib/ms.ts`.

**Cost control:** chat and feedforward estimate GBP cost per call and enforce a
per-user **daily cap** logged to `daily_token_usage` (`DAILY_CAP_GBP`, with
rough per-MTok pricing constants in each route). If you add a model call, log
usage and respect the cap the same way.

## Environment & deployment

Hosted on **Vercel**. Env vars (see `.env.example`): `NEXT_PUBLIC_*` are exposed
to the browser; everything else is server-only.

- `NEXT_PUBLIC_RETRIEVAL_APP_ORIGIN` — origin embedded by `RetrievalAppFrame`.
- Server secrets (set in Vercel, never committed): `ANTHROPIC_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `SK_API_KEY`.

## Conventions

- **Styling is inline `style={{}}` objects** keyed off the shared theme token
  object **`C`** in `src/lib/theme.ts` — there is no CSS framework or CSS modules
  (only `globals.css`). Subject colors come from `DISC` (biology/chemistry/physics/
  combined). Fonts: IBM Plex Sans/Mono + Instrument Serif, loaded in `layout.tsx`.
- Reusable UI atoms (`Btn`, `Badge`, `Card`, inputs) are in
  **`src/lib/primitives.tsx`**; prefer these over re-styling raw elements.
- Most interactive components are `"use client"`. Server work that needs secrets
  belongs in a route handler, not a component.
