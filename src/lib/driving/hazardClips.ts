import type { HazardClip } from "./types";

/* Hazard perception clips.
 *
 * The real DVSA test plays 14 filmed clips and you click as a hazard *develops*.
 * Here each clip is an animated first-person road scene drawn on a canvas by
 * <HazardScene>. A "developing hazard" is an actor (pedestrian, cyclist, car…)
 * that appears, then moves into your path during a scoring window. Clicking
 * inside the 5-band window scores 5→1 (earlier = more), like the real test.
 *
 * scene controls the backdrop; hazard actor is inferred from the label text.
 */
export const HAZARD_CLIPS: HazardClip[] = [
  {
    id: "clip-1",
    title: "Residential street",
    duration: 16,
    scene: "residential",
    hazards: [
      { label: "Pedestrian steps out from between parked cars", appearsAt: 6, windowStart: 7.5, windowEnd: 11 },
    ],
    debrief:
      "Among parked cars, watch for movement at gaps and under vehicles (feet/shadows). The pedestrian who steps out is the developing hazard — you should ease off and cover the brake well before they reach the road.",
  },
  {
    id: "clip-2",
    title: "Approaching a side junction",
    duration: 15,
    scene: "junction",
    hazards: [
      { label: "Cyclist emerges from the junction on the left", appearsAt: 5, windowStart: 6.5, windowEnd: 10 },
    ],
    debrief:
      "Scan side roads as you approach. The cyclist pulling out from the left is the developing hazard — early observation lets you slow smoothly rather than brake hard.",
  },
  {
    id: "clip-3",
    title: "Country road bend",
    duration: 17,
    scene: "rural",
    hazards: [
      { label: "Oncoming car overtakes towards you", appearsAt: 7, windowStart: 8.5, windowEnd: 12 },
    ],
    debrief:
      "On rural bends you can't see far ahead. The oncoming vehicle pulling out to overtake comes into your path — reduce speed and be ready to move left.",
  },
  {
    id: "clip-4",
    title: "Town centre crossing",
    duration: 16,
    scene: "town",
    hazards: [
      { label: "Pedestrian walks onto the zebra crossing", appearsAt: 6, windowStart: 7, windowEnd: 10.5 },
    ],
    debrief:
      "Approaching a crossing, look for anyone waiting at the kerb. The pedestrian stepping onto the zebra crossing means you must be ready to stop — they have priority.",
  },
  {
    id: "clip-5",
    title: "Parked van pulls away",
    duration: 16,
    scene: "residential",
    hazards: [
      { label: "Parked vehicle pulls out into your lane", appearsAt: 5, windowStart: 7, windowEnd: 11 },
    ],
    debrief:
      "Look for clues a parked vehicle is about to move: brake lights, exhaust smoke, wheels turned, a driver inside. As it pulls out it becomes the developing hazard.",
  },
  {
    id: "clip-6",
    title: "Dual carriageway slip road",
    duration: 18,
    scene: "dual",
    hazards: [
      { label: "Vehicle merges from the slip road on the left", appearsAt: 6, windowStart: 7.5, windowEnd: 11 },
      { label: "Brake lights of slowing traffic ahead", appearsAt: 12, windowStart: 13, windowEnd: 16 },
    ],
    debrief:
      "This clip has TWO developing hazards: the merging vehicle from the slip road, and then traffic braking ahead. Spot each early and respond to both.",
  },
];

export const HAZARD_PASS_MARK = 44; // out of 75 in the real test
export const MAX_PER_HAZARD = 5;
