/* ─── UK Driving Theory + Hazard Perception — shared types ─────────────────
 *
 * This is an independent, self-contained study/practice app for the UK car
 * driving test. It models the real structure of the DVSA test (multiple-choice
 * theory + hazard perception) but every question, explanation and clip here is
 * ORIGINAL revision material written for this app — it is not the official DVSA
 * question bank (which is Crown copyright). Content is based on the publicly
 * documented rules of the road (The Highway Code) for learning purposes.
 */

export type CategoryId =
  | "alertness"
  | "attitude"
  | "safety-and-your-vehicle"
  | "safety-margins"
  | "hazard-awareness"
  | "vulnerable-road-users"
  | "other-types-of-vehicle"
  | "vehicle-handling"
  | "motorway-rules"
  | "rules-of-the-road"
  | "road-and-traffic-signs"
  | "essential-documents"
  | "incidents-accidents-emergencies"
  | "vehicle-loading";

export interface Category {
  id: CategoryId;
  label: string;
  /** short description shown on revision cards */
  blurb: string;
}

export interface Question {
  /** stable id, e.g. "alertness-001" */
  id: string;
  category: CategoryId;
  question: string;
  /** answer options, usually 4 */
  options: string[];
  /** indices into `options` that are correct */
  correct: number[];
  /** explanation shown after the learner answers */
  explanation: string;
  /** how many answers the learner must pick (1 unless a "mark X answers" item) */
  selectCount: number;
  /** optional road-sign id (see signs.ts) shown as the question image */
  signId?: string;
}

export type SignKind = "warning" | "regulatory" | "information" | "direction";

export interface RoadSign {
  id: string;
  kind: SignKind;
  name: string;
  meaning: string;
}

/** A single developing-hazard scoring window inside a clip. */
export interface HazardWindow {
  /** human label, e.g. "Cyclist pulls out from the left" */
  label: string;
  /** seconds from clip start when the hazard *first becomes visible* */
  appearsAt: number;
  /** seconds from clip start when the hazard *starts developing* (window opens) */
  windowStart: number;
  /** seconds from clip start when the hazard would force you to act (window ends) */
  windowEnd: number;
}

export interface HazardClip {
  id: string;
  title: string;
  /** total clip length in seconds */
  duration: number;
  /** which built-in animated scene to render (see HazardScene.tsx) */
  scene: string;
  /** developing hazards to score (1 or 2 per clip, like the real test) */
  hazards: HazardWindow[];
  /** a short scene description / what to watch for, shown only after scoring */
  debrief: string;
}
