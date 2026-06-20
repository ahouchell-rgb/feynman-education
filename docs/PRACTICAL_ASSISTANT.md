# Required-Practical Assistant — implementation

Strategy product #13. One click on a unit produces a printable **required-practical
sheet** — apparatus, method, a real **risk-assessment table**, expected results, and
common errors — for the recurring science-specific prep a teacher/technician does every
practical.

## What shipped

| Piece | File |
|---|---|
| Generator API | `src/app/api/practical-assistant/route.ts` |
| Entry point | `src/app/unit/[unitId]/page.tsx` — **🧪 Practical sheet** card |

## How it works

Loads the unit under the teacher's RLS (`title`, `discipline`, `year_group`,
`required_practical`, `content`, `misconceptions`) and has Claude (Sonnet, same auth +
daily-spend backstop as feedforward) write a printable A4 sheet:

- aim, **apparatus & chemicals** (with quantities/concentrations),
- numbered **method**,
- a bordered **risk-assessment table** (Hazard | Risk | Control), with an explicit line
  deferring to the school's / CLEAPSS risk assessment,
- expected results/observations + key equation,
- common errors & tips, and technician prep.

If the unit has no `required_practical` set, the model uses the standard required practical
for the topic. The button opens the sheet in a new tab to read/print.

## Notes

- **No new env** (uses `ANTHROPIC_API_KEY` + the shared daily spend cap).
- **Safety:** the sheet is guidance, not a substitute — it says so, and a teacher must still
  follow the school's risk assessment. Bounded to the topic content.
- Next: persist the sheet per unit (like feedforward sheets) and a department "official"
  practical pack.
