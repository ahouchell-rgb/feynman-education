# Accessibility (WCAG 2.2)

*Status of the accessibility pass. A public-sector procurement gate (the DfE /
public-sector bodies accessibility regs require WCAG 2.2 AA), so this is tracked
deliberately. Foundation first, then per-surface.*

## Done — foundation (lifts every page)

- **Visible keyboard focus** (2.4.7, 2.4.11) — a global `:focus-visible` ring
  (brand green, 2px + offset) in `globals.css`; the CSS reset had stripped the
  default outline. Mouse clicks don't show the ring; Tab/keyboard does.
- **Skip to content** (2.4.1) — a `.sk-skip-link` in the root layout jumps to the
  `<main id="main">` landmark, off-screen until focused.
- **Landmarks** (1.3.1) — `<main>` in `AppShell`, `<nav aria-label="Primary">`
  for the sidebar. `aria-current="page"` on the active nav item.
- **Reduced motion** (2.3.3) — `prefers-reduced-motion` disables non-essential
  transitions/animations globally.
- **Icon-only controls have names** (4.1.2) — the sidebar visualiser / settings /
  sign-out buttons, the year-group expanders (`aria-expanded`), and the modal
  close buttons now carry `aria-label`s; decorative glyphs are `aria-hidden`.
- **Dialogs** (4.1.2, 2.1.2) — Search, Visualiser and Settings overlays are
  `role="dialog" aria-modal="true"` with an accessible name; all close on
  **Escape** (Settings gained the handler).
- **Form fields have labels** (1.3.1, 3.3.2) — the login email/password/name
  inputs gained `aria-label`s + `autocomplete` (placeholders aren't accessible
  names and vanish on input).
- **`lang="en"`** on `<html>` (3.1.1) — already present.

## Still to do

- **Colour contrast audit** (1.4.3) — verify the muted/dim greys and the
  red/amber/green status colours meet 4.5:1 (3:1 for large text) on their
  backgrounds; the heat colours on tinted bars are the main risk.
- **Per-page headings & order** (1.3.1, 2.4.6) — ensure each page has one `<h1>`
  and a sensible heading order (several dashboards use styled `div`s as headings).
- **Tables** (1.3.1) — the dashboard/intervention grids are CSS-grid `div`s;
  give the data grids proper `role="table"`/semantics or real `<table>`s.
- **Focus management in dialogs** (2.4.3) — move focus into each dialog on open
  and restore it on close; trap Tab within (Search autofocuses its input today).
- **Target size** (2.5.8) — check the 24×24 icon buttons meet the minimum.
- **Component layer** — the inline-style sprawl makes consistent states costly;
  moving to a small styled-component/token layer would make a11y states uniform.

## How to test

- Keyboard-only: Tab through every interactive control; the focus ring must be
  visible and the order logical; Esc closes dialogs.
- Screen reader (VoiceOver/NVDA): landmarks announce; buttons have names.
- Automated: run axe-core / Lighthouse on the key routes (login, /, /curriculum,
  /school, /trust, /billing) as a CI check (a follow-up).
