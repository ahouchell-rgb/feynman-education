import type { HazardClip } from "./types";

/* Hazard perception clips for the moving simulation.
 *
 * Each clip is a first-person drive. You move forward at DRIVE_SPEED; actors
 * appear far ahead and sweep towards you. A hazard starts "safe" then moves into
 * your path during its develop window — click ON it during that window to react.
 * Earlier reactions score more (5->1), like the real DVSA test. Ambient actors
 * are decoys that stay in their lane and must NOT be clicked.
 *
 * 14 clips with 15 scoring hazards (one clip has two), so the maximum is 75 and
 * the pass mark works out at 44 — exactly like the real test.
 */

export const DRIVE_SPEED = 9; // metres per second (~20 mph, urban)
export const D_FAR = 60; // distance (m) at which actors appear
export const D_GONE = 1.4; // distance (m) at which actors pass the camera
export const MAX_PER_HAZARD = 5;
export const HAZARD_PASS_MARK = 44; // the real DVSA test is 44 / 75

export const HAZARD_CLIPS: HazardClip[] = [
  {
    id: "clip-1",
    title: "Residential street",
    duration: 11,
    scene: "residential",
    ambient: [{ kind: "pedestrian", side: "right", worldX: 4.2, appearAt: 0, travel: 6.5 }],
    hazards: [{ id: "h1", kind: "child", side: "left", appearAt: 1, travel: 6.2, developStart: 4.6, developEnd: 7, label: "A child runs out from between parked cars on the left" }],
    debrief: "Among parked cars, watch the gaps and look under vehicles for feet. The child running out is the developing hazard — react as soon as you see movement.",
  },
  {
    id: "clip-2",
    title: "Side junction",
    duration: 11,
    scene: "town",
    ambient: [{ kind: "pedestrian", side: "left", worldX: -4.2, appearAt: 0.5, travel: 6.5 }],
    hazards: [{ id: "h1", kind: "car", side: "left", fromJunction: true, appearAt: 1.5, travel: 6.5, developStart: 5, developEnd: 7.6, label: "A car pulls out from the side road on the left" }],
    debrief: "Scan side roads as you approach a junction. The car edging out then pulling across is the hazard — early observation lets you slow smoothly.",
  },
  {
    id: "clip-3",
    title: "Town centre (rain)",
    duration: 12,
    scene: "town",
    weather: "rain",
    ambient: [{ kind: "pedestrian", side: "left", worldX: -4, appearAt: 1, travel: 6.5 }],
    hazards: [{ id: "h1", kind: "pedestrian", side: "right", appearAt: 2, travel: 6.5, developStart: 5.8, developEnd: 8.4, label: "A pedestrian steps off the kerb to cross from the right" }],
    debrief: "Look for people at the kerb who may step out. The pedestrian crossing from the right is the hazard — be ready to stop; they may not have seen you.",
  },
  {
    id: "clip-4",
    title: "Parked car & cyclist",
    duration: 11,
    scene: "residential",
    ambient: [{ kind: "oncoming", side: "right", worldX: 1.7, appearAt: 2.5, travel: 5 }],
    hazards: [{ id: "h1", kind: "cyclist", side: "left", appearAt: 1.5, travel: 6.8, developStart: 5, developEnd: 7.8, label: "A cyclist moves out into your lane to pass a parked car" }],
    debrief: "A cyclist ahead will need to move out around the parked car. As they pull into your lane they become the hazard — hold back and give at least 1.5 m.",
  },
  {
    id: "clip-5",
    title: "Country road",
    duration: 11,
    scene: "rural",
    ambient: [],
    hazards: [{ id: "h1", kind: "oncoming", side: "right", appearAt: 2, travel: 6, developStart: 4.8, developEnd: 7.2, label: "An oncoming car crosses onto your side of the road" }],
    debrief: "On narrow rural roads watch oncoming traffic closely. This car drifts across the centre line towards you — ease off and move to the left early.",
  },
  {
    id: "clip-6",
    title: "Busy high street (two hazards)",
    duration: 14,
    scene: "town",
    ambient: [{ kind: "pedestrian", side: "left", worldX: -4.1, appearAt: 1, travel: 6.5 }],
    hazards: [
      { id: "h1", kind: "bus", side: "left", appearAt: 1, travel: 6.5, developStart: 4, developEnd: 6.4, label: "A bus pulls out from a bus stop on the left" },
      { id: "h2", kind: "child", side: "right", appearAt: 6.5, travel: 6.2, developStart: 9.6, developEnd: 12, label: "A child steps out from the right further down the road" },
    ],
    debrief: "This clip has TWO hazards: the bus pulling out, then a child stepping out further on. Stay alert to the end — react to each as it develops.",
  },
  {
    id: "clip-7",
    title: "Dog in the road",
    duration: 11,
    scene: "residential",
    ambient: [{ kind: "pedestrian", side: "left", worldX: -4.2, appearAt: 0.5, travel: 6.5 }],
    hazards: [{ id: "h1", kind: "dog", side: "right", appearAt: 2, travel: 6, developStart: 4.8, developEnd: 7, label: "A dog runs into the road from the right" }],
    debrief: "Animals are unpredictable. The dog darting into the road is the hazard — slow down; an owner may follow it out.",
  },
  {
    id: "clip-8",
    title: "Pedestrian from the left",
    duration: 11,
    scene: "town",
    ambient: [{ kind: "oncoming", side: "right", worldX: 1.7, appearAt: 3, travel: 5 }],
    hazards: [{ id: "h1", kind: "pedestrian", side: "left", appearAt: 1.5, travel: 6.4, developStart: 5, developEnd: 7.5, label: "A pedestrian steps out from the left between parked cars" }],
    debrief: "Pedestrians often cross between parked cars where you can't see them. The one stepping out on the left is the developing hazard.",
  },
  {
    id: "clip-9",
    title: "Emerging vehicle (right)",
    duration: 11,
    scene: "town",
    ambient: [{ kind: "pedestrian", side: "left", worldX: -4, appearAt: 1, travel: 6.5 }],
    hazards: [{ id: "h1", kind: "car", side: "right", fromJunction: true, appearAt: 1.5, travel: 6.5, developStart: 5, developEnd: 7.6, label: "A car emerges from a junction on the right" }],
    debrief: "Check junctions on both sides. The car emerging from the right could cross your path — be ready to slow.",
  },
  {
    id: "clip-10",
    title: "Country lane (fog)",
    duration: 11,
    scene: "rural",
    weather: "fog",
    ambient: [],
    hazards: [{ id: "h1", kind: "cyclist", side: "left", appearAt: 1.5, travel: 6.8, developStart: 5, developEnd: 7.8, label: "A cyclist in the road moves out around a pothole" }],
    debrief: "Cyclists move out to avoid potholes and drains. Hold back and give them plenty of room before overtaking.",
  },
  {
    id: "clip-11",
    title: "Oncoming overtaker",
    duration: 11,
    scene: "rural",
    ambient: [],
    hazards: [{ id: "h1", kind: "oncoming", side: "right", appearAt: 2, travel: 5.6, developStart: 4.6, developEnd: 7, label: "An oncoming car pulls out to overtake towards you" }],
    debrief: "An oncoming vehicle overtaking comes onto your side of the road. Ease off and be ready to move left to give it room.",
  },
  {
    id: "clip-12",
    title: "Dual carriageway merge",
    duration: 12,
    scene: "dual",
    ambient: [{ kind: "oncoming", side: "right", worldX: 1.8, appearAt: 1, travel: 5 }],
    hazards: [{ id: "h1", kind: "car", side: "left", fromJunction: true, appearAt: 2, travel: 6.5, developStart: 5.4, developEnd: 8, label: "A vehicle merges from the slip road on the left" }],
    debrief: "On a dual carriageway, watch traffic joining from slip roads. The merging vehicle is the hazard — adjust your speed or move over safely.",
  },
  {
    id: "clip-13",
    title: "Pedestrian at a bus",
    duration: 12,
    scene: "town",
    ambient: [{ kind: "bus", side: "left", worldX: -3.7, appearAt: 0.5, travel: 7.5 }],
    hazards: [{ id: "h1", kind: "pedestrian", side: "right", appearAt: 3, travel: 6.2, developStart: 6, developEnd: 8.4, label: "A pedestrian crosses from in front of a stopped bus" }],
    debrief: "People step out from in front of buses where you can't see them. Anticipate someone crossing and cover the brake.",
  },
  {
    id: "clip-14",
    title: "Residential street (night)",
    duration: 11,
    scene: "residential",
    weather: "night",
    ambient: [{ kind: "pedestrian", side: "left", worldX: -4.1, appearAt: 0.5, travel: 6.5 }],
    hazards: [{ id: "h1", kind: "child", side: "right", appearAt: 1.5, travel: 6.2, developStart: 5, developEnd: 7.4, label: "A child runs into the road near a school on the right" }],
    debrief: "Near schools, expect children to act without warning. The child running out is the hazard — keep your speed down and be ready to stop.",
  },
];

