// Pure functions only: nothing here reads or writes disk, env, network or logs.
//
// Design rule from the research review (RESEARCH.md): drawing statistics are a poor
// measure of a child's traits. Stroke speed tracks age and motor maturity, stroke counts
// depend on how strokes are segmented, and none of them measure grit, agency or ability.
// So the matrix works like this:
//   1. If the child chose a kind of help, use it. No inference.
//   2. Otherwise use only two pacing rules that do not label the child.
//   3. Otherwise a plain, encouraging default.
// The two thresholds below are placeholders to tune in a pilot, not validated cut-offs.

const MAX_SECONDS = 60 * 60 * 3;
const MAX_STROKES = 100000;
const MAX_COLORS = 64;
// Colors end up inside the model prompt, so only hex codes or short plain color names
// are accepted. Free text here would be a way to smuggle instructions to the model.
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/;

export const LONG_SESSION_SECONDS = 600; // offer a break and specific feedback after about 10 minutes
export const BLANK_CANVAS_MAX_STROKES = 5; // an open page is hard to start...
export const BLANK_CANVAS_AFTER_SECONDS = 45; // ...so after this long, offer a starting challenge

// What the child can ask for. The client shows these as buttons.
export const COACHING_MODES = ["challenge", "idea", "finish", "cheer"];
const MODE_TO_MODULE = {
  challenge: "constraint_challenge", // "give me a challenge"
  idea: "problem_finding", // "help me think of something"
  finish: "process_feedback", // "help me finish"
  cheer: "autonomy_support", // "just cheer me on"
};

/**
 * Validates and normalizes canvas statistics coming from the client.
 * `durationSeconds` and `strokeCount` are required. `primaryColors` is optional.
 * `shapeDiversityScore` is accepted if sent (0 to 1) but is no longer used for anything.
 * Returns { ok: true, metrics } or { ok: false, error }.
 */
export function parseMetrics(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "canvasMetrics must be an object" };
  }
  const { durationSeconds, strokeCount, shapeDiversityScore, primaryColors = [] } = input;

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > MAX_SECONDS) {
    return { ok: false, error: "durationSeconds must be a number from 0 to 10800" };
  }
  if (!Number.isInteger(strokeCount) || strokeCount < 0 || strokeCount > MAX_STROKES) {
    return { ok: false, error: "strokeCount must be a whole number from 0 to 100000" };
  }
  if (
    shapeDiversityScore !== undefined &&
    (!Number.isFinite(shapeDiversityScore) || shapeDiversityScore < 0 || shapeDiversityScore > 1)
  ) {
    return { ok: false, error: "shapeDiversityScore must be a number from 0 to 1" };
  }
  if (
    !Array.isArray(primaryColors) ||
    primaryColors.length > MAX_COLORS ||
    primaryColors.some((color) => typeof color !== "string" || !COLOR_PATTERN.test(color))
  ) {
    return { ok: false, error: "primaryColors must be hex codes or plain color names" };
  }

  return { ok: true, metrics: { durationSeconds, strokeCount, primaryColors: [...primaryColors] } };
}

/** The child's own choice of help. Absent is fine; anything else must be a known mode. */
export function parseCoachingMode(input) {
  if (input === undefined || input === null) return { ok: true, mode: null };
  if (typeof input === "string" && COACHING_MODES.includes(input)) return { ok: true, mode: input };
  return { ok: false, error: `coachingMode must be one of: ${COACHING_MODES.join(", ")}` };
}

/**
 * Picks a key of `pedagogyData`. First match wins:
 *
 *   1. The child chose a mode        -> the module for that mode
 *   2. durationSeconds > 600         -> process_feedback (specific feedback, offer a break)
 *   3. strokeCount <= 5 and
 *      durationSeconds > 45          -> constraint_challenge (help getting started)
 *   4. anything else                 -> general_encouragement
 *
 * Speed, number of colors and shape variety are deliberately not used.
 */
export function evaluateMetrics(metrics, mode = null) {
  if (mode) return MODE_TO_MODULE[mode];
  if (metrics.durationSeconds > LONG_SESSION_SECONDS) return "process_feedback";
  if (metrics.strokeCount <= BLANK_CANVAS_MAX_STROKES && metrics.durationSeconds > BLANK_CANVAS_AFTER_SECONDS) {
    return "constraint_challenge";
  }
  return "general_encouragement";
}
