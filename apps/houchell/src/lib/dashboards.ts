// Pure dashboard transforms — extracted from the school/trust/intervention routes
// and the snapshot crons so the aggregation logic is unit-testable in isolation.
//
// These were inline in the route handlers (untested "new surface"). They do the
// rounding, tallying, grouping and sorting that the dashboards depend on; getting
// them wrong silently skews what an SLT/MAT sees. Keeping them here also removes
// the daysSince duplication across the two overview routes.

/** Whole days since an ISO date (yyyy-mm-dd), or null when absent/unparseable.
 *  `now` is injectable so the staleness math is testable without faking the clock. */
export function daysSince(isoDate?: string | null, now: number = Date.now()): number | null {
  if (!isoDate) return null;
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 864e5));
}

/** A weekly snapshot older than this (the cron runs weekly) means the job has
 *  silently failed for ~two cycles — past this we fall through to the live path
 *  rather than serve numbers that look current but aren't. */
export const MAX_SNAPSHOT_AGE_DAYS = 14;

/** Whether a snapshot is fresh enough to serve as the instant-paint source.
 *  False when absent, undated, or older than `maxAgeDays` — the caller then
 *  computes live so a broken cron can't pin the dashboard to stale data. */
export function snapshotIsFresh(
  takenOn?: string | null,
  maxAgeDays: number = MAX_SNAPSHOT_AGE_DAYS,
  now: number = Date.now(),
): boolean {
  const age = daysSince(takenOn, now);
  return age != null && age <= maxAgeDays;
}

export type SnapshotObjective = { topic_name: string; avg: number; classes?: number };

/** A stored school snapshot's objectives → the overview's per-objective shape
 *  (so the snapshot paint matches the live `class_weak_topics` rollup shape that
 *  `rollupRetrieval` consumes). `marked` is null because a snapshot is pre-aggregated. */
export function schoolSnapshotObjectives(
  payload: { objectives?: SnapshotObjective[] } | null | undefined,
): { topic_name: string; pct_correct: number; marked: null; classes?: number }[] {
  return (payload?.objectives || []).map((o) => ({
    topic_name: o.topic_name,
    pct_correct: o.avg,
    marked: null,
    classes: o.classes,
  }));
}

export type SnapClass = {
  avg: number | null;
  weak: { topic_id: string; topic_name: string; pct: number }[];
};

/** The weekly school snapshot: a school-average and its weakest objectives.
 *  schoolAvg is the mean of per-class averages (ignoring classes with no data);
 *  objectives are tallied across classes and returned weakest-first, capped at 12. */
export function summariseSchoolSnapshot(perClass: SnapClass[]): {
  schoolAvg: number | null;
  objectives: { topic_name: string; avg: number; classes: number }[];
} {
  const avgs = perClass.map((c) => c.avg).filter((v): v is number => v != null);
  const schoolAvg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;

  const tally = new Map<string, { name: string; sum: number; n: number; classes: number }>();
  for (const c of perClass)
    for (const w of c.weak) {
      const e = tally.get(w.topic_id) || { name: w.topic_name, sum: 0, n: 0, classes: 0 };
      e.sum += w.pct;
      e.n += 1;
      e.classes += 1;
      tally.set(w.topic_id, e);
    }
  const objectives = [...tally.values()]
    .map((e) => ({ topic_name: e.name, avg: Math.round(e.sum / e.n), classes: e.classes }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 12);

  return { schoolAvg, objectives };
}

/** Group a flat per-pupil intervention list into the on-screen per-objective
 *  summary: how many pupils are below threshold on each objective and their mean,
 *  most-affected objective first. */
export function groupInterventionByObjective(
  rows: { topic_name: string; pct_correct: number }[],
): { topic_name: string; pupils: number; avg: number }[] {
  const byObjMap = new Map<string, { topic_name: string; pupils: number; sum: number }>();
  for (const r of rows) {
    const e = byObjMap.get(r.topic_name) || { topic_name: r.topic_name, pupils: 0, sum: 0 };
    e.pupils += 1;
    e.sum += r.pct_correct;
    byObjMap.set(r.topic_name, e);
  }
  return [...byObjMap.values()]
    .map((e) => ({ topic_name: e.topic_name, pupils: e.pupils, avg: Math.round(e.sum / e.pupils) }))
    .sort((a, b) => b.pupils - a.pupils);
}
