// The RPC contract: every SECURITY DEFINER / RPC function the apps call.
//
// `args` is the EXACT `pg_get_function_identity_arguments(oid)` string as it
// exists on the live anchor (uvzukwoxqhcxaxtzrziy), captured 2026-06-23 — so the
// contract test compares against reality, not a guess. If a signature here
// disagrees with the anchor, ONE of them is wrong: fix the migration or update
// this list in the same PR. That is the point — it can no longer drift silently.
//
// `origin` records where the function was authored, for human context only. After
// the Phase-3 unification ALL of these live on the one anchor; the apps no longer
// cross a database boundary to reach them.
//
// `args: null` means "don't assert the signature, only that the function exists"
// (use for functions you expect to grow optional params).

/** @typedef {{ name: string, args: string|null, origin: 'retrieval'|'feynman', note?: string }} Rpc */

/** @type {Rpc[]} */
export const REQUIRED_RPCS = [
  // ── cross-app / retrieval-origin — the historic drift risk (lived in the other repo) ──
  { name: "class_weak_topics",         args: "p_class_id uuid, p_limit integer, p_min_marked integer, p_subject text", origin: "retrieval" },
  { name: "student_weak_topics",       args: "p_student_id uuid, p_limit integer, p_subject text",                     origin: "retrieval" },
  { name: "class_unit_gaps",           args: "p_class_id uuid, p_unit_id text",                                        origin: "retrieval" },
  { name: "class_paper_gaps",          args: "p_class_id uuid, p_limit integer, p_min_responses integer",              origin: "retrieval" },
  { name: "class_objective_breakdown", args: "p_class_id uuid, p_unit_id text, p_limit integer",                       origin: "retrieval" },
  { name: "class_intervention_list",   args: "p_class_id uuid, p_threshold integer, p_subject text",                   origin: "retrieval", note: "personal data — slt-only after Phase 5" },
  { name: "topic_preview_questions",   args: "p_topic_id uuid",                                                        origin: "retrieval" },
  { name: "parent_report",             args: "p_token uuid",                                                           origin: "retrieval", note: "magic-link, no account" },

  // ── feynman-origin — ported into the anchor during the cutover (feynman_* ledger rows) ──
  { name: "school_objective_mastery",  args: "p_min_marked integer",                                                  origin: "feynman" },
  { name: "trust_objective_mastery",   args: "p_min_marked integer",                                                  origin: "feynman" },
  { name: "school_classes",            args: "",                                                                       origin: "feynman" },
  { name: "trust_classes",             args: "",                                                                       origin: "feynman" },
  { name: "school_members",            args: "",                                                                       origin: "feynman" },
  { name: "school_audit",              args: "p_limit integer",                                                        origin: "feynman" },
  { name: "school_ai_spend",           args: "p_since date",                                                           origin: "feynman" },
  { name: "create_school",             args: "p_name text",                                                            origin: "feynman" },
  { name: "create_trust",              args: "p_name text",                                                            origin: "feynman" },
  { name: "join_school",               args: "p_code text",                                                            origin: "feynman" },
  { name: "link_school_to_trust",      args: "p_code text",                                                            origin: "feynman" },
  { name: "remove_school_member",      args: "p_target uuid",                                                          origin: "feynman" },
  { name: "set_school_member_role",    args: "p_target uuid, p_role text",                                             origin: "feynman" },
  { name: "set_school_home_sponsored", args: "p_on boolean",                                                           origin: "feynman" },
  { name: "review_content",            args: "p_id uuid, p_decision text, p_note text",                                origin: "feynman" },
  { name: "get_teaching_week",         args: "p_anchor_date date",                                                     origin: "feynman" },
  { name: "increment_token_usage",     args: "p_teacher_id uuid, p_day date, p_input integer, p_output integer",       origin: "feynman" },
];
