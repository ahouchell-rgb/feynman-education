// Houchell Education — efficacy / outcomes-evidence layer (shared, pure).
//
// SLT/MAT renewals hinge on "did our mastery work translate to improvement?".
// The dashboards already show CURRENT mastery; this turns the EXISTING weekly
// school_benchmark_snapshots history into a progress-over-time story:
//  - overall school-average trend + first-vs-latest delta ("+8 pts since Sept"),
//  - a per-objective improvement delta (most-improved / still-stuck), and
//  - a templated governors/Ofsted narrative line.
//
// Pure + unit-tested (impact.test.ts): no IO, no AI. The route/page gather the
// snapshot rows (school_benchmark_snapshots: taken_on, school_avg, payload) and
// any recorded cohort_outcomes, then call these helpers. Mirrors mastery.ts /
// trustBenchmark.ts in style: deterministic, mark-/name-keyed, degrade-gracefully.

import { masteryKey } from "./mastery";

/** One weekly school snapshot row (as stored / read from the snapshot table). */
export interface Snapshot {
  taken_on: string;                 // ISO date (YYYY-MM-DD)
  school_avg: number | null;
  payload?: { objectives?: { topic_name: string; avg: number; classes?: number }[] } | null;
}

/** Overall school-average trend: the labelled-chart + headline-delta inputs. */
export interface OverallTrend {
  points: { taken_on: string; avg: number }[]; // chronological, nulls dropped
  first: number | null;
  latest: number | null;
  delta: number | null;             // latest − first (null if <2 readings)
  weeks: number;                    // whole weeks between first and latest reading
  enough: boolean;                  // ≥2 readings → a delta is meaningful
}

/** A per-objective improvement delta between the earliest & latest snapshots. */
export interface ObjectiveDelta {
  key: string;
  label: string;
  first: number | null;             // earliest reading present for this objective
  latest: number;                   // latest reading (always present — it's the basis)
  delta: number | null;             // latest − first (null when no earlier reading)
}

/** Pick the snapshot at-or-before `weeksAgo` weeks before the latest; else the
 *  earliest available. Lets the UI ask for "since September" vs "all history". */
export function baselineSnapshot(snaps: Snapshot[], weeksAgo?: number): Snapshot | null {
  const sorted = sortByDate(snaps);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  if (weeksAgo == null) return sorted[0];
  const latest = new Date(sorted[sorted.length - 1].taken_on + "T00:00:00").getTime();
  const cutoff = latest - weeksAgo * 7 * 86400000;
  // The latest snapshot at-or-before the cutoff; fall back to the earliest.
  let pick = sorted[0];
  for (const s of sorted) {
    const t = new Date(s.taken_on + "T00:00:00").getTime();
    if (t <= cutoff) pick = s; else break;
  }
  return pick;
}

/** Build the overall school-average trend from the snapshot series. */
export function overallTrend(snaps: Snapshot[]): OverallTrend {
  const points = sortByDate(snaps)
    .filter((s) => s.school_avg != null)
    .map((s) => ({ taken_on: s.taken_on, avg: Number(s.school_avg) }));
  if (points.length < 2) {
    const only = points[0]?.avg ?? null;
    return { points, first: only, latest: only, delta: null, weeks: 0, enough: false };
  }
  const first = points[0].avg, latest = points[points.length - 1].avg;
  return { points, first, latest, delta: latest - first, weeks: weeksBetween(points[0].taken_on, points[points.length - 1].taken_on), enough: true };
}

/**
 * Per-objective improvement deltas: compare each objective's mastery in the
 * latest snapshot against a baseline (N weeks ago, else earliest). Objectives
 * are joined on a normalised name key (the snapshot payload carries names, not
 * ids). An objective with no earlier reading still appears (delta = null), so
 * "newly tracked" topics aren't silently dropped.
 */
