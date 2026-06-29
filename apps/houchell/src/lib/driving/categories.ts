import type { Category } from "./types";

/* The 14 official topic areas of the DVSA car theory test. */
export const CATEGORIES: Category[] = [
  { id: "alertness", label: "Alertness", blurb: "Concentration, anticipation, observation and avoiding distraction." },
  { id: "attitude", label: "Attitude", blurb: "Consideration for others, following distance, priority and patience." },
  { id: "safety-and-your-vehicle", label: "Safety and your vehicle", blurb: "Defects, maintenance, security and reducing your impact." },
  { id: "safety-margins", label: "Safety margins", blurb: "Stopping distances, separation gaps and driving in poor conditions." },
  { id: "hazard-awareness", label: "Hazard awareness", blurb: "Spotting and reacting to developing hazards in good time." },
  { id: "vulnerable-road-users", label: "Vulnerable road users", blurb: "Pedestrians, cyclists, motorcyclists, horse riders and children." },
  { id: "other-types-of-vehicle", label: "Other types of vehicle", blurb: "Sharing the road with lorries, buses, trams and motorcycles." },
  { id: "vehicle-handling", label: "Vehicle handling", blurb: "Control in different weather, road surfaces and at night." },
  { id: "motorway-rules", label: "Motorway rules", blurb: "Joining, lane discipline, speed, breakdowns and smart motorways." },
  { id: "rules-of-the-road", label: "Rules of the road", blurb: "Speed limits, junctions, parking, overtaking and right of way." },
  { id: "road-and-traffic-signs", label: "Road and traffic signs", blurb: "Recognising signs, signals and road markings." },
  { id: "essential-documents", label: "Essential documents", blurb: "Licence, insurance, MOT, tax and learner requirements." },
  { id: "incidents-accidents-emergencies", label: "Incidents, accidents and emergencies", blurb: "First aid, breakdowns, warning others and reporting." },
  { id: "vehicle-loading", label: "Vehicle loading", blurb: "Carrying loads, passengers, towing and stability." },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label])
);
