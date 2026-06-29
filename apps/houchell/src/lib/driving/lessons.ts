import type { CategoryId } from "./types";

/* Bite-size "Learn" lessons for the UK theory test. Each lesson gives clearly
 * formatted information across a few sections, then finishes with a short quiz
 * drawn from that topic's questions. Content is based on The Highway Code (2026).
 */

export interface LessonSection {
  heading: string;
  /** bullet points shown in order */
  points: string[];
}

export interface Lesson {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  /** which question category the closing quiz is drawn from */
  category: CategoryId;
  sections: LessonSection[];
  /** number of questions in the closing quiz */
  quizCount: number;
}

export const LESSONS: Lesson[] = [
  {
    id: "stopping-distances",
    title: "Stopping distances & safety margins",
    icon: "📏",
    blurb: "How far it really takes to stop, and the gaps that keep you safe.",
    category: "safety-margins",
    quizCount: 4,
    sections: [
      {
        heading: "Thinking + braking = stopping",
        points: [
          "Overall stopping distance = thinking distance (while you react) + braking distance (while the car slows).",
          "At 30 mph it's about 23 m (9 m thinking + 14 m braking) — roughly 6 car lengths.",
          "At 60 mph it's about 73 m; at 70 mph about 96 m — around 24 car lengths.",
          "Speed has a huge effect: braking distance roughly quadruples when speed doubles.",
        ],
      },
      {
        heading: "The two-second rule",
        points: [
          "On a dry road, leave at least a two-second gap to the vehicle in front.",
          "Pick a fixed point; if you reach it before saying 'only a fool breaks the two-second rule', you're too close.",
          "Double the gap to at least four seconds in the wet.",
          "Leave up to ten times the gap on ice or snow.",
        ],
      },
      {
        heading: "Poor conditions",
        points: [
          "Wet roads at least double stopping distances; icy roads can multiply them by ten.",
          "If steering feels light in heavy rain you may be aquaplaning — ease off the accelerator, don't brake hard.",
          "Don't coast (rolling in neutral or with the clutch down) — you lose engine braking and control.",
          "Keep well back from the vehicle in front to give yourself time and a clear view.",
        ],
      },
    ],
  },
  {
    id: "speed-and-rules",
    title: "Speed limits & rules of the road",
    icon: "🛣️",
    blurb: "Limits, junctions, parking and who has priority.",
    category: "rules-of-the-road",
    quizCount: 4,
    sections: [
      {
        heading: "National speed limits (cars)",
        points: [
          "Built-up area with street lights: usually 30 mph unless signs say otherwise.",
          "Single carriageway: 60 mph. Dual carriageway: 70 mph. Motorway: 70 mph.",
          "Towing a trailer or caravan: 50 mph single, 60 mph dual carriageway and motorway.",
          "A limit is a maximum, not a target — slow down for the conditions.",
        ],
      },
      {
        heading: "Junctions & priority",
        points: [
          "Give way means give priority to traffic on the major road; stop if necessary.",
          "At a roundabout, give way to traffic coming from your immediate right unless signs/markings say otherwise.",
          "Don't enter a box junction unless your exit is clear (you may wait to turn right if only oncoming traffic stops you).",
          "Give way to pedestrians waiting to cross, or crossing, at a junction.",
        ],
      },
      {
        heading: "Parking & waiting",
        points: [
          "Don't park on zig-zag lines, within 10 m of a junction, or where you'd block access.",
          "Double yellow lines mean no waiting at any time.",
          "Never park where you would force others onto the wrong side of the road, or near a school entrance.",
          "At night, park in the direction of traffic flow and use parking lights where required.",
        ],
      },
    ],
  },
  {
    id: "signs-and-signals",
    title: "Road signs & signals",
    icon: "🚸",
    blurb: "Read shapes and colours at a glance — and the traffic-light sequence.",
    category: "road-and-traffic-signs",
    quizCount: 4,
    sections: [
      {
        heading: "Shapes tell you the type",
        points: [
          "Circles give orders: red rings prohibit, blue circles give a positive instruction.",
          "Triangles warn (red border, white background).",
          "Rectangles inform.",
          "Two unique shapes: the octagon = STOP, and the inverted triangle = give way.",
        ],
      },
      {
        heading: "Colours on direction signs",
        points: [
          "Blue background = motorway signs.",
          "Green background = primary routes.",
          "White background with black border = minor/local roads.",
          "Brown signs point to tourist attractions.",
        ],
      },
      {
        heading: "Traffic-light sequence",
        points: [
          "Red — stop and wait behind the line.",
          "Red and amber — stop; don't go until green shows.",
          "Green — go if the way is clear.",
          "Amber — stop, unless you've crossed the line or stopping could cause a collision. A flashing amber at a pelican crossing means give way to pedestrians.",
        ],
      },
    ],
  },
  {
    id: "vulnerable-users",
    title: "Vulnerable road users",
    icon: "🚶",
    blurb: "Pedestrians, cyclists, riders and the hierarchy of road users.",
    category: "vulnerable-road-users",
    quizCount: 4,
    sections: [
      {
        heading: "Hierarchy of road users",
        points: [
          "Those who can do the most harm have the greatest responsibility to reduce danger.",
          "Priority order: pedestrians, cyclists, horse riders, motorcyclists, then cars and larger vehicles.",
          "Give way to pedestrians waiting to cross at a junction.",
          "Give priority to pedestrians on zebra and parallel crossings.",
        ],
      },
      {
        heading: "Passing safely",
        points: [
          "Leave at least 1.5 m when passing cyclists at up to 30 mph — more at higher speeds.",
          "Pass horse riders slowly and widely, at no more than 10 mph, and never sound your horn.",
          "Give motorcyclists plenty of room; look twice at junctions as they're easy to miss.",
          "Use the 'Dutch reach' — open your door with the hand furthest from it so you turn to look for cyclists.",
        ],
      },
      {
        heading: "Pedestrians to watch for",
        points: [
          "Children near schools, ice-cream vans and parked cars may step out suddenly.",
          "Older and disabled people may need more time to cross.",
          "Someone with a white cane is blind; white with a red band means deaf and blind.",
          "Be patient — never rev your engine or wave people across.",
        ],
      },
    ],
  },
  {
    id: "motorways",
    title: "Motorways",
    icon: "🛤️",
    blurb: "Joining, lane discipline, studs, smart motorways and breakdowns.",
    category: "motorway-rules",
    quizCount: 4,
    sections: [
      {
        heading: "Who and how",
        points: [
          "Learner drivers may only use motorways with an approved instructor in a dual-control car.",
          "Cyclists, pedestrians, mopeds under 50 cc and slow vehicles aren't allowed.",
          "Join from the slip road, build up speed and merge into a safe gap, giving way to traffic already there.",
          "The national speed limit for cars is 70 mph unless a lower limit is shown.",
        ],
      },
      {
        heading: "Lanes & studs",
        points: [
          "Keep to the left lane; the middle and right lanes are for overtaking only.",
          "Reflective studs: red on the left edge, white between lanes, amber on the right edge, green at slip roads.",
          "A red X above a lane means it's closed — move out of it in good time.",
          "Variable limits in a red ring on a gantry are mandatory and enforced.",
        ],
      },
      {
        heading: "Breakdowns",
        points: [
          "Get onto the hard shoulder or into an emergency refuge area.",
          "Leave by the left-hand door and wait behind the safety barrier.",
          "Use the emergency telephone or your mobile to call for help.",
          "If you miss your exit, carry on to the next one — never reverse or turn around.",
        ],
      },
    ],
  },
  {
    id: "hazard-awareness",
    title: "Hazard awareness",
    icon: "⚠️",
    blurb: "Spotting developing hazards and staying fit to drive.",
    category: "hazard-awareness",
    quizCount: 4,
    sections: [
      {
        heading: "Static vs developing hazards",
        points: [
          "A static hazard is fixed (a junction, a bend, parked cars); a developing hazard changes and may need you to act.",
          "Scan and plan ahead — look well down the road, not just at the car in front.",
          "Anticipate: a ball bouncing into the road may be followed by a child.",
          "Slow down early and gently rather than braking hard at the last moment.",
        ],
      },
      {
        heading: "Fit to drive",
        points: [
          "Tiredness is dangerous — if you feel sleepy, stop in a safe place, rest, and have caffeine plus a short nap.",
          "Never drink and drive; alcohol and many drugs (including some prescription medicines) impair driving.",
          "Don't drive if medicine warns it may cause drowsiness — check with a pharmacist.",
          "On a motorway you must not stop on the hard shoulder to rest — leave at the next exit or services.",
        ],
      },
      {
        heading: "Distractions & vision",
        points: [
          "Using a hand-held phone while driving is illegal — set up sat-nav before you set off.",
          "At night, dip your headlights and don't be dazzled — slow down or stop if you can't see.",
          "Keep windows and mirrors clean for a clear view.",
          "If dazzled by an oncoming vehicle, slow down and look to the left edge of the road.",
        ],
      },
    ],
  },
  {
    id: "attitude",
    title: "Attitude & considerate driving",
    icon: "🤝",
    blurb: "Patience, priority and sharing the road calmly.",
    category: "attitude",
    quizCount: 4,
    sections: [
      {
        heading: "Keep your distance",
        points: [
          "Keep a safe following gap (two seconds dry, four wet) so you're never rushed.",
          "If a driver tailgates you, slow down gently and leave more room ahead — don't speed up.",
          "Flashing your headlights only means 'I am here' — never use it to give priority or rush others.",
          "Use your horn only to warn others of your presence, not in anger (and not when stationary or in a built-up area at night).",
        ],
      },
      {
        heading: "Give way and give space",
        points: [
          "Give priority to buses signalling to pull out from a stop when it's safe.",
          "Let emergency vehicles pass — pull over safely, but don't break the law or endanger others.",
          "Be patient with learners, cyclists and slow vehicles.",
          "Don't block junctions or yellow box junctions.",
        ],
      },
    ],
  },
  {
    id: "alertness",
    title: "Alertness & concentration",
    icon: "👀",
    blurb: "Observation, mirrors, signals and avoiding distraction.",
    category: "alertness",
    quizCount: 4,
    sections: [
      {
        heading: "Observation",
        points: [
          "Mirrors — Signal — Manoeuvre: check before you change speed or direction.",
          "Take a 'lifesaver' glance over your shoulder to check blind spots before moving off or changing lane.",
          "Look well ahead and keep scanning — don't fix on one point.",
          "Check mirrors before slowing or stopping so you know what's behind.",
        ],
      },
      {
        heading: "Signalling clearly",
        points: [
          "Signal in good time so others can react, and cancel it afterwards.",
          "Don't signal carelessly — a wrongly timed signal can mislead others.",
          "Make eye contact with pedestrians and other drivers where helpful, but never wave people across.",
          "Avoid distractions: phones, eating, loud music and adjusting controls on the move.",
        ],
      },
    ],
  },
  {
    id: "your-vehicle",
    title: "Safety & your vehicle",
    icon: "🔧",
    blurb: "Tyres, lights, security and reducing your impact.",
    category: "safety-and-your-vehicle",
    quizCount: 4,
    sections: [
      {
        heading: "Keep it roadworthy",
        points: [
          "Car tyres must have at least 1.6 mm of tread across the central three-quarters, all the way round.",
          "Check tyre pressures regularly, and before a long or heavily loaded journey.",
          "Faulty lights, brakes or steering must be repaired as soon as possible.",
          "Make sure your view is clear — clean windows and working wipers and washers.",
        ],
      },
      {
        heading: "Eco & security",
        points: [
          "Drive smoothly and in the right gear to cut fuel use and emissions; switch off if you'll be stationary a while.",
          "Remove a roof rack when not in use — it increases drag and fuel use.",
          "Lock your car, take the keys and don't leave valuables on show.",
          "Use an immobiliser/steering lock and park in well-lit or secure places.",
        ],
      },
    ],
  },
  {
    id: "weather",
    title: "Driving in bad weather",
    icon: "🌧️",
    blurb: "Fog, rain, ice, night and difficult surfaces.",
    category: "vehicle-handling",
    quizCount: 4,
    sections: [
      {
        heading: "Rain, fog & spray",
        points: [
          "In fog use dipped headlights; use fog lights only when visibility drops below 100 m and switch them off when it improves.",
          "In rain, keep well back — spray reduces your view and stopping distances at least double.",
          "Slow down and use your wipers and lights so others can see you.",
          "After driving through water, test your brakes gently.",
        ],
      },
      {
        heading: "Ice, snow & night",
        points: [
          "On ice use gentle acceleration, braking and steering, and leave up to ten times the normal gap.",
          "Pull away in a higher gear to reduce wheelspin.",
          "At night, dip your headlights for oncoming traffic and when following another vehicle.",
          "On single-track roads, use passing places to let oncoming traffic through.",
        ],
      },
    ],
  },
  {
    id: "documents",
    title: "Documents & the law",
    icon: "📄",
    blurb: "Licence, insurance, MOT, tax and the New Drivers Act.",
    category: "essential-documents",
    quizCount: 4,
    sections: [
      {
        heading: "What you must have",
        points: [
          "A valid driving licence, at least third-party insurance, and (if applicable) a valid MOT to drive legally.",
          "Cars need an MOT once they're 3 years old; you need a valid MOT to tax the vehicle.",
          "Keep your vehicle taxed; tax doesn't transfer when you sell.",
          "Tell DVLA if you change your name or address, or sell the vehicle (V5C).",
        ],
      },
      {
        heading: "Rules for new and learner drivers",
        points: [
          "If asked, you can be given 7 days to produce documents at a police station.",
          "New Drivers Act: your licence is revoked if you get 6 or more penalty points within 2 years of passing.",
          "Learners must display L plates and be supervised by someone 21+ who has held a full licence for 3+ years.",
          "Learners must be insured to drive the vehicle they're learning in.",
        ],
      },
    ],
  },
  {
    id: "first-aid",
    title: "Accidents & first aid",
    icon: "🚑",
    blurb: "What to do at an incident and basic life support.",
    category: "incidents-accidents-emergencies",
    quizCount: 4,
    sections: [
      {
        heading: "At the scene",
        points: [
          "Warn other traffic, switch off engines and stop anyone smoking.",
          "Call 999/112 with the location and details; only move casualties if they're in danger.",
          "Don't remove a motorcyclist's helmet unless you must to keep the airway open.",
          "If details aren't exchanged after a collision, report it to the police within 24 hours.",
        ],
      },
      {
        heading: "First aid — DR ABC",
        points: [
          "Danger — make the area safe. Response — check if they respond.",
          "Airway — tilt the head back gently and lift the chin. Breathing — look, listen and feel.",
          "Circulation — if not breathing normally, give chest compressions (100–120 a minute, 5–6 cm deep).",
          "Stop bleeding with firm pressure; cool burns with clean cool water for at least 10 minutes; keep the casualty warm and calm.",
        ],
      },
    ],
  },
  {
    id: "loading",
    title: "Loading & towing",
    icon: "📦",
    blurb: "Carrying loads and passengers safely.",
    category: "vehicle-loading",
    quizCount: 4,
    sections: [
      {
        heading: "Loads",
        points: [
          "The driver is responsible for the vehicle not being overloaded and the load being secure.",
          "Distribute weight evenly; a heavy or loose load affects handling, braking and steering.",
          "A roof rack/load raises the centre of gravity and increases fuel use and instability.",
          "Don't let a load obscure your lights or number plate.",
        ],
      },
      {
        heading: "Passengers & towing",
        points: [
          "The driver is responsible for ensuring children under 14 use the correct restraint or seat belt.",
          "Use the right child seat for the child's height/weight; never fit a rear-facing seat in front of an active airbag.",
          "When towing, fit a stabiliser and don't exceed the lower towing speed limits.",
          "If a trailer or caravan starts to snake, ease off the accelerator gently — don't brake harshly.",
        ],
      },
    ],
  },
  {
    id: "other-vehicles",
    title: "Sharing the road with other vehicles",
    icon: "🚌",
    blurb: "Lorries, buses, trams and motorcyclists.",
    category: "other-types-of-vehicle",
    quizCount: 4,
    sections: [
      {
        heading: "Large vehicles",
        points: [
          "Long vehicles swing out to turn — don't try to pass on the side they're turning towards.",
          "Large vehicles have big blind spots; if you can't see the mirrors, the driver can't see you.",
          "Give priority to buses signalling to move off from a stop when it's safe.",
          "Hold back behind lorries on hills and at junctions where they need more room.",
        ],
      },
      {
        heading: "Trams & motorcyclists",
        points: [
          "Trams are quiet and can't steer to avoid you — never park on or block tram rails.",
          "Take extra care crossing tram rails, especially in the wet.",
          "Motorcyclists and cyclists can be hidden at junctions and in queues — look twice.",
          "In windy weather, give motorcyclists and cyclists extra room as they may be blown off course.",
        ],
      },
    ],
  },
];

export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(
  LESSONS.map((l) => [l.id, l])
);
