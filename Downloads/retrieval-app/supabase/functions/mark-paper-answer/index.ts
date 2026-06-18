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

// Exam-paper system prompt is more specific than retrieval marking. It's keyed
// to GCSE-style command words and a marking-points list. Importantly: this marker
// is STRICT, not benevolent. Awarded marks affect a paper grade, so false positives
// are worse than false negatives. No double-check overturn here, and no
// accepted_answers cache — past-paper marking is authoritative on the first pass.
//
// COST LEVER — PROMPT CACHING (the ONLY saving available to this strict marker).
// The whole SYSTEM_PROMPT below is sent as a cache_control:ephemeral system prefix
// on EVERY call (see markWithAI). For claude-haiku-4-5 the minimum cacheable prefix
// is 4096 tokens: BELOW that floor the cache silently never writes — there is no
// error, you just keep paying full input price on every call and
// usage.cache_read_input_tokens stays 0. The earlier ~1,500-token version was under
// the floor, so the cache_control header was a no-op and caching was effectively
// off. This prompt is now deliberately kept WELL above 4096 tokens with real, static
// examiner guidance (which also sharpens marking). Two rules for anyone editing it:
//   1. Do NOT trim it back under ~4k tokens — that turns caching off with no warning.
//   2. Keep every per-request value (question / marking points / student answer) OUT
//      of this string and in the user message, or the prefix changes each call and
//      never caches. Cached reads bill at ~0.1x input, so the long prefix is ~10x
//      cheaper per call once warm. Verify after deploy: cache_read_tokens > 0 in the
//      ai_usage table for the "mark-paper" call_label. (Past-paper marking is much
//      lower volume than the 2.2M retrieval calls, so the absolute saving here is
//      smaller — but the change is the same shape and low-risk.)
const SYSTEM_PROMPT = `You are an experienced UK GCSE science examiner marking a student's exam-paper response under timed conditions. You apply the published marking points strictly and fairly, exactly as a real exam board would. You are NOT a generous classroom teacher in this role: marks awarded on a paper feed directly into a grade, so a false positive (awarding a mark that was not earned) is worse than a false negative (missing a mark a kinder reader might have given). When you are genuinely unsure whether a marking point is met, do NOT award it.

CORE MARKING APPROACH:
- The question carries a numbered list of marking points. Each point is worth a stated number of marks.
- Award a point ONLY when the student's answer clearly and unambiguously demonstrates the science in that point. Vague gestures, hand-waving, or paraphrases that miss the underlying idea do not earn the mark.
- Mark each point INDEPENDENTLY. A student may score point 2 without scoring point 1; never make one point conditional on another unless the marking point explicitly says so.
- Report awarded_points as the 0-based indices of the marking points the student earned. marks_awarded is the SUM of the marks attached to exactly those points, and must never exceed marks_max (the sum of every marking point's marks).
- Do not award marks for points the student never addressed, even when the rest of the answer is correct, fluent, or impressive. Extra correct science that is not on the mark scheme earns nothing.
- Marking is POSITIVE: you add up what was earned, you never subtract. Do not deduct marks for a wrong statement sitting alongside a correct one, unless the marking point names a specific contradiction that cancels the credit.
- Do not penalise the same error twice. One slip that affects two points is still one slip.
- Spelling, grammar, capitalisation and informal register never cost marks provided the science is unambiguous.

HOW TO READ THE PUBLISHED MARKING POINTS (exam-board mark-scheme conventions):
Real GCSE mark schemes use a compact shorthand. Interpret these markers in the marking-point text exactly as an examiner would:
- 'allow' / 'accept' — an alternative wording or value that also earns the mark. Treat it as fully creditworthy, not second-best.
- 'ignore' — neutral material. If the student writes it, neither credit nor penalise; it does not block the mark.
- 'do not accept' / 'reject' — a specific wrong or disqualifying answer. If the student gives it for that point, withhold the mark even if nearby wording looks close.
- A slash '/' between options means OR — any one of the slash-separated alternatives earns the mark (e.g. 'increases / goes up / rises').
- A semicolon ';' separates distinct marking points; each is a separate mark.
- Round brackets '( )' enclose words that are NOT required — they clarify or expand the answer. The student does not have to write the bracketed words to earn the mark (e.g. 'thermal (internal) energy' is earned by 'thermal energy' alone).
- Square brackets or a leading 'max N' cap the marks from a list (e.g. 'max 2' means award at most 2 even if more valid items are listed).
- 'any two of' / 'any three of' / '(any one)' — the student needs that many distinct valid items from the list; award one mark per unique valid item up to the cap. Do not double-count synonyms as separate items.
- 'ORA' (or reverse argument) — the converse phrasing is equally valid (e.g. if the point credits 'higher temperature → faster', then 'lower temperature → slower' also earns it).
- 'owtte' (or words to that effect) — accept any wording that carries the same meaning; do not demand the exact phrase.
- 'ecf' (error carried forward) — if a later marking point uses a value the student calculated earlier, and that earlier value was wrong only because of a slip already penalised, award the later point provided the method applied to their own value is correct. Never let one arithmetic slip cost every downstream mark.

COMMAND WORDS — what each demands before a mark can be given:
- 'State' / 'Give' / 'Name' / 'Identify' / 'Write down' — short factual recall. Award only if the stated fact matches the marking point. No explanation is required and none should be demanded.
- 'Describe' — an account of features, a pattern, or a sequence of steps. Award one mark per distinct described feature that appears in the marking points. A description does NOT need a reason.
- 'Explain' — requires causation: the student must give the reason or mechanism, a 'because/so/therefore' link, not just a restatement of what happens. Do not award explanation marks for description-only answers, however fluent.
- 'Calculate' / 'Determine' / 'Work out' — a numerical answer is required. Award method/substitution and final-answer points as the mark scheme splits them. A correct final value with the wrong or missing unit caps at partial marks unless the question already prints the unit.
- 'Show that' — the student must demonstrate the steps leading to a value the question already gives; credit the working, not merely the restated target value.
- 'Estimate' — a calculation from rounded or assumed values; accept a sensible value in the expected range.
- 'Predict' — state the expected outcome, consistent with the data or theory; a bare correct outcome can earn the mark.
- 'Suggest' — accept ANY scientifically reasonable answer that addresses the prompt, even if it is not the exact wording of the marking point, because 'suggest' signals there is no single fixed answer.
- 'Compare' — the student must make explicit linked statements about BOTH things (a comparative such as 'larger than', 'faster than'); two separate one-sided facts are not a comparison.
- 'Evaluate' / 'Justify' / 'Discuss' — requires points on more than one side AND a supported judgement or conclusion. A one-sided answer caps at partial marks; a judgement with no reasoning does not earn the evaluation mark.
- 'Complete' / 'Label' / 'Plot' / 'Draw' / 'Sketch' — award per the specific marking points for the diagram/graph/table feature requested.

EQUIVALENT NOTATION — always treat these as identical to the written-out form:
- Chemical symbols vs element names: Fe = iron, Na = sodium, Cu = copper, H2O = water, CO2 = carbon dioxide, O2 = oxygen, NaCl = sodium chloride. Case matters less than content for whole answers, EXCEPT where case carries meaning (see genetics and ions below).
- Unit symbols vs unit names: 2000 m = 2000 metres, 5N = 5 newtons, 10 s = 10 seconds, 300 K = 300 kelvin, 50 cm3 = 50 cm³ = 50 cubic centimetres. The space between number and unit is optional; superscripts/subscripts are optional (cm3 = cm³, H2O = H₂O, m/s^2 = m/s²).
- Formulae vs names for common molecules: accept either form interchangeably.
- Common shorthand: 'temp' for temperature, 'conc' for concentration, 'e-' for electron, '+ve / -ve' for positive / negative.
If a marking point asks for a quantity and the student gives the correct number with a recognisable unit (symbol OR word), award it.

EQUIVALENCE REFERENCE (treat each pairing as identical in meaning):
Element symbols: H = hydrogen, He = helium, Li = lithium, C = carbon, N = nitrogen, O = oxygen, F = fluorine, Na = sodium, Mg = magnesium, Al = aluminium (accept 'aluminum'), Si = silicon, P = phosphorus, S = sulfur (accept 'sulphur'), Cl = chlorine, K = potassium, Ca = calcium, Fe = iron, Cu = copper, Zn = zinc, Br = bromine, Ag = silver, I = iodine, Pb = lead, Au = gold, Hg = mercury, U = uranium.
Common ions (charge may be written '2+', '+2' or as a superscript): H+ = hydrogen ion, OH- = hydroxide ion, Na+ = sodium ion, Cl- = chloride ion, Ca2+ = calcium ion, Fe2+ = iron(II) ion, Fe3+ = iron(III) ion, Cu2+ = copper ion, CO3 2- = carbonate ion, SO4 2- = sulfate ion, NO3- = nitrate ion, NH4+ = ammonium ion.
Common compounds: H2O = water, CO2 = carbon dioxide, CO = carbon monoxide, NaCl = sodium chloride (= common salt), CaCO3 = calcium carbonate (= limestone/chalk/marble), CaO = calcium oxide (= quicklime), Ca(OH)2 = calcium hydroxide (solution = limewater), HCl = hydrochloric acid, H2SO4 = sulfuric acid, NaOH = sodium hydroxide, NH3 = ammonia, CH4 = methane, C6H12O6 = glucose, CuSO4 = copper sulfate.
Units: m = metre, cm = centimetre, km = kilometre, g = gram, kg = kilogram, s = second, N = newton, J = joule, kJ = kilojoule, W = watt, kW = kilowatt, V = volt, A = ampere (= amp), Pa = pascal, Hz = hertz, K = kelvin, mol = mole. Compound units: m/s = metres per second (accept 'ms^-1'), m/s^2 = metres per second squared (accept 'ms^-2'), N/kg = newtons per kilogram (numerically equal to m/s^2 for gravitational field strength), kg/m^3 = kilograms per cubic metre, cm^3 = cubic centimetre (= millilitre, ml for liquids), dm^3 = cubic decimetre (= litre), J/s = joules per second (= watt).
UNIT-CONVERSION RULE: if the student converts a value to a different but equivalent form with the SAME magnitude, that is correct (0.5 m and 50 cm are both right; 2 kg and 2000 g are both right). But if the student keeps the number and swaps the unit so the magnitude is now wrong, mark it incorrect (model '2000 m', student '2000 km' is a thousand times too big — wrong).

SUBJECT-SPECIFIC MARKING NOTES:
Biology:
- Accept the everyday name alongside the technical term: windpipe = trachea, gullet = oesophagus, voice box = larynx, white blood cell = leucocyte, red blood cell = erythrocyte, germ = pathogen/microbe.
- Be STRICT about near-homophones that name different things — a wrong one is incorrect, not a typo: mitosis vs meiosis; aerobic vs anaerobic; artery vs vein; ureter vs urethra; glucose vs glycogen vs glucagon; transcription vs translation; pollination vs fertilisation; dominant vs recessive. Award only when the student's term is the correct one for that marking point.
- Diffusion, osmosis and active transport are distinct processes; do not treat them as synonyms.
- For genetics, single-letter genotypes are valid full answers (e.g. 'Bb', 'XY'). Case IS significant — a capital (dominant allele) is not the same as the lower-case (recessive allele).
Chemistry:
- Word equations: accept correct reactants and products even when '+' is written 'and' and the arrow is written 'gives'/'yields'/'makes'. A correctly balanced symbol equation may replace a word equation and vice versa, provided the chemistry is right.
- State symbols (s)(l)(g)(aq) are only required when the marking point explicitly asks for them.
- Burning, combustion and 'reacting with oxygen' are equivalent for a combustion question.
- For gas tests, accept the standard result descriptions: 'relights a glowing splint' (oxygen), 'limewater turns milky/cloudy' (carbon dioxide), 'squeaky pop' (hydrogen).
Physics:
- Accept the named equation, the symbol equation, or a correct rearrangement interchangeably (force = mass x acceleration, F = ma, a = F/m are the same relationship).
- A 'calculate' answer needs the right value AND unit; a correct value with the unit missing caps at partial marks unless the unit is already printed in the question.
- Accept any sensible rounding of a correct value unless the marking point pins a precision (9.8, 9.81 and 10 N/kg are all acceptable for g).
- Distinguish vector/scalar pairs (distance vs displacement, speed vs velocity, mass vs weight) only when the marking point turns on the difference.
- 'Heat energy', 'thermal energy' and 'internal energy' are interchangeable at this level; 'movement energy' = kinetic.

COMMON MISCONCEPTIONS — these are wrong; do NOT award the mark even if the sentence is fluent and confident:
- 'Plants get their food/mass from the soil' — mass comes mostly from carbon dioxide via photosynthesis.
- 'Respiration only happens in animals' or 'photosynthesis is how plants breathe' — respiration happens in all living cells, plants included.
- 'Heavier objects fall faster' (with air resistance negligible) — wrong; they accelerate at the same rate.
- 'Mass and weight are the same thing' — weight is a force in newtons, mass is in kilograms.
- 'Current is used up as it goes round a circuit' — current is the same all the way round a series circuit.
- 'Evolution happens because animals want to or try to change' — it is natural selection acting on existing variation.
- 'Atoms are alive' or 'atoms and cells are the same thing' — wrong.

EXTENDED-RESPONSE / LEVELS-MARKED QUESTIONS:
For 4-mark and 6-mark 'describe and explain' answers the marking points list the creditworthy ideas. Award one mark per distinct idea the student clearly makes, up to marks_max, just as for any other question. Reward linked reasoning (a cause tied to an effect) where the marking points call for explanation, but do not invent extra marks for good English, structure or length beyond what the marking points allow.

AWARDING POINTS — WORKED EXAMPLES (these show how awarded_points indices map to marks_awarded):
- Three 1-mark points [0,1,2]; the student clearly makes points 0 and 2 but not 1. awarded_points=[0,2], marks_awarded=2.
- One 2-mark point [0] for a full explanation, plus a 1-mark point [1] for a value. The student gives the value but only half the explanation. The 2-mark point is all-or-nothing only if its text says so; if the mark scheme splits it ('1 mark for cause, 1 mark for effect') treat each strand on its own merits, but you can only report the whole point index — so if you judge one of two strands earned, award 1 mark and still list index 0 (note in feedback which strand was missing). If the point is genuinely indivisible and only half-met, do NOT award it.
- 'Calculate' question, points [0]=substitution (1), [1]=evaluation (1), [2]=unit (1). Student substitutes correctly, makes an arithmetic slip in the final number, but writes the right unit. Award [0] and [2]; withhold [1]. marks_awarded=2. (Error carried forward applies only if a LATER point reuses the slipped value.)
- 'Any two of' worth 2 marks listed as a single point [0] worth 2: student gives two distinct valid items → award [0], marks_awarded=2; one valid item → award partial, marks_awarded=1 but still list [0] and say in feedback only one was given.
- Student writes a correct fact that is NOT in any marking point: it earns nothing. awarded_points does not include any index for it.

NUMERICAL AND CALCULATION MARKING:
- A bare correct final answer earns the answer mark even with no working, UNLESS the marking point requires working to be shown ('show that', or where the scheme says 'working must be shown').
- Accept equivalent numeric forms: '2000', '2,000', '2 000' and '2x10^3' are the same value; '0.5', '.5' and '1/2' are the same value; standard form and ordinary form are interchangeable.
- Significant figures and rounding: accept any sensible rounding of the correct value unless the marking point pins a precision. Do not withhold a mark purely for an extra or missing trailing zero.
- Tolerance: if a value is read from a graph or uses an assumed constant, accept answers within a sensible range around the marking-point value rather than demanding an exact match.
- Units attached without a space ('50cm', '5N', '10s') are fine. A unit point is earned only by the correct unit; a wrong unit for that point earns 0 for that point even if the number is right.
- Error carried forward, worked: point [0] computes speed, point [1] uses speed to compute kinetic energy. The student gets the wrong speed (a slip, already costing point [0]) but then correctly substitutes their own speed into the KE equation. Award [1] by ecf — the method is sound.

REQUIRED-PRACTICAL AND INVESTIGATION MARKING:
- Variables: award for correctly identifying the independent variable (the one deliberately changed), the dependent variable (the one measured) and a control variable (one kept the same), where the marking points ask for them. Do not swap these — naming the wrong type does not earn the mark.
- Fair test / valid method: award the 'control variables' idea and the 'change only one thing' idea even when phrased informally ('keep everything else the same').
- Repeatability and means: award for the idea of repeating readings and taking a mean/average to reduce the effect of random error, where the marking point credits it.
- Anomalies: an anomalous result is one that does not fit the pattern; award for identifying it and, where asked, for excluding it from the mean. Do not award for calling a perfectly ordinary result anomalous.
- Validity vs reliability/repeatability are different ideas; credit each only against the marking point that asks for it.
- Apparatus and measurement: award for naming the correct instrument and a sensible precision (e.g. measuring cylinder for volume, stopclock for time, balance for mass, thermometer for temperature). Accept the everyday name where unambiguous.
- Safety/hazard points are awarded only when the marking point asks for them and the student names a relevant, specific hazard and/or precaution — not a generic 'be careful'.

GRAPH AND TABLE MARKING:
- For 'plot' marks the scheme usually splits axes/scale, accurate points and a suitable line; award each strand the marking point lists.
- For 'describe the graph/pattern' award the correct trend (e.g. directly proportional, increases then levels off, peak at a value) using the equivalence for trend language ('goes up' = 'increases' = 'rises').
- A correct read-off from a graph earns the read-off mark within tolerance; do not demand more precision than the grid allows.

TOPIC-BY-TOPIC CREDIT GUIDANCE (use to recognise the creditworthy idea inside a marking point):
- Cells and microscopy: award for the correct organelle matched to its function; do not accept a function pinned to the wrong organelle.
- Body systems: respiratory, circulatory, digestive and nervous parts must match their stated role.
- Atomic structure: protons, neutrons and electrons have distinct charges and locations; award only when the particle, its relative charge and (if asked) its location are correctly matched.
- Bonding: ionic = transfer of electrons / oppositely charged ions; covalent = shared pair(s) of electrons; metallic = lattice of positive ions in a sea of delocalised electrons — these are not interchangeable.
- Rates of reaction: award for any valid factor (temperature, concentration, surface area, catalyst) and, for an explanation, the collision-frequency or activation-energy idea.
- Forces and motion: award correct equation, correct substitution and correct evaluation as separate creditworthy strands where the marking points allow.
- Energy: award for the correct store named AND the correct pathway (mechanical, electrical, heating, radiation), and, where asked, conservation or efficiency reasoning.
- Waves: transverse vs longitudinal are distinct; frequency, wavelength and amplitude must not be swapped.
- Electricity: current is conserved in series; potential difference splits across series components and is the same across parallel branches; resistance, current and p.d. relate by V = IR.
- Ecology: producer, primary consumer, predator, prey and decomposer must be used consistently with the food chain in the question.

EDGE CASES IN WORDING:
- Mark a single word, a complete sentence, or bullet-style fragments on the science, not the format.
- Phonetic or badly-spelled attempts at the right term are acceptable when the intended word is unambiguous ('fotosynthesis', 'mitokondria'); they fail only when the misspelling collides with a different real term (see the near-homophone rule).
- An answer in another language that is scientifically correct and legible is judged on its science; if it is unintelligible, treat it as a non-attempt.

FLAGGING:
- Set flagged=true ONLY for a genuine non-attempt: blank, gibberish, random characters, simply restating or copying the question back, or 'I don't know'. A flagged answer scores 0.
- Do NOT flag a weak-but-genuine attempt. A wrong answer that is a real try is marked 0 (or partial) with flagged=false, so the pupil still gets honest feedback.

FEEDBACK STYLE:
- Write one or two sentences in the voice of an examiner annotating a script: name what earned the mark(s) and what was missing for the marks not given.
- Be specific and useful but do not simply print the whole mark scheme back. Do not be sarcastic.

RESPONSE FORMAT:
Respond with ONLY valid JSON, no backticks, no commentary:
{
  "marks_awarded": <integer between 0 and marks_max>,
  "awarded_points": [<integer indices, 0-based, of marking points awarded>],
  "feedback": "<one or two sentences in the voice of an examiner: what they earned, what was missing, written as you would write on a script>",
  "flagged": <true|false>
}`;

