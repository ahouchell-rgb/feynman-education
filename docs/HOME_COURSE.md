# Home-learning course — synced product (Springboard)

Turns the self-study KS3 course (`public/learn/springboard.html`) into a real product:
pupils' progress **syncs across devices** and is visible to **teachers and parents** —
without giving pupils logins. A pupil is identified by a per-pupil magic-link **token**
(same idea as the parent portal), resolved server-side.

## What's in this change

| Piece | File |
|---|---|
| DB migration (2 tables + RLS) | `supabase/migrations/20260628_springboard_progress.sql` |
| Sync helpers | `src/lib/springboard.ts` |
| Pupil sync API (GET/POST by token) | `src/app/api/springboard/progress/route.ts` |
| Mint a pupil link (teacher) | `src/app/api/springboard/mint/route.ts` |
| Teacher class progress (teacher) | `src/app/api/springboard/class/route.ts` |
| Teacher page | `src/app/home-course/page.tsx` → **/home-course** |
| Parent portal card | `src/app/parent/page.tsx` + `src/app/api/parent/portal/route.ts` |
| In-app sync seam | `public/learn/springboard.html` (`syncInit/Pull/Push`, `mergeState`) |
| Clean URL `/learn` | `next.config.mjs` rewrite |

## How it works
- Anonymous use is unchanged — open `/learn`, progress saves to `localStorage`.
- Open a **pupil link** `/learn?t=<token>` and the app hydrates from the server, **merges**
  with local (keeps the furthest progress per field, so two devices never clobber each
  other), then debounce-pushes saves back. Offline-safe.
- The course `State` object is the only persistence seam; `State.save()` calls `syncPush()`.

## To go live
1. **Apply the migration** to Supabase (NOT done automatically):
   `supabase db push` (or paste `20260628_springboard_progress.sql` into the SQL editor).
2. **Env**: needs `SUPABASE_SERVICE_ROLE_KEY` (already set for the parent portal/crons). No new env.
3. **Deploy** the Next app (Vercel) — this serves the course *and* the sync API same-origin,
   with HTTPS (required for the PWA install, the microphone, and the service worker).
4. **Custom domain** (optional): point e.g. `learn.<domain>` at the Vercel project.
   Keep this off the parked `feynman.education` monorepo move for now.

## Daily use
- Teacher opens **/home-course**, creates a link per pupil (picks an existing pupil so
  progress joins to the parent portal, or types a name), and shares `/learn?t=<token>`.
- Pupil learns at home; progress appears on /home-course and in the parent portal's
  "Home science course" card.

## Notes / next steps
- Links are minted **idempotently** per `student_id` (re-minting returns the same link).
- The parent card only appears when the link was minted against the pupil's existing
  `student_id` (the teacher picker does this by default).
- State blob is size-capped (256 KB) server-side; merges are last-furthest-wins per field.
- Possible later: rate-limiting the POST, a "reset pupil" action, richer per-unit teacher analytics.
