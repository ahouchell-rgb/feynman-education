import type { RoadSign } from "./types";

/* A reference set of common UK road signs for the revision section. Each sign is
 * drawn from these fields by <SignGlyph> as inline SVG (no image assets). Shapes
 * follow the real conventions:
 *   - red triangle  = warning
 *   - red circle    = prohibition / restriction
 *   - blue circle   = mandatory (positive) instruction
 *   - octagon       = STOP; inverted triangle = give way
 *   - rectangles    = information / direction
 */
export const SIGNS: RoadSign[] = [
  // ── Warning signs (red triangle) ──
  { id: "warn-crossroads", kind: "warning", name: "Crossroads", meaning: "Crossroads ahead where traffic may cross your path." },
  { id: "warn-tjunction", kind: "warning", name: "T-junction", meaning: "T-junction ahead — the road you are on ends; give way to traffic on the major road." },
  { id: "warn-roundabout", kind: "warning", name: "Roundabout ahead", meaning: "A roundabout is ahead. Be ready to give way to traffic from the right." },
  { id: "warn-bend-right", kind: "warning", name: "Bend to the right", meaning: "Sharp bend to the right ahead — reduce speed before the bend." },
  { id: "warn-double-bend", kind: "warning", name: "Double bend", meaning: "Double bend, first to the left (chevrons may show the direction)." },
  { id: "warn-road-narrows", kind: "warning", name: "Road narrows both sides", meaning: "The road narrows on both sides ahead." },
  { id: "warn-children", kind: "warning", name: "Children / school", meaning: "Watch for children, e.g. near a school or playground. Be ready to stop." },
  { id: "warn-pedestrians", kind: "warning", name: "Pedestrians in road", meaning: "Be aware of pedestrians who may be in the road ahead." },
  { id: "warn-cycle", kind: "warning", name: "Cycle route ahead", meaning: "Route used by pedal cycles crossing or joining the road ahead." },
  { id: "warn-slippery", kind: "warning", name: "Slippery road", meaning: "Road may be slippery — reduce speed and avoid harsh braking." },
  { id: "warn-roadworks", kind: "warning", name: "Roadworks", meaning: "Roadworks ahead — slow down and watch for workers and changes in layout." },
  { id: "warn-traffic-signals", kind: "warning", name: "Traffic signals", meaning: "Traffic light signals ahead — be ready to stop." },
  { id: "warn-level-crossing", kind: "warning", name: "Level crossing (no barrier)", meaning: "Level crossing without a barrier or gate ahead." },
  { id: "warn-steep-hill", kind: "warning", name: "Steep hill downwards", meaning: "Steep descent ahead — select a lower gear in good time." },

  // ── Regulatory — prohibitive (red circle) ──
  { id: "reg-stop", kind: "regulatory", name: "Stop", meaning: "Octagonal STOP sign: you must stop completely and give way at the line." },
  { id: "reg-give-way", kind: "regulatory", name: "Give way", meaning: "Give way to traffic on the major road. Stop if necessary." },
  { id: "reg-no-entry", kind: "regulatory", name: "No entry", meaning: "No entry for vehicular traffic — you must not pass this sign." },
  { id: "reg-no-vehicles", kind: "regulatory", name: "No motor vehicles", meaning: "No motor vehicles permitted beyond this point." },
  { id: "reg-no-overtaking", kind: "regulatory", name: "No overtaking", meaning: "Overtaking is not permitted until the end-of-restriction sign." },
  { id: "reg-no-left", kind: "regulatory", name: "No left turn", meaning: "You must not turn left at this point." },
  { id: "reg-no-uturn", kind: "regulatory", name: "No U-turns", meaning: "You must not make a U-turn at this point." },
  { id: "reg-no-waiting", kind: "regulatory", name: "No waiting", meaning: "No waiting at any time (blue circle, red ring and one diagonal)." },
  { id: "reg-20", kind: "regulatory", name: "Maximum speed 20 mph", meaning: "Mandatory maximum speed limit of 20 mph applies." },
  { id: "reg-30", kind: "regulatory", name: "Maximum speed 30 mph", meaning: "Mandatory maximum speed limit of 30 mph applies." },
  { id: "reg-40", kind: "regulatory", name: "Maximum speed 40 mph", meaning: "Mandatory maximum speed limit of 40 mph applies." },
  { id: "reg-national", kind: "regulatory", name: "National speed limit", meaning: "The national speed limit applies (e.g. 60 mph single / 70 mph dual carriageway for cars)." },
  { id: "reg-no-stopping", kind: "regulatory", name: "No stopping (clearway)", meaning: "You must not stop on the main carriageway, even to pick up or set down." },

  // ── Regulatory — mandatory (blue circle) ──
  { id: "mand-ahead-only", kind: "regulatory", name: "Ahead only", meaning: "Blue circle: you must proceed straight ahead." },
  { id: "mand-turn-left", kind: "regulatory", name: "Turn left ahead", meaning: "Positive instruction — you must turn left ahead." },
  { id: "mand-turn-right", kind: "regulatory", name: "Turn right ahead", meaning: "Positive instruction — you must turn right ahead." },
  { id: "mand-keep-left", kind: "regulatory", name: "Keep left", meaning: "Pass to the left of the sign / island." },
  { id: "mand-mini-roundabout", kind: "regulatory", name: "Mini-roundabout", meaning: "Mini-roundabout — give way to traffic from your right." },
  { id: "mand-pass-either", kind: "regulatory", name: "Pass either side", meaning: "You may pass on either side to reach the same destination." },

  // ── Information / direction (rectangles) ──
  { id: "info-motorway", kind: "information", name: "Motorway sign (blue)", meaning: "Directions on motorways use white text on a blue background." },
  { id: "info-primary", kind: "direction", name: "Primary route (green)", meaning: "Directions on primary routes use white text on a green background." },
  { id: "info-local", kind: "direction", name: "Local / minor route (white)", meaning: "Directions on non-primary routes use black text on a white background." },
  { id: "info-parking", kind: "information", name: "Parking", meaning: "Indicates a car park or where parking is permitted." },
  { id: "info-hospital", kind: "information", name: "Hospital", meaning: "Hospital ahead with A&E facilities (where shown)." },
  { id: "info-pedestrian-zone", kind: "information", name: "Pedestrian zone", meaning: "Start of a pedestrian-only zone." },
];

export const SIGN_BY_ID: Record<string, RoadSign> = Object.fromEntries(
  SIGNS.map((s) => [s.id, s])
);

export const SIGN_KIND_LABEL: Record<RoadSign["kind"], string> = {
  warning: "Warning",
  regulatory: "Regulatory",
  information: "Information",
  direction: "Direction",
};
