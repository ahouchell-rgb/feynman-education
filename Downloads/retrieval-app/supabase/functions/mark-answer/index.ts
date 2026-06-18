import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const sb = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cache safety thresholds
const CONFIRMATION_THRESHOLD = 3;       // entries become authoritative at this many independent confirmations
const MAX_HITS_BEFORE_REVERIFY = 50;    // after this many cache hits, the next call re-verifies via AI; a
                                        // successful high-confidence re-verify then resets hit_count (see
                                        // recordCacheConfirmation) so the entry RESUMES serving from cache.
                                        // COST LEVER 2: without that reset, a popular answer permanently
                                        // reverted to a full AI call on every hit once it crossed this line —
                                        // the opposite of leaning on the cache. Now it re-checks every ~50
                                        // hits and serves from cache in between.
const MAX_AGE_DAYS_BEFORE_REVERIFY = 90; // entries older than this re-verify next call
const MIN_ANSWER_WORDS = 3;             // never cache anything shorter than this in absolute terms
const MIN_LENGTH_RATIO = 0.6;           // OR at least 60% of model answer length

// COST LEVER 1 — PROMPT CACHING.
// This whole block is sent as a cache_control:ephemeral system prefix on EVERY call
// (see callAiMark). For claude-haiku-4-5 the minimum cacheable prefix is 4096 tokens:
// below that floor the cache silently never writes — no error, you just keep paying
// full input price on every call and usage.cache_read_input_tokens stays 0. The
// earlier ~1,500-token version was under the floor, so caching was effectively off.
// This prompt is deliberately kept WELL above 4096 tokens with real, static marking
// guidance (which also improves marking quality). Two rules for anyone editing it:
//   1. Do NOT trim it back under ~4k tokens — that turns caching off with no warning.
//   2. Keep every per-request value (question / model answer / student answer) OUT of
//      this string and in the user message, or the prefix changes each call and never
//      caches. Cached reads bill at ~0.1x input, so the long prefix is ~10x cheaper
//      per call once warm. Verify after deploy: cache_read_tokens > 0 in ai_usage.
const SYSTEM_PROMPT = `You are a UK secondary science teacher marking retrieval practice homework. You are generous but not soft — students get credit when the science is right, even if the notation is shorthand.

EQUIVALENT NOTATION — always treat these as identical to the written-out form:
- Chemical symbols vs element names: "Fe" = "iron", "Na" = "sodium", "H2O" = "water", "CO2" = "carbon dioxide", "O2" = "oxygen", "NaCl" = "sodium chloride", etc. Case matters less than content ("fe", "FE", "Fe" all fine for iron).
- Unit symbols vs unit names: "2000m" = "2000 metres" = "2000 m", "5N" = "5 newtons", "10s" = "10 seconds", "300K" = "300 kelvin", "50cm3" = "50 cm³" = "50 cubic centimetres". The space between number and unit is optional. Superscripts/subscripts are optional (cm3 = cm³, H2O = H₂O).
- Formulae vs names for common molecules: accept either.
- Abbreviations students commonly use: "temp" for temperature, "conc" for concentration, "e-" or "e−" for electron, "+ve/-ve" for positive/negative.
If the student's answer contains the correct quantity AND a recognisable unit (symbol OR word), it is correct.

MODEL ANSWER CONVENTIONS — the model answer may use these bracket patterns to indicate accepted variations. You must interpret them correctly:

1. EXPLICIT ALTERNATIVES — brackets containing the word "accept" give an additional valid value. Either form is fully correct.
   Example: "9.8 N/kg (accept 10 N/kg)" — student writing either "9.8 N/kg" or "10 N/kg" is fully correct.
   Example: "Joules (accept J)" — both are fully correct.

2. EQUIVALENT FORMS — brackets containing the word "or" give an equivalent form. Either form is fully correct.
   Example: "0.75 (or 75%)" — both "0.75" and "75%" are fully correct.
   Example: "It quadruples (multiplied by 4)" — either phrasing is fully correct.

3. CLARIFICATIONS — brackets that do NOT contain "accept" or "or" are explanation of the answer, not something the student must also write.
   Example: "Mechanically (by a force)" — student writing just "mechanically" is fully correct. They do not need to add "by a force".
   Example: "Insulate the container (lid and/or lagging)" — "insulate the beaker" or "put a lid on it" is fully correct.
   Example: "Thermal (internal) store" — "thermal store" or "internal store" is fully correct.

4. PICK-FROM-LIST — when the model answer begins "Any N of:" or ends with "(any N)" or "(any one)" / "(any two)" / "(any three)", the student needs to give that many valid items from the listed options.
   - Items count even with different word forms or common synonyms (e.g. "sun" for "solar", "wind power" for "wind", "petrol" for "oil", "gas" for "natural gas", "hydro" for "hydroelectric").
   - Do NOT double-count synonyms — "solar" and "sun" are the same item, count once.
   - marks_awarded = number of unique valid items the student gave, capped at the question's marks value.
   - Set correct=true ONLY if marks_awarded equals the full marks for the question; otherwise correct=false with partial marks_awarded.
   - Worked example A (3-mark question, model answer "Any three of: solar, wind, hydroelectric, tidal, wave, geothermal, biofuel"): student writes "wind and the sun and tides" → 3 unique valid items → marks_awarded=3, correct=true.
   - Worked example B (same question, same model answer): student writes "solar power and wind" → 2 unique valid items → marks_awarded=2, correct=false.
   - Worked example C (1-mark question, model answer "Coal, oil, natural gas, nuclear (any one)"): student writes "coal" → marks_awarded=1, correct=true. Student writes "coal and gas" → still marks_awarded=1, correct=true (full marks already reached).

MARKING PRINCIPLES:
- Accept correct scientific content even with poor spelling, informal language, or incomplete sentences.
- Accept equivalent scientific explanations that differ in wording from the model answer.
- Do NOT accept vague answers that gesture at the right area without demonstrating actual knowledge (e.g. "something to do with cells", "it helps the body").
- Do NOT accept answers that are scientifically incorrect or contradict the model answer.
- For questions worth 2+ marks, the student must address multiple distinct points — partial credit only if they clearly demonstrate some knowledge.

MARK CORRECT if:
- The core scientific concept from the model answer is clearly present.
- A valid alternative scientific explanation is given.
- The answer uses equivalent notation (symbols, shorthand units, formulae) as described above.
- The answer matches one of the explicit alternatives or equivalent forms given in the model answer.
- Minor details are missing but the key idea is unambiguously demonstrated.

MARK INCORRECT if:
- The answer is scientifically wrong.
- The answer is too vague to confirm understanding.
- The answer is off-topic or unrelated.
- The answer has the right structure but a wrong value/unit (e.g. model says "2000 m" and student writes "2000 km" — that's wrong).

SET flagged: true if the answer is clearly not a genuine attempt:
- Restating or closely paraphrasing the question back as an answer.
- Generic filler with no scientific content ("I think so", "yes it does", "the thing").
- Random or incoherent words that happen to pass a spam filter.
- Anything that would insult a teacher's intelligence as an attempt.

CONFIDENCE FIELD:
- Set confidence to "high" when the science is unambiguously right or unambiguously wrong, the answer is well-formed, and a colleague would mark it the same way without hesitation.
- Set confidence to "medium" or "low" for borderline calls, partial credit cases, ambiguous wording, or any answer where another teacher could reasonably disagree with you.

EXTENDED EQUIVALENCE REFERENCE — treat each pairing below as identical in meaning. The student never loses a mark for choosing the shorthand form over the written-out form, or vice versa.

Element symbols (case does not matter — "fe", "FE" and "Fe" all mean iron):
H = hydrogen, He = helium, Li = lithium, Be = beryllium, B = boron, C = carbon, N = nitrogen, O = oxygen, F = fluorine, Ne = neon, Na = sodium, Mg = magnesium, Al = aluminium (also accept the US spelling "aluminum"), Si = silicon, P = phosphorus, S = sulfur (also accept "sulphur"), Cl = chlorine, Ar = argon, K = potassium, Ca = calcium, Fe = iron, Cu = copper, Zn = zinc, Br = bromine, Ag = silver, Sn = tin, I = iodine, Ba = barium, Pt = platinum, Au = gold, Hg = mercury, Pb = lead, U = uranium.

Common ions (the charge may be written "2+", "+2" or with a superscript — all acceptable):
H+ = hydrogen ion, OH- = hydroxide ion, Na+ = sodium ion, K+ = potassium ion, Cl- = chloride ion, Ca2+ = calcium ion, Mg2+ = magnesium ion, Fe2+ = iron(II) ion, Fe3+ = iron(III) ion, Cu2+ = copper ion, Al3+ = aluminium ion, CO3 2- = carbonate ion, SO4 2- = sulfate ion, NO3- = nitrate ion, NH4+ = ammonium ion, O2- = oxide ion.

Common compounds (formula = name; everyday names in brackets are also acceptable):
H2O = water, CO2 = carbon dioxide, CO = carbon monoxide, O2 = oxygen gas, N2 = nitrogen gas, H2 = hydrogen gas, Cl2 = chlorine gas, NaCl = sodium chloride (= common salt), CaCO3 = calcium carbonate (= limestone, chalk or marble), CaO = calcium oxide (= quicklime), Ca(OH)2 = calcium hydroxide (= slaked lime; its solution = limewater), HCl = hydrochloric acid, H2SO4 = sulfuric acid, HNO3 = nitric acid, NaOH = sodium hydroxide, KOH = potassium hydroxide, NH3 = ammonia, CH4 = methane, C2H6 = ethane, C2H4 = ethene, C6H12O6 = glucose, NaHCO3 = sodium hydrogencarbonate (= bicarbonate of soda), CuSO4 = copper sulfate.

Units (symbol = word; the space between number and unit is optional; superscripts/subscripts are optional):
m = metre, cm = centimetre, mm = millimetre, km = kilometre, g = gram, kg = kilogram, mg = milligram, t = tonne, s = second, min = minute, h = hour, N = newton, J = joule, kJ = kilojoule, MJ = megajoule, W = watt, kW = kilowatt, V = volt, mV = millivolt, A = ampere (= amp), mA = milliamp, C = coulomb (judge C as coulomb vs carbon by the quantity), ohm = the resistance unit (the symbol may be written "ohm" or the omega character), Pa = pascal, kPa = kilopascal, Hz = hertz, kHz = kilohertz, degrees C = degrees Celsius, K = kelvin, mol = mole. Compound units: m/s = metres per second (also accept "ms^-1"), m/s^2 = metres per second squared (also accept "ms^-2"), N/kg = newtons per kilogram (numerically the same as m/s^2 for gravitational field strength), kg/m^3 = kilograms per cubic metre, cm^3 = cubic centimetre (= millilitre, ml, for liquids), dm^3 = cubic decimetre (= litre, l), J/s = joules per second (= watt).

UNIT-CONVERSION RULE: if the student converts the model answer to a different but equivalent SI form, that is fully correct provided the magnitude is unchanged (model "0.5 m" and student "50 cm" are both correct; model "2 kg" and student "2000 g" are both correct). But if the student keeps the model answer's NUMBER and only swaps the unit so the magnitude is now wrong, mark it incorrect (model "2000 m", student "2000 km" is wrong because that is a thousand times too big).

SUBJECT-SPECIFIC MARKING NOTES:

Biology:
- Accept the everyday name alongside the technical term: windpipe = trachea, voice box = larynx, gullet = oesophagus, kneecap = patella, white blood cell = leucocyte, red blood cell = erythrocyte, germ = pathogen/microbe.
- Be strict about near-homophones that name DIFFERENT things — a wrong one is incorrect, not a typo: mitosis vs meiosis; aerobic vs anaerobic; artery vs arteriole vs vein; ureter vs urethra; glucose vs glycogen vs glucagon; transcription vs translation; pollination vs fertilisation; dominant vs recessive. Award the mark only when the student's term is the correct one for the question.
- Diffusion, osmosis and active transport are distinct processes — do not treat them as synonyms for one another.
- For genetics, single-letter genotypes are valid full answers (for example "Bb", "ff", "XY"). Case is significant: a capital letter (dominant allele) is not the same as the lower-case letter (recessive allele).
- For "describe a method / how to make it a fair test" answers, award the control-variable or repeat-and-mean ideas even if phrased informally.

Chemistry:
- Word equations: accept correct reactants and products even when "+" is written as "and" and the arrow is written as "gives", "yields", "makes" or "produces". A correctly balanced symbol equation may be given in place of a word equation, and vice versa, as long as the chemistry is right.
- State symbols (s), (l), (g), (aq) are only required when the question explicitly asks for them; do not withhold a mark for omitting them otherwise.
- Burning, combustion and "reacting with oxygen" are equivalent for a combustion question.
- For "name the gas / test for a gas" answers, accept the standard result descriptions (for example "relights a glowing splint" for oxygen, "limewater turns milky/cloudy" for carbon dioxide, "squeaky pop" for hydrogen).
- pH: if the question asks for a value, a word ("acidic"/"alkaline") alone is incomplete; if it asks to classify, the word is fine.

Physics:
- Accept the named equation, the symbol equation or a correct rearrangement interchangeably (for example "force = mass x acceleration", "F = ma" and "a = F/m" are the same relationship).
- A "calculate" answer is correct when both the value and the unit are right. A correct value with the unit missing caps at partial marks unless the question already states the unit.
- Rounding / significant figures: accept any sensible rounding of the correct value unless the question pins a precision (model "9.8 N/kg" and student "10 N/kg" or "9.81 N/kg" are all acceptable).
- Distinguish vector and scalar quantities only when the question turns on the difference: distance vs displacement, speed vs velocity, mass vs weight. Otherwise mark leniently.
- Energy stores and pathways: "heat energy", "thermal energy" and "internal energy" are interchangeable at this level; "movement energy" = kinetic; gravitational, elastic and chemical stores should be judged from the scenario.

COMMON ACCEPTABLE PHRASINGS:
- Trend language: "goes up", "increases", "rises" and "gets bigger" are equivalent; "goes down", "decreases", "drops", "falls" and "gets smaller" are equivalent.
- Causal language: an explanation that gives the correct cause earns the mark even without the literal word "because", as long as the cause-and-effect link is clear.
- Comparative language: "more than", "greater than", "higher than" and "bigger than" are equivalent, as are their opposites.

ADDITIONAL WORKED EXAMPLES:
- Clarification bracket: model answer "Combustion (burning)", student writes "burning" -> correct; the bracket is a gloss, not a second required word.
- Explicit alternative: model answer "0.5 (accept 1/2 or 50%)", student writes "50%" -> correct.
- Equivalent form: model answer "It doubles (multiplied by 2)", student writes "it becomes twice as big" -> correct.
- Pick-from-list, full marks: 2-mark question, model answer "Any two of: friction, air resistance, water resistance, drag", student writes "friction and drag" -> two unique valid items -> marks_awarded 2, correct true.
- Pick-from-list, partial: same question, student writes "friction" only -> one valid item -> marks_awarded 1, correct false.
- Pick-from-list, synonym guard: model answer "Any two of: solar, wind, hydroelectric", student writes "the sun and solar panels" -> "sun" and "solar" are the same item, count once -> one unique item -> marks_awarded 1, correct false.
- Equivalent notation: model answer "carbon dioxide", student writes "CO2" -> correct. Model answer "9.8 m/s^2", student writes "9.8 N/kg" -> correct (same quantity).
- Wrong near-homophone: model answer "meiosis", student writes "mitosis" -> incorrect, different process, confidence high.
- Vague non-answer: model answer "Mitochondria release energy during respiration", student writes "it makes energy for the cell" -> if the key idea (releases/transfers energy) is present, award; if it only gestures vaguely ("does stuff for the cell"), mark incorrect.

PARTIAL CREDIT FOR MULTI-MARK QUESTIONS:
- For a question worth 2 or more marks, identify the distinct creditworthy points in the model answer and award one mark per point the student clearly demonstrates, up to the maximum.
- Do not award a mark twice for the same point made in two different ways.
- A student can earn some but not all marks; in that case set correct to false and set marks_awarded to the number of points earned.

FEEDBACK STYLE:
- For a fully correct answer (correct=true), set feedback to exactly "Correct." and nothing more. A pupil who got it right does not need an explanation, and the one word keeps the response short. Do NOT add a sentence, do NOT restate the answer.
- For an incorrect, partially-correct, or flagged answer, write ONE concise sentence addressed to the pupil — plain, honest and encouraging, never sarcastic — saying what was needed without simply printing the whole model answer back; give them enough to learn the point.

NUMERICAL ANSWERS:
- When the model answer is a single number, the student is correct if their number matches it, regardless of how it is written: "2000", "2,000", "2 000" and "2x10^3" are the same value, and "0.5", ".5" and "1/2" are the same value.
- Accept a correct answer given in standard form or ordinary form interchangeably (for example "0.0045" and "4.5x10^-3").
- If the question or model answer implies a tolerance (for example a value read from a graph), accept answers within a sensible range around the model value rather than demanding an exact match.
- A trailing or leading unit attached without a space ("50cm", "5N", "10s") is fine; do not penalise spacing.
- If the student shows correct working but makes a single arithmetic slip in the final figure, use your judgement: for a low-tariff retrieval item, a clearly-correct method with a minor slip may still earn partial credit; a wholly wrong value earns none.

COMMON MISCONCEPTIONS — these are wrong; do not award the mark, and you can usually be high confidence:
- "Plants get their food/mass from the soil" — wrong; mass comes mostly from carbon dioxide via photosynthesis.
- "Photosynthesis is how plants breathe" or "respiration only happens in animals" — wrong; respiration happens in all living cells, plants included.
- "Heavier objects fall faster (ignoring air resistance)" — wrong in a vacuum / when air resistance is negligible.
- "Mass and weight are the same thing" — wrong; weight is a force (newtons), mass is in kilograms.
- "Current is used up as it goes round a circuit" — wrong; current is the same all the way round a series circuit.
- "Atoms are alive" or "cells and atoms are the same size/thing" — wrong.
- "Evolution happens because animals want to / try to change" — wrong; it is natural selection acting on variation.
- "A bigger coefficient of friction always means slower" stated as a law without reasoning — judge in context.
Mark these incorrect even if the rest of the sentence is fluent and confident.

TOPIC-BY-TOPIC CREDIT GUIDANCE (use to identify the creditworthy points in a model answer):
- Cells and microscopy: award for naming the correct organelle and its function; do not accept a function pinned to the wrong organelle.
- Body systems: award for the correct organ and its role; respiratory, circulatory, digestive and nervous system parts must match their stated function.
- Atomic structure: protons, neutrons and electrons have distinct charges and locations — award only when the particle, its relative charge and (if asked) its location are correctly matched.
- Bonding: ionic = transfer of electrons / oppositely charged ions; covalent = shared pair(s) of electrons; metallic = lattice of positive ions in a sea of delocalised electrons. These are not interchangeable.
- Rates of reaction: award for any valid factor (temperature, concentration, surface area, catalyst) and, for an explanation, the collision-frequency or energy idea.
- Forces and motion: award for the correct equation, correct substitution and correct evaluation as separate creditworthy points where the question allows.
- Energy: award for naming the correct store and the correct pathway (mechanical, electrical, heating, radiation) and, where asked, for conservation or efficiency reasoning.
- Waves: distinguish transverse and longitudinal; frequency, wavelength and amplitude are distinct quantities and must not be swapped.
- Ecology: award for correct trophic terms (producer, primary consumer, predator, prey, decomposer) used consistently with the food chain in the question.

EDGE CASES IN WORDING:
- A student who answers in a complete sentence, a single word, or bullet-style fragments should be marked on the science, not the format.
- Phonetic or badly-spelled attempts at the right term are acceptable when the intended word is unambiguous (for example "fotosynthesis", "mitokondria"); they become a problem only when the misspelling collides with a different real term (see the near-homophone rule above).
- Capitalisation, punctuation and grammar never cost marks on their own.
- An answer in a language other than English that is nonetheless scientifically correct should be judged on its science where you can read it; if it is unintelligible, treat it as you would any non-attempt.

Respond ONLY with valid JSON, no backticks: {"correct":true/false,"marks_awarded":<int 0 to marks>?,"feedback":"<one concise sentence>","flagged":true/false,"confidence":"high"|"medium"|"low"}`;

