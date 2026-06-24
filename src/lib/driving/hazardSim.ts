import type { HazardClip } from "./types";

/* Hazard perception clips for the moving simulation.
 *
 * Each clip is a first-person drive. You move forward at DRIVE_SPEED; actors
 * appear far ahead and sweep towards you. A hazard starts "safe" then moves into
 * your path during its develop window — click ON it during that window to react.
 * Earlier reactions score more (5→1), like the real DVSA test. Ambient actors
 * are decoys that stay in their lane and must NOT be clicked.
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
    ambient: [
      { kind: "pedestrian", side: "right", worldX: 4.2, appearAt: 0, travel: 6.5 },
      { kind: "oncoming", side: "right", worldX: 1.7, appearAt: 3, travel: 5 },
    ],
    hazards: [
      {
        id: "h1",
        kind: "child",
        side: "left",
        appearAt: 1,
        travel: 6.2,
        developStart: 4.6,
        developEnd: 7,
        label: "A child runs out from between parked cars on the left",
      },
    ],
    debrief:
      "Among parked cars, watch the gaps and look under vehicles for feet. The child running out is the developing hazard — react as soon as you see movement.",
  },
  {
    id: "clip-2",
    title: "Side junction",
    duration: 11,
    scene: "town",
    ambient: [
      { kind: "pedestrian", side: "left", worldX: -4.2, appearAt: 0.5, travel: 6.5 },
      { kind: "oncoming", side: "right", worldX: 1.7, appearAt: 4, travel: 5 },
    ],
    hazards: [
      {
        id: "h1",
        kind: "car",
        side: "left",
        fromJunction: true,
        appearAt: 1.5,
        travel: 6.5,
        developStart: 5,
        developEnd: 7.6,
        label: "A car pulls out from the side road on the left",
      },
    ],
    debrief:
      "Scan side roads as you approach a junction. The car edging out then pulling across is the hazard — early observation lets you slow smoothly.",
  },
  {
    id: "clip-3",
    title: "Town centre",
    duration: 12,
    scene: "town",
    ambient: [
      { kind: "pedestrian", side: "left", worldX: -4, appearAt: 1, travel: 6.5 },
      { kind: "pedestrian", side: "right", worldX: 4.3, appearAt: 3, travel: 6 },
    ],
    hazards: [
      {
        id: "h1",
        kind: "pedestrian",
        side: "right",
        appearAt: 2,
        travel: 6.5,
        developStart: 5.8,
        developEnd: 8.4,
        label: "A pedestrian steps off the kerb to cross from the right",
      },
    ],
    debrief:
      "Look for people at the kerb who may step out. The pedestrian crossing from the right is the hazard — be ready to stop; they may not have seen you.",
  },
  {
    id: "clip-4",
    title: "Parked car & cyclist",
    duration: 11,
    scene: "residential",
    ambient: [{ kind: "oncoming", side: "right", worldX: 1.7, appearAt: 2.5, travel: 5 }],
    hazards: [
      {
        id: "h1",
        kind: "cyclist",
        side: "left",
        appearAt: 1.5,
        travel: 6.8,
        developStart: 5,
        developEnd: 7.8,
        label: "A cyclist moves out into your lane to pass a parked car",
      },
    ],
    debrief:
      "A cyclist ahead will need to move out around the parked car. As they pull into your lane they become the hazard — hold back and give at least 1.5 m.",
  },
  {
    id: "clip-5",
    title: "Country road",
    duration: 11,
    scene: "rural",
    ambient: [],
    hazards: [
      {
        id: "h1",
        kind: "oncoming",
        side: "right",
        appearAt: 2,
        travel: 6,
        developStart: 4.8,
        developEnd: 7.2,
        label: "An oncoming car crosses onto your side of the road",
      },
    ],
    debrief:
      "On narrow rural roads watch oncoming traffic closely. This car drifts across the centre line towards you — ease off and move to the left early.",
  },
  {
    id: "clip-6",
    title: "Busy high street (two hazards)",
    duration: 14,
    scene: "town",
    ambient: [{ kind: "pedestrian", side: "left", worldX: -4.1, appearAt: 1, travel: 6.5 }],
    hazards: [
      {
        id: "h1",
        kind: "bus",
        side: "left",
        appearAt: 1,
        travel: 6.5,
        developStart: 4,
        developEnd: 6.4,
        label: "A bus pulls out from a bus stop on the left",
      },
      {
        id: "h2",
        kind: "child",
        side: "right",
        appearAt: 6.5,
        travel: 6.2,
        developStart: 9.6,
        developEnd: 12,
        label: "A child steps out from the right further down the road",
      },
    ],
    debrief:
      "This clip has TWO hazards: the bus pulling out, then a child stepping out further on. Stay alert to the end — react to each as it develops.",
  },
];

/**
 * Score one hazard from the clip-time (seconds) at which the learner clicked it.
 * Clicking before the window opens scores the maximum 5 (good anticipation);
 * within the window the score falls 5→1; after it closes the hazard has already
 * happened and scores 0.
 */
export function scoreHazardClick(developStart: number, developEnd: number, clickT: number): number {
  if (clickT > developEnd) return 0;
  if (clickT <= developStart) return MAX_PER_HAZARD;
  const frac = (developEnd - clickT) / (developEnd - developStart); // 1 → 0 across window
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

export const maxHazardScore = () =>
  HAZARD_CLIPS.reduce((s, c) => s + c.hazards.length * MAX_PER_HAZARD, 0);

export const hazardPassMark = () => Math.round((HAZARD_PASS_MARK / 75) * maxHazardScore());
