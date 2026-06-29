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

/* ── Hazard perception simulation ──────────────────────────────────────────
 * The hazard test is a moving first-person driving simulation. You drive
 * forward through a scene with pedestrians, other cars and junctions; when a
 * hazard starts to develop you click ON it to react in time. Objects live in a
 * simple world space (distance D ahead in metres, lateral X in metres from the
 * road centre — negative = left) and are projected to the screen each frame. */

export type ActorKind =
  | "pedestrian"
  | "child"
  | "cyclist"
  | "car"
  | "oncoming"
  | "bus"
  | "dog";

export type Side = "left" | "right";

/** A scoring hazard: an actor that starts safe, then moves into your path. */
export interface SimHazard {
  /** stable index-friendly id within the clip */
  id: string;
  kind: ActorKind;
  /** which side of the road it starts on */
  side: Side;
  /** does it emerge from a side road / junction? (draws a junction there) */
  fromJunction?: boolean;
  /** clip-time (s) when it appears far ahead at the horizon */
  appearAt: number;
  /** seconds to travel from the horizon to passing the camera */
  travel: number;
  /** clip-time (s) when it starts moving into your path (scoring window opens) */
  developStart: number;
  /** clip-time (s) by which it is in your path (window closes; hazard occurs) */
  developEnd: number;
  /** what the hazard is, shown in the debrief */
  label: string;
}

/** A non-scoring moving actor that stays in its lane — for realism/decoys. */
export interface SimAmbient {
  kind: ActorKind;
  side: Side;
  /** lateral position in metres (negative = left of road centre) */
  worldX: number;
  appearAt: number;
  travel: number;
}

export interface HazardClip {
  id: string;
  title: string;
  /** total clip length in seconds */
  duration: number;
  scene: "residential" | "town" | "rural" | "dual";
  /** weather/lighting (default clear) */
  weather?: "clear" | "rain" | "fog" | "night";
  /** ambient (decoy) actors */
  ambient: SimAmbient[];
  /** developing hazards to spot and click (1 or 2 per clip) */
  hazards: SimHazard[];
  /** what to watch for, shown only after scoring */
  debrief: string;
}
