// Feynman Education — trust benchmark rollup (shared, pure).
//
// Turns a flat list of enriched classes (each with its weak objectives) into the
// trust dashboard shape: per-school averages + weakest topics, a trust-wide
// weakest-objectives leaderboard, and the trust mean. Used by BOTH the live
// /api/trust/overview route and the snapshot cron so they can never drift.

export interface EnrichedClass {
  school_id: string; school_name: string; year_group: number | null; linked: boolean;
  weak: { topic_id: string; topic_name: string; pct_correct: number; objective_id?: string | null }[];
}
export interface TrustRollup {
  schools: { school_id: string; name: string; classes: number; linked: number; avgMastery: number | null; weakest: { topic_name: string; avg: number }[] }[];
  cohort: { topic_name: string; avg: number; schools: number }[];
  trustAvg: number | null;
}

export function rollupTrust(enriched: EnrichedClass[]): TrustRollup {
  const bySchool = new Map<string, { name: string; classes: number; linked: number; sum: number; n: number; topics: Map<string, { name: string; sum: number; n: number }> }>();
  const trustTopics = new Map<string, { name: string; sum: number; n: number; schools: Set<string> }>();

  for (const c of enriched) {
    const s = bySchool.get(c.school_id) || { name: c.school_name, classes: 0, linked: 0, sum: 0, n: 0, topics: new Map() };
    s.classes += 1; if (c.linked) s.linked += 1;
    for (const w of c.weak) {
      s.sum += w.pct_correct; s.n += 1;
      const st = s.topics.get(w.topic_id) || { name: w.topic_name, sum: 0, n: 0 };
      st.sum += w.pct_correct; st.n += 1; s.topics.set(w.topic_id, st);
      const tt = trustTopics.get(w.topic_id) || { name: w.topic_name, sum: 0, n: 0, schools: new Set<string>() };
      tt.sum += w.pct_correct; tt.n += 1; tt.schools.add(c.school_id); trustTopics.set(w.topic_id, tt);
    }
    bySchool.set(c.school_id, s);
  }

  const schools = [...bySchool.entries()].map(([id, s]) => ({
    school_id: id, name: s.name, classes: s.classes, linked: s.linked,
    avgMastery: s.n ? Math.round(s.sum / s.n) : null,
    weakest: [...s.topics.values()].map((t) => ({ topic_name: t.name, avg: Math.round(t.sum / t.n) })).sort((a, b) => a.avg - b.avg).slice(0, 3),
  })).sort((a, b) => (a.avgMastery ?? 999) - (b.avgMastery ?? 999));

  const cohort = [...trustTopics.values()]
    .map((t) => ({ topic_name: t.name, avg: Math.round(t.sum / t.n), schools: t.schools.size }))
    .sort((a, b) => a.avg - b.avg);

  const vals = schools.map((s) => s.avgMastery).filter((v): v is number => v != null);
  const trustAvg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;

  return { schools, cohort, trustAvg };
}

/** Run `fn` over items with bounded concurrency (shared by route + cron). */
export async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}