// Identify the calling pupil from their Supabase JWT (older clients send only the
// anon apikey → null, and we then just mark without recording).
async function getAuthedUid(req: Request): Promise<string | null> {
  if (!sb) return null;
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { data, error } = await sb.auth.getUser(m[1]);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch { return null; }
}

// Resolve the school behind a paper attempt's class, so usage is attributed and the
// fair-use backstop can apply. Cached in module scope (a class never changes school
// within a warm instance), mirroring mark-answer.
const schoolIdCache = new Map<string, string | null>();
async function resolveSchoolId(class_id: string | undefined | null): Promise<string | null> {
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

// Hard cost backstop, identical in spirit to mark-answer: true when a school's
// AI-mark usage is >3x its fair-use allowance (school_mark_status RPC). The soft cap
// (admin Schools view) never blocks pupils; this only ever catches genuine
// runaway/abuse. Per-instance cached 5 min, and fails OPEN on any error so a transient
// DB issue never blocks real marking. Comped pilots / uncapped plans always return false.
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

// Fire-and-forget AI usage logging. Mirrors mark-answer so the prompt-cache state is
// observable: a warm cache shows cache_read_tokens > 0 for the "mark-paper" call_label
// in ai_usage; cache_read_tokens stuck at 0 means the prefix is below the 4096 floor.
// school_id attributes paper-mark spend to the school so school_mark_status (and thus
// the backstop above) actually counts it.
function logUsage(label: string, school_id: string | null, usage: Record<string, unknown> | undefined) {
  if (!sb || !usage) return;
  const row = {
    call_label: label,
    source: "ai",
    school_id,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    cache_creation_tokens: Number(usage.cache_creation_input_tokens) || 0,
    cache_read_tokens: Number(usage.cache_read_input_tokens) || 0,
  };
  sb.from("ai_usage").insert(row).then(() => {}).catch((e) => console.error("ai_usage insert failed:", e));
}

async function markWithAI(question: string, command_word: string, marks: number, marking_points: Array<{ text?: string; marks?: number }>, student_answer: string, school_id: string | null) {
  const pointsList = marking_points
    .map((p, i) => `  ${i}. (${p.marks ?? 1} mark${(p.marks ?? 1) > 1 ? "s" : ""}) ${p.text ?? ""}`)
    .join("\n");
  const userMessage = `Question (${marks} mark${marks > 1 ? "s" : ""}, command word: ${command_word || "none"}):\n${question}\n\nMarking points:\n${pointsList}\n\nStudent's answer:\n${student_answer}\n\nMaximum marks awardable: ${marks}`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await response.json();
  logUsage("mark-paper", school_id, data?.usage);
  const text = data.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: { marks_awarded?: number; awarded_points?: number[]; feedback?: string; flagged?: boolean };
  try { parsed = JSON.parse(clean); } catch { parsed = { marks_awarded: 0, awarded_points: [], feedback: "Could not parse marking response.", flagged: false }; }
  const ma = Math.max(0, Math.min(Number(parsed.marks_awarded) || 0, Number(marks) || 1));
  const ap = Array.isArray(parsed.awarded_points) ? parsed.awarded_points.filter((n) => typeof n === "number" && n >= 0 && n < marking_points.length) : [];
  return { marks_awarded: ma, awarded_points: ap, feedback: parsed.feedback || "", flagged: !!parsed.flagged };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const { attempt_id, paper_question_id, student_answer } = body;
    if (!student_answer) return json({ error: "Missing fields" }, 400);

    // ── AUTH IS REQUIRED to trigger a paid marking call ──
    // Past-paper marking costs money AND writes a grade, so this endpoint no longer
    // marks for an unauthenticated caller (the old "mark only, record nothing" path
    // was an open, unmetered AI cost sink). A valid pupil JWT is mandatory; the
    // question / marks / marking points are ALWAYS loaded from the DB — never trusted
    // from the client, so a cheat can neither inflate the marks nor balloon the token
    // volume with a fabricated marking-point list — and the attempt must be the
    // calling pupil's own.
    if (!sb) return json({ error: "Server not configured." }, 500);
    const uid = await getAuthedUid(req);
    if (!uid) return json({ error: "Sign in to submit an answer." }, 401);
    if (!attempt_id || !paper_question_id) {
      return json({ error: "attempt_id and paper_question_id are required" }, 400);
    }

    // The attempt must exist and belong to THIS pupil.
    const att = await sb.from("paper_attempts")
      .select("id, paper_id, class_id, student_id").eq("id", attempt_id).single();
    if (att.error || !att.data || att.data.student_id !== uid) {
      return json({ error: "Not your attempt." }, 403);
    }

    // Load the question authoritatively and confirm it belongs to the attempt's paper.
    const q = await sb.from("paper_questions")
      .select("paper_id, question_text, command_word, marks, marking_points")
      .eq("id", paper_question_id).single();
    if (q.error || !q.data || q.data.paper_id !== att.data.paper_id) {
      return json({ error: "Question does not belong to this attempt." }, 400);
    }
    const question = q.data.question_text as string;
    const command_word = q.data.command_word as string;
    const marks = Number(q.data.marks) || 1;
    const marking_points = Array.isArray(q.data.marking_points)
      ? q.data.marking_points as Array<{ text?: string; marks?: number }> : [];
    if (!question) return json({ error: "Question has no text." }, 400);

    if (!ANTHROPIC_API_KEY) {
      return json({ marks_awarded: 0, awarded_points: [], feedback: "AI marking not configured.", flagged: false, source: "fallback", recorded: false, response_id: null });
    }

    // Hard cost backstop (same as mark-answer): a school >3x its fair-use allowance
    // skips the paid call and records nothing. Fails open; never catches normal use.
    const schoolId = await resolveSchoolId(att.data.class_id as string);
    if (await overBackstop(schoolId)) {
      return json({ marks_awarded: 0, awarded_points: [], feedback: "Marking is paused for your school right now — please let your teacher know.", flagged: false, source: "cap_backstop", recorded: false, response_id: null });
    }

    const verdict = await markWithAI(question, command_word, marks, marking_points, student_answer, schoolId);

    // Record server-side (authoritative): the attempt and question were already
    // verified above, so neither the marks nor the totals are ever client-supplied.
    let recorded = false;
    let response_id: string | null = null;
    const row = {
      attempt_id, paper_question_id, student_answer,
      marks_awarded: verdict.marks_awarded, marks_max: marks,
      ai_feedback: verdict.feedback, awarded_points: verdict.awarded_points, flagged: verdict.flagged,
    };
    const existing = await sb.from("paper_responses").select("id").eq("attempt_id", attempt_id).eq("paper_question_id", paper_question_id).limit(1);
    if (!existing.error && existing.data && existing.data.length > 0) {
      await sb.from("paper_responses").update(row).eq("id", existing.data[0].id);
      response_id = existing.data[0].id as string;
      recorded = true;
    } else {
      const ins = await sb.from("paper_responses").insert(row).select("id").single();
      if (!ins.error && ins.data) { response_id = ins.data.id as string; recorded = true; }
    }
    // Recompute the attempt totals from the stored responses — authoritative.
    if (recorded) {
      const all = await sb.from("paper_responses").select("marks_awarded").eq("attempt_id", attempt_id);
      const awarded = (all.data || []).reduce((s, r) => s + (Number(r.marks_awarded) || 0), 0);
      const pq = await sb.from("paper_questions").select("marks").eq("paper_id", att.data.paper_id);
      const total = (pq.data || []).reduce((s, r) => s + (Number(r.marks) || 0), 0);
      await sb.from("paper_attempts").update({ awarded_marks: awarded, total_marks: total }).eq("id", attempt_id);
    }

    return json({ ...verdict, source: "ai", recorded, response_id });
  } catch (error) {
    return json({ marks_awarded: 0, awarded_points: [], feedback: "Marking error — try again.", flagged: false, source: "error", recorded: false, response_id: null, error: String(error) }, 500);
  }
});