function extractNumbers(text: string): string[] {
  const matches = text.match(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g);
  return matches ? matches.map(m => m.replace(/^-/, "")) : [];
}

function checkNumericalMatch(modelAnswer: string, studentAnswer: string): boolean {
  const modelNums = extractNumbers(modelAnswer);
  if (modelNums.length !== 1) return false;
  const studentNums = extractNumbers(studentAnswer);
  return studentNums.includes(modelNums[0]);
}

// Normalise an answer for cache lookup. Conservative: lowercase, strip
// punctuation (but keep hyphens for compound terms), drop leading articles,
// collapse whitespace. Do NOT do edit-distance or stemming.
function normalise(text: string): string {
  let t = (text || "").toLowerCase().trim();
  // Strip punctuation except hyphens and apostrophes-in-words
  t = t.replace(/[.,;:!?\"“”‘’()\[\]{}\/\\]/g, " ");
  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  // Strip leading articles
  t = t.replace(/^(the|a|an)\s+/, "");
  return t;
}

// Check the length floor: cached answer must be at least 60% of model answer length
// OR at least 3 words long. This catches "yes" / "I don't know" / "blood pumps" cases.
function passesLengthFloor(studentAnswer: string, modelAnswer: string): boolean {
  const studentWords = studentAnswer.trim().split(/\s+/).filter(Boolean);
  const modelWords = modelAnswer.trim().split(/\s+/).filter(Boolean);
  if (studentWords.length >= MIN_ANSWER_WORDS) return true;
  // Below MIN_ANSWER_WORDS: only allow if it's at least MIN_LENGTH_RATIO of the model answer
  if (modelWords.length === 0) return false;
  return studentWords.length / modelWords.length >= MIN_LENGTH_RATIO;
}

// Resolve the school that owns a class, so every usage row can be attributed to a
// school (exact per-school cost + fair-use metering). Cached in module scope: a class
// never changes school within a warm instance, so this is one DB lookup per class, not
// per request — the deterministic fast paths stay fast.
const schoolIdCache = new Map<string, string | null>();
async function resolveSchoolId(class_id: string | undefined): Promise<string | null> {
  if (!sb || !class_id) return null;
  if (schoolIdCache.has(class_id)) return schoolIdCache.get(class_id) ?? null;
  try {
    const { data } = await sb.from("classes").select("school_id").eq("id", class_id).single();
    const sid = (data?.school_id as string) ?? null;
    schoolIdCache.set(class_id, sid);
    return sid;
  } catch {
    return null;
  }
}

// Hard cost backstop: true when a school's AI-mark usage is >3x its fair-use
// allowance (school_mark_status RPC). The soft cap (admin Schools view) never blocks
// pupils; this only ever catches genuine runaway/abuse. Per-instance cached 5 min,
// and fails OPEN on any error (a transient DB issue must never block real marking).
// Comped pilots and uncapped/unknown plans always return false.
const markBackstopCache = new Map<string, { over: boolean; ts: number }>();
async function overBackstop(school_id: string | null): Promise<boolean> {
  if (!sb || !school_id) return false;
  const hit = markBackstopCache.get(school_id);
  if (hit && (Date.now() - hit.ts) < 300000) return hit.over;
  try {
    const { data, error } = await sb.rpc("school_mark_status", { p_school_id: school_id });
    if (error) return false;
    const row = Array.isArray(data) ? data[0] : data;
    const over = !!(row && row.over_backstop);
    markBackstopCache.set(school_id, { over, ts: Date.now() });
    return over;
  } catch {
    return false;
  }
}

// Fire-and-forget AI usage logging. `source` tags the row so the admin cost dashboard
// can break spend down (ai / ai_double_check); `school_id` attributes it to a school.
function logUsage(label: string, source: string, school_id: string | null, usage: Record<string, unknown> | undefined) {
  if (!sb || !usage) return;
  const row = {
    call_label: label,
    source,
    school_id,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    cache_creation_tokens: Number(usage.cache_creation_input_tokens) || 0,
    cache_read_tokens: Number(usage.cache_read_input_tokens) || 0,
  };
  sb.from("ai_usage").insert(row).then(() => {}).catch((e) => console.error("ai_usage insert failed:", e));
}

// Fire-and-forget logging of a NO-AI marking (numerical_match / exact_match / cache /
// client_flagged). Writes a zero-token row so the cost dashboard sees the full
// free-vs-AI blend — every marking is exactly one entry-point row ('first' for an AI
// mark, 'shortcut' for these). This is the data behind the dashboard's per-marking cost.
function logShortcut(source: string, school_id: string | null) {
  if (!sb) return;
  sb.from("ai_usage").insert({
    call_label: "shortcut",
    source,
    school_id,
    input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0,
  }).then(() => {}).catch(() => {});
}

async function callAiMark(label: string, source: string, school_id: string | null, question: string, model_answer: string, student_answer: string, marks: number) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{
        role: "user",
        // Per-question cache breakpoint: the question + model answer are identical for
        // every pupil marked on this question, so this block (which sits on top of the
        // always-warm system prompt) is cached and re-read across pupils whenever the
        // same question is marked again inside the 5-min TTL — e.g. a whole class doing
        // the same retrieval quiz. The student answer varies per pupil, so it is a
        // separate, uncached block AFTER the breakpoint. Concatenated, the model sees
        // exactly the same text as before, so marking is unchanged. (2 breakpoints total
        // with the system prompt; the API cap is 4.)
        content: [
          {
            type: "text",
            text: `Question (${marks} mark${marks > 1 ? 's' : ''}): ${question}\nModel answer: ${model_answer}`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: `\nStudent wrote: ${student_answer}` },
        ],
      }],
    }),
  });
  const data = await response.json();
  logUsage(label, source, school_id, data?.usage);
  const text = data.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// Look for an authoritative cache entry. Returns the entry only if it is