/**
 * Score one hazard from the clip-time (seconds) at which the learner clicked it.
 * Clicking before the window opens scores the maximum 5 (good anticipation);
 * within the window the score falls 5->1; after it closes the hazard has already
 * happened and scores 0.
 */
export function scoreHazardClick(developStart: number, developEnd: number, clickT: number): number {
  if (clickT > developEnd) return 0;
  if (clickT <= developStart) return MAX_PER_HAZARD;
  const frac = (developEnd - clickT) / (developEnd - developStart); // 1 -> 0 across window
  return Math.max(1, Math.min(MAX_PER_HAZARD, Math.ceil(frac * MAX_PER_HAZARD)));
}

/** Excessive random clicking (false alarms) voids a clip, as in the real test. */
export function tooManyFalseAlarms(blankClickTimes: number[]): boolean {
  if (blankClickTimes.length > 10) return true;
  if (blankClickTimes.length >= 6) {
    const gaps: number[] = [];
    for (let i = 1; i < blankClickTimes.length; i++) gaps.push(blankClickTimes[i] - blankClickTimes[i - 1]);
    const spread = Math.max(...gaps) - Math.min(...gaps);
    if (spread < 0.4) return true; // steady rhythm = mashing
  }
  return false;
}

/** Difficulty widens (easier) or narrows (harder) the effective scoring window. */
export const DIFFICULTY = {
  relaxed: { label: "Relaxed", bias: 1.2, blurb: "More time to react" },
  standard: { label: "Standard", bias: 0, blurb: "Real test timing" },
  hard: { label: "Hard", bias: -0.5, blurb: "React earlier" },
} as const;
export type DifficultyKey = keyof typeof DIFFICULTY;

export const maxHazardScore = () =>
  HAZARD_CLIPS.reduce((s, c) => s + c.hazards.length * MAX_PER_HAZARD, 0);

export const hazardPassMark = () => Math.round((HAZARD_PASS_MARK / 75) * maxHazardScore());
