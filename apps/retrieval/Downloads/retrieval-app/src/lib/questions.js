import { C } from "./theme";

export function sortQuestions(questions, srMap, recencyBoost, cooldownSet) {
  const now = Date.now();
  const COOLDOWN_PENALTY = 365 * 86400000;
  const JITTER = 3600000;
  const score = (q) => {
    const sr = srMap[q.id];
    const dueMs = sr ? new Date(sr.due || 0).getTime() : now;
    const jitter = (Math.random() - 0.5) * JITTER;
    const cooldown = cooldownSet && cooldownSet.has(q.id) ? COOLDOWN_PENALTY : 0;
    return dueMs + jitter + cooldown;
  };
  const scored = questions.map(q => ({ q, s: score(q), recent: !!recencyBoost[q.topic_id] }));
  const recent = scored.filter(x => x.recent).sort((a, b) => a.s - b.s).map(x => x.q);
  const other  = scored.filter(x => !x.recent).sort((a, b) => a.s - b.s).map(x => x.q);
  if (recent.length === 0) return other;
  if (other.length === 0) return recent;
  const out = [];
  const maxLen = Math.max(recent.length, other.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < recent.length) out.push(recent[i]);
    if (i < other.length)  out.push(other[i]);
  }
  return out;
}

/* ─── SR status label ─── */
export function getSRInfo(srData, isDue) {
  if (!srData || srData.reps === undefined) return { label: "New", color: C.acc, detail: "First time seeing this" };
  if (!isDue) {
    if (srData.reps >= 4) return { label: "Mastered", color: C.grn, detail: `Reviewing every ${srData.iv}d` };
    return { label: "Reviewing", color: C.grn, detail: `${srData.reps} correct in a row` };
  }
  if (srData.reps === 0) return { label: "Needs work", color: C.red, detail: "You got this wrong — try again" };
  return { label: "Due", color: C.amb, detail: `Due every ${srData.iv}d` };
}
