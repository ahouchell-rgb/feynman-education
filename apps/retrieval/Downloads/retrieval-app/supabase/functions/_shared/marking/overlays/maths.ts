// MATHS overlay — the subject-SPECIFIC half of each marker prompt, sent as the
// SECOND cache_control system block after BASE_RETRIEVAL / BASE_PAPER.
//
// Mirrors the shape of ./science.ts: two exports (lenient retrieval marker,
// strict paper marker) sharing a common notation/equivalence reference but with
// the discipline each marker needs. Keep the content STATIC (no per-request
// values) so prompt caching keeps working. To activate for a subject, set that
// subject's subjects.marker_profile = 'maths' (resolved server-side; the client
// never picks the profile) — see ../registry.ts.

export const MATHS_RETRIEVAL_OVERLAY = `SUBJECT CONTEXT — MATHS (UK secondary mathematics, KS3 and GCSE). Apply these subject-specific conventions on top of the general marking rules above.

GOLDEN RULE FOR RETRIEVAL MATHS: mark the mathematical VALUE, not the surface form. If the student's answer is mathematically equal to the model answer, it is correct, however they have written it — different notation, a different but equivalent form, or a different valid arrangement of the same expression.

EQUIVALENT NOTATION — treat all of these as identical ways of writing the same thing:
- Powers / indices: "x^2", "x**2", "x²" and "x squared" all mean x squared. "2^3", "2³" and "8" are the same value. A caret "^" introduces a power, so "10^-3" = "10⁻³"; "x^(1/2)" = "√x".
- Multiplication: "*", "×" and "·" all mean multiply, and adjacent terms multiply: "2x" = "2*x", "2(x+1)" = "2 lots of (x+1)". When the context is plainly numeric, "2x3" written by a pupil means 2×3.
- Division and fractions: "/", "÷" and a stacked fraction bar are the same; "3/4", "3÷4" and "0.75" are the same value. "a/b" on one line equals the same fraction written stacked.
- Roots: "sqrt(x)", "√x", "root x" and "x^0.5" all mean the square root of x; "√2", "sqrt2" and "root 2" are the same.
- Constant pi: "pi" and "π" are the same; left exact as "π" or given as "3.14" / "3.142" are all acceptable unless the question pins a precision.
- Relations: "<=" = "≤", ">=" = "≥", "!=" = "≠", ">" / "<" as written.
- Mixed numbers, improper fractions and decimals: "1 1/2", "3/2", "1.5" and "one and a half" are the same.
- Percentages, decimals and fractions: "0.25", "1/4" and "25%" are the same value; accept whichever form unless the question asks specifically for one ("give your answer as a percentage / fraction / decimal").

EQUIVALENT FORMS — accept any algebraically equal answer, in ANY valid arrangement, UNLESS the question explicitly demands a particular form:
- Reordered / regrouped terms: "x^2 + 2x + 1", "1 + 2x + x^2" and "2x + 1 + x^2" are the same expression.
- Factorised vs expanded: "(x+1)^2" = "x^2 + 2x + 1"; "(x+2)(x-3)" = "x^2 - x - 6". Accept either UNLESS the question says "factorise" (then a factorised form is required) or "expand" (then an expanded form is required).
- Equivalent / unsimplified fractions: "2/4", "1/2", "4/8" and "0.5" are equal; accept an unsimplified fraction as correct UNLESS the question says "simplest form", "simplify" or "lowest terms" — then it must be fully simplified.
- Equivalent ratios: "2:3", "4:6" and "6:9" are the same ratio; accept unsimplified UNLESS "simplest form" is asked. Order matters: "2:3" is NOT "3:2".
- Rearranged equations / formulae: "y = 2x + 1", "y - 1 = 2x" and "y - 2x - 1 = 0" describe the same relationship; "F = ma", "a = F/m" and "m = F/a" are the same rearrangement.
- Surds vs decimals: when the model answer is exact ("3√2", "π/4", "2/3"), accept the exact form AND a correct decimal equivalent ("4.24…", "0.785…", "0.667") UNLESS the question says "give an exact answer" / "leave in surd form" / "in terms of π" — then a decimal is NOT acceptable.
- Standard form and ordinary form interchangeably: "4.5×10^3" = "4500"; "2×10^-2" = "0.02".

SIGNS, ORDER AND PRECISION — be STRICT on these; they change the value:
- A sign is part of the number: "-5" is NOT "5", and "-3/4" is NOT "3/4". A missing or wrong sign is incorrect.
- Coordinates and ordered pairs are ordered: "(3, 4)" is NOT "(4, 3)". Column-vector order (top then bottom) matters too.
- Rounding / significant figures / decimal places: accept any sensible rounding of the correct value UNLESS the question pins a precision ("to 2 d.p.", "to 3 s.f.", "to the nearest whole number / 10 / penny") — then the answer must be rounded as asked. Do not penalise a missing trailing zero on a non-money answer ("1.50" = "1.5"). For MONEY, two decimal places are expected ("£3.5" should read "£3.50", and "£3.50" = "350p").
- Units: when the question asks for an answer in particular units, the correct number with the right unit (word or symbol — cm, m, kg, °, cm², cm³) is fully correct; the same number with the wrong unit is incorrect.

WORKING AND MULTI-LINE ANSWERS:
- The student may show several lines of working. Mark the FINAL answer (usually the last line, or the value after "=", "so" or "answer:"). Use the working only to judge a borderline final value.
- A correct final answer with no working still earns full marks on a retrieval item — this is recall practice, not a "show that".
- If the working is clearly correct but the student makes a single arithmetic slip in the final figure, use judgement: a low-tariff item may earn partial credit for sound method; a wholly wrong value earns none.

COMMON MISCONCEPTIONS — these are WRONG; do not award the mark, and you can usually be high confidence:
- "(a+b)^2 = a^2 + b^2" — wrong; it expands to a^2 + 2ab + b^2.
- "3^2 = 6" or "5^2 = 10" — wrong; a power is repeated multiplication, so 3^2 = 9 and 5^2 = 25.
- "√(a+b) = √a + √b" — wrong.
- "multiplying always makes bigger / dividing always makes smaller" — wrong for values between 0 and 1 (0.5 × 0.5 = 0.25).
- "0.5 < 0.45 because 5 < 45" — wrong; compare place value, 0.5 = 0.50 > 0.45.
- A negative times a negative giving a negative — wrong; (−)(−) = (+).
- Confusing area with perimeter, or area with volume; confusing mean, median, mode and range.
- "to simplify 6/8 you subtract" — wrong; divide numerator and denominator by a common factor.
Mark these incorrect even if the surrounding working looks fluent and confident.

WORKED EXAMPLES (maths, retrieval):
- Model "x^2 + 5x + 6", student "(x+2)(x+3)" → correct (same expression, factorised), confidence high.
- Model "1/2", student "0.5" → correct; student "2/4" → correct (equivalent — only wrong if the question said "simplest form"); student "-1/2" → incorrect (sign).
- Model "(3, -2)", student "(-2, 3)" → incorrect (wrong order).
- Model "12.5" with the question "to 1 d.p.", student "13" → incorrect (precision not met); student "12.5" → correct.
- Model "3√2 cm", student "4.24 cm" → correct UNLESS the question said "exact / surd form"; student "3 root 2" → correct.
- Model "£4.50", student "£4.5" → accept (treat as £4.50); student "450p" → accept (= £4.50).`;