// authoritative (>=3 confirmations) AND not stale (age, hit count).
async function tryCacheLookup(question_id: string | undefined, normalised: string) {
  if (!sb || !question_id) return null;
  try {
    const { data, error } = await sb
      .from("accepted_answers")
      .select("id, marks_awarded, feedback, confirmation_count, hit_count, last_verified_at")
      .eq("question_id", question_id)
      .eq("normalised_answer", normalised)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const entry = data[0];
    if ((entry.confirmation_count ?? 0) < CONFIRMATION_THRESHOLD) return null;
    if ((entry.hit_count ?? 0) >= MAX_HITS_BEFORE_REVERIFY) return null;
    const ageDays = (Date.now() - new Date(entry.last_verified_at).getTime()) / 86400000;
    if (ageDays >= MAX_AGE_DAYS_BEFORE_REVERIFY) return null;
    return entry;
  } catch (e) {
    console.error("cache lookup failed:", e);
    return null;
  }
}

// Increment hit_count when serving from cache. Fire-and-forget.
function recordCacheHit(entryId: number) {
  if (!sb) return;
  sb.rpc("increment_accepted_answer_hit", { entry_id: entryId }).then(() => {}).catch(() => {
    // Fallback: direct update if RPC missing
    sb.from("accepted_answers").update({ hit_count: { increment: 1 } as unknown as number }).eq("id", entryId).then(() => {}).catch(() => {});
  });
}

