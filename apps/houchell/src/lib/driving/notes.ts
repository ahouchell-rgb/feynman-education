/* Concise revision notes — the key facts behind the questions, grouped into
 * digestible cards for the Revise section. Based on The Highway Code (2026). */

export interface NoteSection {
  id: string;
  title: string;
  points: string[];
}

export const NOTES: NoteSection[] = [
  {
    id: "stopping-distances",
    title: "Typical stopping distances",
    points: [
      "20 mph: 12 m (3 car lengths) — 6 m thinking + 6 m braking.",
      "30 mph: 23 m (6 car lengths) — 9 m thinking + 14 m braking.",
      "40 mph: 36 m (9 car lengths).",
      "50 mph: 53 m (13 car lengths).",
      "60 mph: 73 m (18 car lengths).",
      "70 mph: 96 m (24 car lengths).",
      "In the wet, stopping distances at least DOUBLE. On ice they can be up to TEN times greater.",
    ],
  },
  {
    id: "two-second-rule",
    title: "Separation distance",
    points: [
      "Leave at least a two-second gap to the vehicle in front on a dry road.",
      "Double it to at least four seconds in the rain.",
      "Leave an even bigger gap on icy roads — up to ten times the normal distance.",
      "If someone tailgates you, slow down gently and increase the gap to the vehicle ahead.",
    ],
  },
  {
    id: "speed-limits",
    title: "National speed limits (cars)",
    points: [
      "Built-up area (street lights, no other signs): 30 mph.",
      "Single carriageway: 60 mph.",
      "Dual carriageway: 70 mph.",
      "Motorway: 70 mph.",
      "When towing a trailer/caravan: 50 mph single, 60 mph dual carriageway and motorway.",
      "Speed limits are a maximum, not a target — slow down for conditions.",
    ],
  },
  {
    id: "traffic-lights",
    title: "Traffic light sequence",
    points: [
      "RED — stop and wait behind the stop line.",
      "RED + AMBER — stop; do not go until green shows.",
      "GREEN — go if the way is clear.",
      "AMBER — stop, unless you have crossed the line or are so close that stopping might cause a collision.",
      "A flashing amber (at a pelican crossing) means give way to pedestrians on the crossing, then go.",
      "A green filter arrow means you may go in that direction.",
    ],
  },
  {
    id: "hierarchy",
    title: "Hierarchy of road users (2022 update)",
    points: [
      "Those who can cause the greatest harm have the greatest responsibility to reduce danger to others.",
      "Order of priority: pedestrians, then cyclists, then horse riders, then motorcyclists, then cars/vans, then large vehicles.",
      "Give way to pedestrians waiting to cross — or crossing — at a junction.",
      "Give priority to pedestrians on a zebra crossing and at parallel crossings.",
    ],
  },
  {
    id: "passing-cyclists",
    title: "Passing cyclists, horses and pedestrians",
    points: [
      "Leave at least 1.5 m when passing cyclists at speeds up to 30 mph — more at higher speeds.",
      "Pass horse riders and horse-drawn vehicles slowly, at no more than 10 mph, leaving at least 2 m.",
      "Allow at least 2 m and a low speed when passing pedestrians walking in the road.",
      "Use the 'Dutch reach' — open your door with the hand furthest from it so you turn and check for cyclists.",
    ],
  },
  {
    id: "documents",
    title: "Essential documents",
    points: [
      "You must have a valid licence, insurance (at least third-party) and (if applicable) MOT to drive.",
      "Cars need an MOT once they are 3 years old; you need a valid MOT to tax the vehicle.",
      "Tell DVLA if you change your name or address, or sell the vehicle (V5C).",
      "If asked by police you can be given 7 days to produce documents at a station.",
      "New Drivers Act: your licence is revoked if you get 6+ penalty points within 2 years of passing.",
      "Learners must display L plates and be supervised by someone 21+ who has held a full licence for 3+ years.",
    ],
  },
  {
    id: "first-aid",
    title: "First aid at an incident (DR ABC)",
    points: [
      "Danger — make the area safe before you approach.",
      "Response — check if the casualty responds to speech and touch.",
      "Airway — tilt the head back gently and lift the chin to open the airway.",
      "Breathing — look, listen and feel for normal breathing.",
      "Circulation — if not breathing, give chest compressions (100–120 a minute, 5–6 cm deep).",
      "Stop bleeding with firm pressure; cool burns with clean cool water for at least 10 minutes; do NOT remove a motorcyclist's helmet unless you must to keep the airway open.",
    ],
  },
  {
    id: "weather",
    title: "Driving in poor conditions",
    points: [
      "Fog: use dipped headlights; use fog lights only when visibility is below 100 m and switch them off when it improves.",
      "Rain: ease off the accelerator if steering goes light (aquaplaning) — don't brake hard.",
      "Ice/snow: use gentle acceleration, braking and steering; pull away in a higher gear to avoid wheelspin.",
      "Night: dip your headlights for oncoming traffic and when following another vehicle.",
      "Bright sun and dazzle: slow down and use your sun visor.",
    ],
  },
  {
    id: "motorway",
    title: "Motorways",
    points: [
      "Learners may only use motorways with an approved instructor in a dual-control car.",
      "Keep to the left lane; only use the middle and right lanes for overtaking.",
      "Reflective studs: red on the left edge, white between lanes, amber on the right edge, green at slip roads.",
      "A red X above a lane means the lane is closed — do not drive in it.",
      "On a breakdown, get onto the hard shoulder or into an emergency refuge area, exit left and wait behind the barrier.",
    ],
  },
];
