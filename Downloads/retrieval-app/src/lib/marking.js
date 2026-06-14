/* ─── Smart local marking + fake-answer detection ───
 * Extracted from src/app/page.js so the grade-affecting logic can be
 * unit-tested. Pure functions: no React, no network. `aiMark` (which calls
 * the Supabase edge function) stays in page.js and imports these as fallback. */

/* Lenient, typo-tolerant marking for short-answer retrieval practice.
 * Returns { correct, marks_awarded, feedback }. */
export function localMark(qText, modelAnswer, studentAnswer, marks) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const student = norm(studentAnswer);
  const model = norm(modelAnswer);

  if (!student) return { correct: false, marks_awarded: 0, feedback: "No answer given." };

  // Exact or near-exact match
  if (student === model) return { correct: true, marks_awarded: marks, feedback: "Correct!" };

  // Extract key terms from model answer (words 3+ chars, not common words)
  const stopWords = new Set(['the','and','are','was','were','been','being','have','has','had','that','this','with','from','for','not','but','what','all','can','her','one','our','out','you','its','also','into','than','then','them','these','some','will','would','there','their','which','about','each','make','like','just','over','such','take','other','could','after','made','many','before','more','most','only','very','when','come','how','does','two']);
  const getKeyTerms = (s) => s.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));

  const modelTerms = getKeyTerms(model);
  const studentTerms = getKeyTerms(student);

  if (modelTerms.length === 0) {
    // Short model answer — check if student contains it or vice versa
    if (student.includes(model) || model.includes(student)) {
      return { correct: true, marks_awarded: marks, feedback: "Correct!" };
    }
  }

  // Fuzzy match: check how many model key terms appear in student answer
  // Allow for minor typos using a simple distance check
  const fuzzyMatch = (a, b) => {
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    if (a.length < 3 || b.length < 3) return a === b;
    // Allow 1-2 char difference for typos
    if (Math.abs(a.length - b.length) > 2) return false;
    let diffs = 0;
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length < b.length ? a : b;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i]) diffs++;
      if (diffs > 2) return false;
    }
    return diffs <= 2;
  };

  let matched = 0;
  for (const mt of modelTerms) {
    for (const st of studentTerms) {
      if (fuzzyMatch(mt, st)) { matched++; break; }
    }
  }

  const ratio = modelTerms.length > 0 ? matched / modelTerms.length : 0;

  // Also check if student answer contains model answer as substring (different word order)
  const modelWords = model.split(' ');
  const studentContainsCore = modelWords.filter(w => w.length >= 3 && !stopWords.has(w)).every(w =>
    studentTerms.some(st => fuzzyMatch(w, st))
  );

  // Lenient threshold: 60% of key terms matched = correct for retrieval practice
  if (ratio >= 0.6 || studentContainsCore) {
    const awarded = ratio >= 0.85 ? marks : Math.max(1, Math.ceil(marks * ratio));
    return { correct: true, marks_awarded: awarded, feedback: ratio >= 0.85 ? "Correct!" : "Good — most key points covered." };
  }

  // Check for containment — student answer might be worded very differently but contain the right idea
  // Split model into phrases and see if student captures the essence
  if (student.length > 5 && model.length > 5) {
    // Bigram overlap check
    const bigrams = (s) => { const b = []; for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2)); return b; };
    const mBigrams = bigrams(model);
    const sBigrams = new Set(bigrams(student));
    const bigramMatch = mBigrams.filter(b => sBigrams.has(b)).length / mBigrams.length;
    if (bigramMatch >= 0.5) {
      return { correct: true, marks_awarded: marks, feedback: "Correct!" };
    }
  }

  return { correct: false, marks_awarded: 0, feedback: `The answer needed: ${modelAnswer}` };
}

/* ─── Fake Answer Detection ───
 * Returns a feedback string when the answer is spam/non-attempt, else null.
 * Deliberately exempts legitimate short scientific answers (numbers, chemical
 * symbols, genotype letters) — the edge function marks those correctly. */
export function detectFakeAnswer(answer) {
  const trimmed = answer.trim();
  // Too short — but exempt legitimate short scientific answers:
  //   - Pure numbers (e.g. "92", "46", "23 pairs", "9.81")
  //   - Chemical symbols (e.g. "Fe", "Na", "H", "Mg", "CO2", "H2O", "O2")
  //   - Single-letter axis labels or genotype letters (e.g. "Bb", "Ff")
  // The edge function knows how to mark these correctly; don't kill them client-side.
  if (trimmed.length <= 2) {
    const containsDigit = /\d/.test(trimmed);
    const isChemSymbol = /^[A-Z][a-z]?$/.test(trimmed);          // e.g. Fe, Na, H, Mg
    const isGenotype = /^[A-Za-z]{1,2}$/.test(trimmed) && /[A-Z]/.test(trimmed); // e.g. Bb, FF, ff
    if (!containsDigit && !isChemSymbol && !isGenotype) {
      return "Answer too short — doesn't count towards target.";
    }
  }
  // All same character repeated — but only fire on letters; numbers can legitimately repeat ("99", "1000")
  const stripped = trimmed.replace(/\s/g, '');
  if (/^(.)\1+$/.test(stripped) && /[a-zA-Z]/.test(stripped)) {
    return "Repeated characters detected — doesn't count.";
  }
  // All same word repeated
  const words = trimmed.toLowerCase().split(/\s+/);
  if (words.length >= 3 && new Set(words).size === 1) return "Same word repeated — doesn't count.";
  // No vowels — keyboard mashing. 'y' counts as a vowel so real science words
  // like "rhythm", "lymph", "crypt", "glycyl" aren't rejected as gibberish.
  if (trimmed.length >= 5 && !/[aeiouyAEIOUY]/.test(trimmed)) return "This doesn't look like a real answer — doesn't count.";
  // "I don't know" and explicit non-attempt phrases
  if (/^(i )?(don'?t|do not|dont) know\.?$/i.test(trimmed)) return "Please attempt the answer — doesn't count towards target.";
  if (/^(idk|dunno|no idea|not sure|unsure|no clue|i have no idea|i dont know|idek)\.?$/i.test(trimmed)) return "Please attempt the answer — doesn't count towards target.";
  if (/^\?+$/.test(trimmed)) return "Please attempt the answer — doesn't count towards target.";
  return null;
}