// Direct update via raw SQL through service role (since the RPC may not exist)
async function bumpHitCount(entryId: number) {
  if (!sb) return;
  try {
    await sb.from("accepted_answers").select("hit_count").eq("id", entryId).single().then(async (r) => {
      const next = (r.data?.hit_count ?? 0) + 1;
      await sb.from("accepted_answers").update({ hit_count: next }).eq("id", entryId);
    });
  } catch (e) {
    console.error("hit count update failed:", e);
  }
}

// Either insert a new cache entry, or increment the confirmation_count on an existing one.
async function recordCacheConfirmation(question_id: string, normalised: string, marks_awarded: number, feedback: string) {
  if (!sb || !question_id) return;
  try {
    const existing = await sb
      .from("accepted_answers")
      .select("id, confirmation_count")
      .eq("question_id", question_id)
      .eq("normalised_answer", normalised)
      .eq("marks_awarded", marks_awarded)
      .limit(1);
    if (existing.error) throw existing.error;
    if (existing.data && existing.data.length > 0) {
      const row = existing.data[0];
      await sb.from("accepted_answers").update({
        confirmation_count: (row.confirmation_count ?? 0) + 1,
        last_verified_at: new Date().toISOString(),
        // COST LEVER 2: reset the hit counter on every (re)confirmation. This only
        // ever runs on the AI path — a fresh confirmation or a periodic re-verify,
        // never on a plain cache serve — so resetting it here is exactly what lets a
        // re-verified popular entry start serving from cache again for the next
        // MAX_HITS_BEFORE_REVERIFY hits instead of AI-marking every pupil forever.
        hit_count: 0,
        feedback,
      }).eq("id", row.id);
    } else {
      await sb.from("accepted_answers").insert({
        question_id,
        normalised_answer: normalised,
        marks_awarded,
        feedback,
        confirmation_count: 1,
        hit_count: 0,
      });
    }
  } catch (e) {
    console.error("cache confirmation write failed:", e);
  }
}

