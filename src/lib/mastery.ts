// Feynman Education — per-objective mastery blend (shared, pure).
//
// The mastery graph is sold to four buyers off ONE spine; until now the SLT/trust
// dashboards showed retrieval weakness only. This blends the two data sources
// — low-stakes retrieval and common-assessment QLA — into a single per-objective
// view, so "where is this cohort weak?" answers from everything we know.
//
// Pure + unit-tested (mastery.test.ts): no IO. The routes gather the two source
// lists (retrieval rollup + the *_objective_mastery RPC) and call blend here.

export interface RetrievalTopic { topic_id?: string; topic_name: string; pct_correct: number; marked?: number | null; objective_id?: string | null; }
export interface AssessmentObjective {
  objective_id?: string; objective: string; code?: string | null;
  subject_slug?: string | null; strand?: string | null;
  pct: number; marked?: number | null; students?: number | null;
}
export interface BlendedObjective {
  key: string;
  label: string;
  objective_id?: string;
  code?: string | null;
  subject_slug?: string | null;
  strand?: string | null;
  /** Mark-weighted blend of whichever sources are present (0–100). */
  blendedPct: number;
  marked: number;
  sources: ("retrieval" | "assessment")[];
  /**
   * True when this entry blends two sources that were joined only by a
   * normalised NAME match (not a shared objective_id) — i.e. it relied on the
   * crosswalk fallback. Callers can surface this as a lower-confidence join.
   * Always false for single-source entries and for id-matched blends.
   */
  nameMatchedOnly?: boolean;
  retrieval?: { pct: number; marked: number };
  assessment?: { pct: number; marked: number; students: number };
}

/** Normalise a topic/objective name to a join key (so "Ionic bonding" ≈ "ionic  bonding"). */
export function masteryKey(name: string): string {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** A topic's join key: prefer its mapped objective id, else its normalised name. */
const topicKey = (objectiveId: string | null | undefined, name: string) =>
  objectiveId ? `obj:${objectiveId}` : masteryKey(name);

/** Index the topic→objective crosswalk rows into a topic_id → objective_id map. */
export function crosswalkMap(rows: { topic_id: string; objective_id: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows || []) if (r.topic_id && r.objective_id) m.set(r.topic_id, r.objective_id);
  return m;
}

export interface RetrievalRollup { key: string; label: string; pct: number; marked: number; classes: number; objective_id?: string | null; }

/**
 * Collapse per-class retrieval weak-topic lists into one rollup keyed by the
 * objective the topic maps to (via the topic_objective crosswalk) when known —
 * so several topic names under one objective merge — else by topic name.
 * Mark-weighted % where marks exist, else a simple mean, plus the class count.
 */
export function rollupRetrieval(weakLists: RetrievalTopic[][]): RetrievalRollup[] {
  const by = new Map<string, { label: string; objective_id?: string | null; wsum: number; w: number; psum: number; n: number; classes: number }>();
  for (const list of weakLists) {
    // Count each class (list) once per objective, even if several of its topic
    // names map to the same objective — otherwise the "N classes" badge inflates.
    const seenThisClass = new Set<string>();
    for (const t of list || []) {
      const key = topicKey(t.objective_id, t.topic_name);
      if (!key) continue;
      const e = by.get(key) || { label: t.topic_name, objective_id: t.objective_id ?? null, wsum: 0, w: 0, psum: 0, n: 0, classes: 0 };
      const m = Number(t.marked) || 0;
      e.wsum += (Number(t.pct_correct) || 0) * m; e.w += m;
      e.psum += Number(t.pct_correct) || 0; e.n += 1;
      if (!seenThisClass.has(key)) { e.classes += 1; seenThisClass.add(key); }
      by.set(key, e);
    }
  }
  return [...by.entries()].map(([key, e]) => ({
    key, label: e.label, objective_id: e.objective_id,
    pct: e.w > 0 ? Math.round(e.wsum / e.w) : Math.round(e.psum / e.n),
    marked: e.w, classes: e.classes,
  }));
}

/**
 * Blend a retrieval rollup with assessment per-objective rows into one ranked
 * (weakest-first) list. Entries are joined by objective IDENTITY when both
 * sides carry it (via the topic_objective crosswalk), falling back to objective
 * NAME otherwise; an entry present in only one source still appears.
 */
export function blendObjectiveMastery(
  retrieval: RetrievalRollup[],
  assessment: AssessmentObjective[],
): BlendedObjective[] {
  const out = new Map<string, BlendedObjective>();

  for (const r of retrieval) {
    out.set(r.key, {
      key: r.key, label: r.label, objective_id: r.objective_id ?? undefined,
      blendedPct: r.pct, marked: r.marked,
      sources: ["retrieval"], retrieval: { pct: r.pct, marked: r.marked },
    });
  }

  for (const a of assessment) {
    const nameKey = masteryKey(a.objective);
    const idKey = a.objective_id ? `obj:${a.objective_id}` : null;
    if (!idKey && !nameKey) continue;
    const marked = Number(a.marked) || 0;
    const assess = { pct: Math.round(a.pct), marked, students: Number(a.students) || 0 };
    // Match a retrieval entry by id first (precise), then by name (fallback).
    const idMatch = idKey ? out.get(idKey) : undefined;
    const existing = idMatch || out.get(nameKey);
    const key = idKey || nameKey;
    if (existing) {
      // Joined by name fallback only when the id match missed but a name match hit.
      if (!idMatch) existing.nameMatchedOnly = true;
      existing.assessment = assess;
      existing.objective_id = a.objective_id || existing.objective_id;
      existing.code = a.code ?? existing.code;
      existing.subject_slug = a.subject_slug ?? existing.subject_slug;
      existing.strand = a.strand ?? existing.strand;
      if (!existing.sources.includes("assessment")) existing.sources.push("assessment");
    } else {
      out.set(key, {
        key, label: a.objective, objective_id: a.objective_id, code: a.code ?? null,
        subject_slug: a.subject_slug ?? null, strand: a.strand ?? null,
        blendedPct: assess.pct, marked, sources: ["assessment"], assessment: assess,
      });
    }
  }

  // Recompute the mark-weighted blend for entries with both sources.
  for (const e of out.values()) {
    const parts: { pct: number; w: number }[] = [];
    if (e.retrieval) parts.push({ pct: e.retrieval.pct, w: e.retrieval.marked || 1 });
    if (e.assessment) parts.push({ pct: e.assessment.pct, w: e.assessment.marked || 1 });
    const w = parts.reduce((s, p) => s + p.w, 0);
    e.blendedPct = w > 0 ? Math.round(parts.reduce((s, p) => s + p.pct * p.w, 0) / w)
                         : Math.round(parts.reduce((s, p) => s + p.pct, 0) / Math.max(parts.length, 1));
    e.marked = (e.retrieval?.marked || 0) + (e.assessment?.marked || 0);
  }

  return [...out.values()].sort((a, b) => a.blendedPct - b.blendedPct);
}
