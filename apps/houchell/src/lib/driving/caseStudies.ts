import type { Question } from "./types";

/* DVSA-style case studies: a short scenario followed by five questions about it.
 * The real theory test includes one case study; this lets learners practise the
 * format. Questions are self-contained (not part of the main bank). */

export interface CaseStudy {
  id: string;
  title: string;
  scenario: string[];
  questions: Question[];
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: "cs-school-run",
    title: "The school run",
    scenario: [
      "It is a wet weekday morning. Sam is driving to drop a child at primary school.",
      "The road is a 30 mph built-up street lined with parked cars. As Sam approaches the school there are children on the pavement and a queue of slow traffic.",
      "A little further on, a zebra crossing is busy with parents and children.",
    ],
    questions: [
      { id: "cs1-1", category: "safety-margins", selectCount: 1, question: "On the wet road, how should Sam adjust the following distance?", options: ["Keep the normal two-second gap", "At least double it to a four-second gap", "Halve it to keep traffic moving", "It makes no difference at low speed"], correct: [1], explanation: "Wet roads at least double stopping distances, so leave at least a four-second gap." },
      { id: "cs1-2", category: "rules-of-the-road", selectCount: 1, question: "What is the speed limit on this street?", options: ["20 mph", "30 mph", "40 mph", "National speed limit"], correct: [1], explanation: "A built-up street with street lights is usually 30 mph unless signs say otherwise — and Sam should go slower near the school." },
      { id: "cs1-3", category: "vulnerable-road-users", selectCount: 1, question: "Children are on the pavement by the parked cars. What's the main risk?", options: ["They might damage the parked cars", "A child could step out into the road between cars", "They will slow the traffic", "Nothing — they are on the pavement"], correct: [1], explanation: "Children can step out suddenly between parked cars where you can't see them — keep your speed right down and cover the brake." },
      { id: "cs1-4", category: "vulnerable-road-users", selectCount: 1, question: "At the busy zebra crossing, what must Sam do?", options: ["Sound the horn to warn pedestrians", "Give priority to pedestrians on the crossing and be ready to stop", "Edge through gaps between people", "Carry on as pedestrians must wait"], correct: [1], explanation: "Pedestrians have priority on a zebra crossing — be ready to stop and never wave people across or rush them." },
      { id: "cs1-5", category: "alertness", selectCount: 1, question: "The child in the car wants attention. What should Sam do?", options: ["Turn around to deal with it", "Keep concentrating on the road and deal with it when safely stopped", "Hand over a phone to distract them", "Drive faster to finish the journey sooner"], correct: [1], explanation: "Distraction is dangerous — stay focused on the road and only attend to passengers when safely parked." },
    ],
  },
  {
    id: "cs-motorway-trip",
    title: "A motorway journey",
    scenario: [
      "Alex is making a long motorway trip on a clear afternoon, driving a car with no trailer.",
      "Traffic is light. After a while Alex begins to feel tired. Later, an overhead gantry shows a red X above the left-hand lane.",
    ],
    questions: [
      { id: "cs2-1", category: "motorway-rules", selectCount: 1, question: "In light traffic, which lane should Alex normally use?", options: ["The middle lane", "The right-hand lane", "The left-hand lane", "Any lane"], correct: [2], explanation: "Keep to the left lane when the road ahead is clear; the other lanes are for overtaking." },
      { id: "cs2-2", category: "motorway-rules", selectCount: 1, question: "What is the national speed limit for Alex's car here?", options: ["60 mph", "70 mph", "80 mph", "No limit"], correct: [1], explanation: "The national speed limit for cars on a motorway is 70 mph unless a lower limit is shown." },
      { id: "cs2-3", category: "hazard-awareness", selectCount: 1, question: "Feeling tired, what is the safest action?", options: ["Open a window and carry on", "Leave at the next exit or services to rest", "Speed up to finish sooner", "Stop on the hard shoulder for a nap"], correct: [1], explanation: "You must not stop on the hard shoulder to rest. Leave at the next exit or service area and take a proper break." },
      { id: "cs2-4", category: "motorway-rules", selectCount: 1, question: "What does the red X above the left-hand lane mean?", options: ["The lane is for buses only", "The lane is closed — do not use it", "Reduce speed but stay in lane", "End of the motorway"], correct: [1], explanation: "A red X means the lane is closed; move out of it in good time." },
      { id: "cs2-5", category: "incidents-accidents-emergencies", selectCount: 1, question: "If the car broke down on this motorway, what should Alex do first?", options: ["Stop in the live lane and switch on hazard lights", "Get onto the hard shoulder or into a refuge, leave by the left and wait behind the barrier", "Attempt a repair in the lane", "Reverse to the last exit"], correct: [1], explanation: "Get off the carriageway, leave by the left-hand door and wait behind the safety barrier, then call for help." },
    ],
  },
  {
    id: "cs-night-country",
    title: "A country road at night",
    scenario: [
      "Jo is driving home on an unlit single-carriageway country road after dark.",
      "It is dry but there are sharp bends, and Jo meets oncoming traffic. Later a horse and rider are walking ahead in the same direction.",
    ],
    questions: [
      { id: "cs3-1", category: "vehicle-handling", selectCount: 1, question: "What should Jo do as each vehicle approaches from ahead?", options: ["Keep full beam on to see better", "Dip the headlights to avoid dazzling the other driver", "Flash the headlights repeatedly", "Switch the lights off briefly"], correct: [1], explanation: "Dip your headlights for oncoming traffic so you don't dazzle the other driver." },
      { id: "cs3-2", category: "vehicle-handling", selectCount: 1, question: "If Jo is dazzled by oncoming lights, what should Jo do?", options: ["Speed up to get past quickly", "Slow down or stop until vision recovers", "Close both eyes briefly", "Move to the right of the road"], correct: [1], explanation: "If dazzled, slow down or stop until your eyes recover; look towards the left edge of the road to keep your course." },
      { id: "cs3-3", category: "safety-margins", selectCount: 1, question: "On the unlit bends, how should Jo drive?", options: ["At the speed limit regardless", "Within the distance that can be seen to be clear", "As fast as the car ahead", "Using only sidelights"], correct: [1], explanation: "At night and on bends, drive so you can stop within the distance you can see to be clear." },
      { id: "cs3-4", category: "vulnerable-road-users", selectCount: 1, question: "How should Jo pass the horse and rider?", options: ["Quickly, sounding the horn to warn them", "Slowly and widely, at no more than 10 mph", "Closely, to get past in the gap", "Rev the engine so they move over"], correct: [1], explanation: "Pass horses slowly and give them plenty of room, at no more than 10 mph, and never sound your horn or rev the engine." },
      { id: "cs3-5", category: "other-types-of-vehicle", selectCount: 1, question: "Before overtaking the horse, what should Jo check?", options: ["Only the mirror", "That the road ahead is clear and it's safe, with no bends or oncoming traffic", "Nothing — horses are slow", "That the horn works"], correct: [1], explanation: "Only overtake when you can see the road ahead is clear and it's safe to give the horse plenty of room." },
    ],
  },
];

export const CASE_BY_ID: Record<string, CaseStudy> = Object.fromEntries(
  CASE_STUDIES.map((c) => [c.id, c])
);