// Identify the calling pupil from their Supabase JWT. Returns null when there is
// no user token (e.g. older clients that send only the anon apikey), in which
// case the function stays a pure marking endpoint and records nothing.
async function getAuthedUid(req: Request): Promise<string | null> {
  if (!sb) return null;
  const authz = req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { data, error } = await sb.auth.getUser(m[1]);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Write the marked response server-side (service role), but ONLY for the
// authenticated pupil and ONLY in a class they belong to. This is what makes the
// grade authoritative: the stored is_correct / marks_awarded come from here, not
// from a value the browser sent. Returns the new row id, or null if it could not
// be recorded (the caller then just returns the verdict, no response_id).
async function recordResponse(
  uid: string | null,
  question_id: string | undefined,
  class_id: string | undefined,
  student_answer: string,
  verdict: { correct: boolean; marks_awarded: number; feedback: string; flagged: boolean },
): Promise<string | null> {
  if (!sb || !uid || !question_id || !class_id) return null;
  try {
    const mem = await sb
      .from("class_members")
      .select("student_id")
      .eq("class_id", class_id)
      .eq("student_id", uid)
      .limit(1);
    if (mem.error || !mem.data || mem.data.length === 0) return null;
    const ins = await sb
      .from("responses")
      .insert({
        student_id: uid,
        question_id,
        class_id,
        student_answer,
        is_correct: verdict.correct,
        marks_awarded: verdict.marks_awarded,
        ai_feedback: verdict.flagged ? "FLAGGED: " + verdict.feedback : verdict.feedback,
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) return null;
    return ins.data.id as string;
  } catch (e) {
    console.error("response insert failed:", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { question, model_answer, student_answer, marks, question_id, class_id, prejudged_flagged } = await req.json();

    if (!question || !model_answer || !student_answer) {
      return json({ error: "Missing fields" }, 400);
    }

    const maxMarks = Number(marks) || 1;
    const schoolId = await resolveSchoolId(class_id);

    // ── Build the verdict (this is the only place the grade is decided) ──
    let verdict: { correct: boolean; marks_awarded: number; feedback: string; flagged: boolean; source: string };

    if (prejudged_flagged) {
      // The client's cheap heuristic flagged this as a non-attempt. Trusting it
      // can only award 0 / mark incorrect, so a cheating client gains nothing —
      // and it saves an AI call on obvious junk.
      verdict = {
        correct: false, marks_awarded: 0,
        feedback: typeof prejudged_flagged === "string" ? prejudged_flagged : "Flagged as a non-attempt.",
        flagged: true, source: "client_flagged",
      };
    } else if (checkNumericalMatch(model_answer, student_answer)) {
      verdict = { correct: true, marks_awarded: maxMarks, feedback: "Correct.", flagged: false, source: "numerical_match" };
    } else if (normalise(student_answer) === normalise(model_answer)) {
      // COST: deterministic exact match. The student wrote the model answer verbatim
      // (after the same lowercase / punctuation / leading-article normalisation used
      // for the cache key), so it is unambiguously full marks — no AI call needed, and
      // it marks identically every time. Bracketed model answers like "Joules (accept
      // J)" normalise WITH the bracket text, so a bare "joules" does NOT match here and
      // still goes to the AI — there is no false-positive path. Mirrors how
      // numerical_match already trusts the model answer.
      verdict = { correct: true, marks_awarded: maxMarks, feedback: "Correct.", flagged: false, source: "exact_match" };
    } else {
      const normalised = normalise(student_answer);
      const cached = (question_id && normalised.length > 0) ? await tryCacheLookup(question_id, normalised) : null;
      if (cached) {
        bumpHitCount(cached.id);
        verdict = { correct: true, marks_awarded: cached.marks_awarded, feedback: cached.feedback || "Correct.", flagged: false, source: "cache" };
      } else if (!ANTHROPIC_API_KEY) {
        verdict = { correct: false, marks_awarded: 0, feedback: "AI marking not configured.", flagged: false, source: "fallback" };
      } else if (await overBackstop(schoolId)) {
        // Hard cost backstop: this school is >3x its fair-use allowance (see
        // school_mark_status). Skip the paid AI call and don't record a grade — the
        // soft cap never blocks pupils, but this stops genuine runaway/abuse cost.
        verdict = { correct: false, marks_awarded: 0, feedback: "Marking is paused for your school right now — please let your teacher know.", flagged: false, source: "cap_backstop" };
      } else {
        const tryWriteCache = async (result: { correct?: boolean; flagged?: boolean; confidence?: string; marks_awarded?: number; feedback?: string }) => {
          if (!question_id) return;
          if (!result.correct || result.flagged) return;
          if (result.confidence !== "high") return;
          if (!passesLengthFloor(student_answer, model_answer)) return;
          const marksAwarded = (typeof result.marks_awarded === "number" ? result.marks_awarded : maxMarks) | 0;
          await recordCacheConfirmation(question_id, normalised, marksAwarded, result.feedback || "Correct.");
        };

        const first = await callAiMark("first", "ai", schoolId, question, model_answer, student_answer, maxMarks);
        if (first.correct || first.flagged) {
          tryWriteCache(first).catch(() => {});
          verdict = { correct: !!first.correct, marks_awarded: first.marks_awarded ?? (first.correct ? maxMarks : 0), feedback: first.feedback || "", flagged: !!first.flagged, source: "ai" };
        } else {
          // Double-check wrong answers — the model is sometimes harsh on first pass.
          // COST LEVER 3: skip the re-check when the first pass is already high
          // confidence. A confidently-wrong verdict is very rarely overturned on a
          // second look, so re-marking it just burns a whole extra AI call. We only
          // pay for the double-check on medium/low-confidence wrongs — the cases the
          // overturn actually exists for. This trims ~15-20% of calls. A missing or
          // malformed confidence field falls through to !== "high", i.e. we keep the
          // safer old behaviour and still double-check.
          let overturned: { correct?: boolean; marks_awarded?: number; feedback?: string } | null = null;
          if (first.confidence !== "high") {
            try {
              const second = await callAiMark("second", "ai_double_check", schoolId, question, model_answer, student_answer, maxMarks);
              if (second.correct) { tryWriteCache(second).catch(() => {}); overturned = second; }
            } catch (_) {
              // fall through to the confirmed-wrong verdict
            }
          }
          verdict = overturned
            ? { correct: true, marks_awarded: overturned.marks_awarded ?? maxMarks, feedback: overturned.feedback || "", flagged: false, source: "ai_double_check_overturned" }
            : { correct: !!first.correct, marks_awarded: first.marks_awarded ?? 0, feedback: first.feedback || "", flagged: !!first.flagged, source: "ai_double_check_confirmed" };
        }
      }
    }

    // Clamp to [0, maxMarks] no matter the source.
    let awarded = Number(verdict.marks_awarded);
    if (!Number.isFinite(awarded)) awarded = verdict.correct ? maxMarks : 0;
    verdict.marks_awarded = Math.max(0, Math.min(maxMarks, Math.round(awarded)));

    // Log the no-AI markings for the cost dashboard. AI markings already logged their
    // tokens (logUsage 'first'); here we record one zero-token 'shortcut' row per
    // deterministic mark so the dashboard sees the full blend and the true cost-per-mark.
    if (verdict.source === "numerical_match" || verdict.source === "exact_match" ||
        verdict.source === "cache" || verdict.source === "client_flagged") {
      logShortcut(verdict.source, schoolId);
    }

    // ── Record server-side (authenticated pupil, their own class only) ──
    const uid = await getAuthedUid(req);
    // Never persist a backstop "verdict" as a grade — it isn't one.
    const response_id = verdict.source === "cap_backstop" ? null : await recordResponse(uid, question_id, class_id, student_answer, verdict);

    return json({ ...verdict, recorded: response_id !== null, response_id });
  } catch (error) {
    return json({
      correct: false, marks_awarded: 0, feedback: "Marking error — try again.",
      flagged: false, source: "error", recorded: false, response_id: null, error: String(error),
    }, 500);
  }
});