export const MATHS_PAPER_OVERLAY = `SUBJECT CONTEXT — MATHS (UK GCSE mathematics, Foundation and Higher). Apply these subject-specific conventions on top of the general examiner rules above.

GCSE maths mark schemes award M (method), A (accuracy), B (independent) and ft (follow-through) marks; the marking points encode these. Mark the VALUE, not the surface form, but respect any form or precision the marking point or question demands.

EQUIVALENT NOTATION — treat all of these as identical:
- Powers: "x^2" = "x²" = "x squared"; "2^3" = "2³" = "8". A caret introduces a power ("10^-3" = "10⁻³"); "x^(1/2)" = "√x".
- Multiplication: "*", "×", "·" and adjacent terms ("2x" = "2*x", "2(x+1)") all mean multiply.
- Division / fractions: "/", "÷" and a stacked bar are the same; "3/4" = "3÷4" = "0.75".
- Roots: "sqrt(x)", "√x", "root x" and "x^0.5" are the square root of x.
- Constant pi: "pi" = "π"; left as "π" or given as "3.14" / "3.142" per the required precision.
- Relations: "<=" = "≤", ">=" = "≥", "!=" = "≠".
- Mixed numbers, improper fractions and decimals are interchangeable ("1 1/2" = "3/2" = "1.5"); percentages, decimals and fractions are interchangeable ("25%" = "0.25" = "1/4") unless a form is specified.

METHOD AND ACCURACY MARKS (M / A / B / ft):
- A METHOD mark (M) is for a correct, complete method even if the arithmetic is wrong: award it when the working shows the right process (correct substitution into a formula, a correct strategy, a correctly set-up equation), regardless of the final value.
- An ACCURACY mark (A) requires the correct value, and usually depends on the matching method being present. A correct final answer with valid working earns both the method and the accuracy point; a correct final answer with NO working still earns them UNLESS the marking point says working must be shown ("show that", or the scheme states working is required).
- A 'B' mark is independent — award it for the stated correct answer on its own merits.
- FOLLOW-THROUGH / ecf: where a later marking point uses a value the student found earlier, award it for the correct method applied to THEIR value, even if that earlier value was wrong. The earlier slip is penalised once, on its own accuracy mark, never again downstream.

FORM AND PRECISION — enforce ONLY what the marking point or question states:
- "Give your answer in its simplest form" / "fully simplify": the fraction, ratio or surd must be fully simplified to earn the accuracy mark; an unsimplified-but-equivalent answer earns the method but not the final accuracy mark.
- "Give an exact answer" / "leave in surd form" / "in terms of π": a decimal approximation does NOT earn the accuracy mark; the exact surd or π form is required.
- "to N significant figures / decimal places" / "to the nearest …": the answer must be correctly rounded to that precision. Accept the correctly rounded value (and, per most schemes, a fuller-accuracy value that rounds to it) unless the point says otherwise; a value given to the WRONG precision earns the method but not the accuracy mark.
- Where no form is specified, accept any equivalent correct form (factorised or expanded, equivalent fraction, decimal or percentage).

SIGNS, ORDER AND UNITS:
- Signs are significant: "-5" ≠ "5"; a sign error costs the accuracy mark.
- Ordered pairs, coordinates and column vectors are ordered: "(3, 4)" ≠ "(4, 3)"; vector (top, bottom) order matters.
- Units: a 'calculate' answer needs the correct value AND, where the marking point asks for it, the correct unit (cm, m, cm², cm³, kg, °, etc.). A correct value with the unit missing caps at the value/method mark and loses the unit point; a wrong unit for a unit point earns 0 for that point even when the number is right.

GRAPHS, CONSTRUCTIONS AND TABLES:
- Read-offs and plotted points are correct within the tolerance the grid allows; do not demand more precision than the scale supports.
- For "draw" / "construct" marking points, award the strands the point lists (correct gradient and intercept for a straight line, correct shape for a curve, construction arcs left visible) as far as a typed answer can convey them.

COMMON MISCONCEPTIONS — wrong; do NOT award even if fluent:
- "(a+b)^2 = a^2 + b^2" (it is a^2 + 2ab + b^2); "√(a+b) = √a + √b".
- "3^2 = 6"; a negative times a negative is negative; "multiplying always makes bigger".
- Confusing area / perimeter / volume; confusing mean / median / mode / range; reading the gradient of a line as its y-intercept.

WORKED EXAMPLES (maths, paper):
- Points [0] M (method), [1] A (accuracy). Student writes "1/2 × 8 × 6" correctly but evaluates it to 26 (a slip). Award [0], withhold [1]. marks_awarded reflects the method point only.
- Question "give your answer in its simplest form", model "1/2", student "2/4" — correct value but not simplest: award the method point, withhold the simplest-form accuracy point.
- Question "leave your answer in terms of π", model "9π cm²", student "28.3 cm²" — decimal not accepted for the exact-form mark; award method only.
- ecf: point [0] finds an area (student slips to 18, losing [0]'s accuracy), point [1] doubles it; student writes 36 → award [1] by follow-through, the method on their own value is correct.`;
