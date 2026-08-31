/** In-flow Lab 3 schedule rail — open width (304–320px). */
export const SCHEDULE_RAIL_LAB3_WIDTH_PX = 312;

/** Single motion event for rail reveal + canvas displacement. */
export const LAB3_RAIL_TRANSITION_S = 0.26;

/** Relay entrance cubic from the design code. */
export const LAB3_RAIL_EASE = [0.34, 1.06, 0.64, 1] as const;

export function lab3RailTransition(reduceMotion: boolean) {
  return reduceMotion
    ? { duration: 0 }
    : { duration: LAB3_RAIL_TRANSITION_S, ease: LAB3_RAIL_EASE };
}

export const LAB3_COMPACT_DAY_PX = 28;
export const LAB3_ART_DAY_PX = 96;
export const LAB3_TEXT_DAY_PX = 56;

export const LAB3_ARTWORK_FETCH_LIMIT = 8;
