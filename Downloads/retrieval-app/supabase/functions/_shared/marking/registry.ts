// Maps a subject's marker_profile (subjects.marker_profile, text) to the prompt
// overlay for each marker. Adding a subject = add an overlay file + one row here.
//
// The profile is resolved server-side from the DB (question/paper -> subject ->
// marker_profile) and is NEVER trusted from the client. Any unknown profile, or a
// resolution failure, falls back to DEFAULT_PROFILE so the behaviour is exactly
// today's science marking — there is no way for a bad/absent profile to break a
// mark, it just marks as science.

import { SCIENCE_RETRIEVAL_OVERLAY, SCIENCE_PAPER_OVERLAY } from "./overlays/science.ts";

export const DEFAULT_PROFILE = "science";

type MarkerKind = "retrieval" | "paper";

interface Overlays {
  retrieval: string;
  paper: string;
}

const OVERLAYS: Record<string, Overlays> = {
  science: { retrieval: SCIENCE_RETRIEVAL_OVERLAY, paper: SCIENCE_PAPER_OVERLAY },
};

// Return the overlay text for a (profile, kind). Unknown/empty profile -> default.
export function overlayFor(profile: string | null | undefined, kind: MarkerKind): string {
  const key = profile && OVERLAYS[profile] ? profile : DEFAULT_PROFILE;
  return OVERLAYS[key][kind];
}
