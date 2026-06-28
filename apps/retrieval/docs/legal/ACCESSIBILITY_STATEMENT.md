# Accessibility Statement — Houchell Education (Retrieval science-practice app)

> **Self-assessment draft.** This reflects the product's accessibility posture and
> intent. Before publishing, validate the claims with an automated audit
> (e.g. axe / WAVE) and a brief manual keyboard + screen-reader pass, and fill
> the date and any findings. Schools may ask for this during procurement
> (Equality Act 2010; and the Public Sector Bodies Accessibility Regulations
> where the buyer is a public body).

**Last reviewed:** *(insert date)* · **Contact:** schools@houchelleducation.com

## Our aim
We aim to meet **WCAG 2.1 level AA** and to make the app usable by as many pupils
and staff as possible, including those using keyboards, screen readers, or browser
zoom/large text.

## What we do
- Interactive controls use real buttons/inputs with accessible names; status
  controls expose state (`aria-pressed`, `aria-expanded`) and progress uses
  `role="progressbar"` with value attributes.
- Question and diagram images carry descriptive `alt` text.
- The voice-input control has an explicit accessible label (start/stop).
- Colour is not the only signal for correct/incorrect — text and icons accompany
  it; the palette targets AA contrast on key text.
- The interface works with the keyboard and scales with browser zoom.

## Known limitations / in progress
- Full keyboard focus-order and visible-focus audit across every screen is
  scheduled; some custom controls may need focus-style improvements.
- A formal screen-reader pass (VoiceOver/NVDA) on the pupil answer flow and
  teacher dashboards is scheduled.
- Some headings are styled `div`s rather than semantic heading elements; we are
  migrating these.
- A "skip to content" link is planned.

## Getting help / reporting a problem
If you hit an accessibility barrier, contact **schools@houchelleducation.com** (or
use **Help & support** in the app). Tell us the page and what happened and we will
respond and prioritise a fix. Schools can request an alternative format for any
report a pupil or parent needs.

## How we tested
- *(insert)* automated audit (axe-core / WAVE) on key pages — date & summary.
- *(insert)* manual keyboard and screen-reader checks — date & summary.