export function objectiveDeltas(snaps: Snapshot[], weeksAgo?: number): ObjectiveDelta[] {
  const sorted = sortByDate(snaps);
  if (sorted.length === 0) return [];
  const latest = sorted[sorted.length - 1];
  const base = baselineSnapshot(sorted, weeksAgo);
  // If baseline IS the latest (only one snapshot), there's no delta to compute.
  const baseIsLatest = !base || base.taken_on === latest.taken_on;

  const baseMap = new Map<string, number>();
  if (!baseIsLatest) {
    for (const o of base!.payload?.objectives || []) {
      if (o?.topic_name != null) baseMap.set(masteryKey(o.topic_name), Math.round(o.avg));
    }
  }

  const out: ObjectiveDelta[] = [];
  for (const o of latest.payload?.objectives || []) {
    if (o?.topic_name == null) continue;
    const key = masteryKey(o.topic_name);
    const latestPct = Math.round(o.avg);
    const first = baseMap.has(key) ? baseMap.get(key)! : null;
    out.push({ key, label: o.topic_name, first, latest: latestPct, delta: first == null ? null : latestPct - first });
  }
  return out;
}

/** Most-improved objectives (positive delta), strongest first. */
export function mostImproved(deltas: ObjectiveDelta[], n = 5): ObjectiveDelta[] {
  return deltas.filter((d) => d.delta != null && d.delta > 0).sort((a, b) => b.delta! - a.delta!).slice(0, n);
}

/** Still-stuck objectives: lowest current mastery, weakest first (regardless of
 *  whether they moved) — the "where to keep pushing" list for governors. */
export function stillStuck(deltas: ObjectiveDelta[], n = 5, ceiling = 65): ObjectiveDelta[] {
  return deltas.filter((d) => d.latest < ceiling).sort((a, b) => a.latest - b.latest).slice(0, n);
}

/** One recorded real-world outcome (e.g. "Y11 mock pass rate = 68%"). */
export interface CohortOutcome {
  label: string; term?: string | null; metric?: string | null; value: number; recorded_at?: string | null;
}

/**
 * Template the governors/Ofsted narrative from the numbers — no AI. Deterministic
 * sentence(s) summarising the trend, the weakest area, the standout improvement
 * and any one recorded outcome. Degrades gracefully when history is thin.
 */
export function impactNarrative(
  trend: OverallTrend,
  deltas: ObjectiveDelta[],
  outcomes: CohortOutcome[] = [],
): string {
  const parts: string[] = [];

  if (trend.enough && trend.delta != null && trend.first != null && trend.latest != null) {
    const dir = trend.delta > 0 ? "rose" : trend.delta < 0 ? "fell" : "held steady";
    const span = trend.weeks > 0 ? ` over ${trend.weeks} week${trend.weeks === 1 ? "" : "s"}` : " across the term";
    if (trend.delta === 0) parts.push(`Cohort mastery held steady at ${trend.latest}%${span}.`);
    else parts.push(`Cohort mastery ${dir} from ${trend.first}% to ${trend.latest}% (${trend.delta > 0 ? "+" : ""}${trend.delta} pts)${span}.`);
  } else if (trend.latest != null) {
    parts.push(`Cohort mastery currently stands at ${trend.latest}%; not enough snapshot history yet to show a term trend.`);
  } else {
    parts.push("Not enough snapshot history yet to report a cohort mastery trend.");
  }

  const improved = mostImproved(deltas, 1)[0];
  if (improved) parts.push(`Most improved area: ${improved.label} (+${improved.delta} pts).`);

  const stuck = stillStuck(deltas, 1)[0];
  if (stuck) parts.push(`The weakest area remains ${stuck.label} at ${stuck.latest}%.`);

  if (outcomes.length) {
    const o = outcomes[0];
    parts.push(`Recorded outcome: ${o.label}${o.metric ? ` (${o.metric})` : ""} = ${formatValue(o.value)}${o.term ? `, ${o.term}` : ""}.`);
  }

  return parts.join(" ");
}

/** Format an outcome value compactly (whole numbers stay whole; e.g. 68 → "68"). */
function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** Sort snapshots chronologically (ascending by taken_on), non-mutating. */
function sortByDate(snaps: Snapshot[]): Snapshot[] {
  return [...(snaps || [])].filter((s) => s?.taken_on).sort((a, b) => a.taken_on.localeCompare(b.taken_on));
}

/** Whole weeks between two ISO dates (≥0). */
function weeksBetween(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.max(0, Math.round(ms / (7 * 86400000)));
}
