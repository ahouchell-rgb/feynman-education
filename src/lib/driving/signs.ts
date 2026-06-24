import type { RoadSign } from "./types";

/* A reference set of common UK road signs for the revision section. Each sign is
 * rendered from these fields by <SignGlyph> (a small SVG drawn from `id`), so no
 * external image assets are needed. */
export const SIGNS: RoadSign[] = [
  // ── Warning signs (red triangle) ──
  { id: "warn-crossroads", kind: "warning", name: "Crossroads ahead", meaning: "Warns of a crossroads junction ahead where traffic may cross your path." },
  { id: "warn-bend-right", kind: "warning", name: "Bend to the right", meaning: "Sharp bend to the right ahead — reduce speed before the bend." },
  { id: "warn-roundabout", kind: "warning", name: "Roundabout ahead", meaning: "A roundabout is ahead. Be ready to give way to traffic from the right." },
  { id: "warn-children", kind: "warning", name: "Children / school crossing patrol", meaning: "Watch for children, e.g. near a school. Be ready to stop." },
  { id: "warn-slippery", kind: "warning", name: "Slippery road", meaning: "Road may be slippery — reduce speed and avoid harsh braking." },
  { id: "warn-tunnel", kind: "warning", name: "Tunnel ahead", meaning: "A tunnel is ahead. Switch on dipped headlights and keep your distance." },
  { id: "warn-pedestrians", kind: "warning", name: "Pedestrians in road ahead", meaning: "Be aware of pedestrians who may be in the carriageway ahead." },
  { id: "warn-traffic-signals", kind: "warning", name: "Traffic signals ahead", meaning: "Traffic light signals are ahead — be ready to stop." },
  { id: "warn-two-way", kind: "warning", name: "Two-way traffic ahead", meaning: "Two-way traffic crosses a one-way road, or returns to two-way ahead." },

  // ── Regulatory — prohibitive (red circle) ──
  { id: "reg-no-entry", kind: "regulatory", name: "No entry", meaning: "No entry for vehicular traffic — you must not pass this sign." },
  { id: "reg-stop", kind: "regulatory", name: "Stop", meaning: "Octagonal STOP sign: you must stop completely and give way at the line." },
  { id: "reg-give-way", kind: "regulatory", name: "Give way", meaning: "Give way to traffic on the major road. Stop if necessary." },
  { id: "reg-no-overtaking", kind: "regulatory", name: "No overtaking", meaning: "Overtaking is not permitted until the end-of-restriction sign." },
  { id: "reg-no-uturn", kind: "regulatory", name: "No U-turns", meaning: "You must not make a U-turn at this point." },
  { id: "reg-30", kind: "regulatory", name: "Maximum speed 30 mph", meaning: "Mandatory maximum speed limit of 30 mph applies." },
  { id: "reg-national", kind: "regulatory", name: "National speed limit applies", meaning: "The national speed limit applies (e.g. 60 mph single / 70 mph dual carriageway for cars)." },
  { id: "reg-no-stopping", kind: "regulatory", name: "No stopping (clearway)", meaning: "You must not stop on the main carriageway, even to pick up or set down." },

  // ── Regulatory — mandatory (blue circle) ──
  { id: "mand-turn-left", kind: "regulatory", name: "Turn left ahead", meaning: "Blue circle: positive instruction — you must turn left ahead." },
  { id: "mand-ahead-only", kind: "regulatory", name: "Ahead only", meaning: "You must proceed straight ahead." },
  { id: "mand-keep-left", kind: "regulatory", name: "Keep left", meaning: "Pass to the left of the sign / island." },
  { id: "mand-mini-roundabout", kind: "regulatory", name: "Mini-roundabout", meaning: "Mini-roundabout — give way to traffic from your right." },

  // ── Information / direction (rectangles) ──
  { id: "info-motorway", kind: "information", name: "Motorway sign (blue)", meaning: "Directions on motorways use white text on a blue background." },
  { id: "info-primary", kind: "direction", name: "Primary route (green)", meaning: "Directions on primary routes use white text on a green background." },
  { id: "info-local", kind: "direction", name: "Local/minor route (white)", meaning: "Directions on non-primary routes use black text on a white background." },
  { id: "info-parking", kind: "information", name: "Parking", meaning: "Indicates a car park or where parking is permitted." },
  { id: "info-hospital", kind: "information", name: "Hospital ahead", meaning: "Indicates a hospital ahead with A&E facilities (where shown)." },
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
