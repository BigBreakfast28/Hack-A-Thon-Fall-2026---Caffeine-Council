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
const MAX_STEP_SHAPES = 12;
// Colors end up inside the model prompt, so only hex codes or short plain color names
// are accepted. Free text here would be a way to smuggle instructions to the model.
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/;

export const LONG_SESSION_SECONDS = 600; // offer a break and specific feedback after about 10 minutes
export const BLANK_CANVAS_MAX_STROKES = 5; // an open page is hard to start...
export const BLANK_CANVAS_AFTER_SECONDS = 45; // ...so after this long, offer a starting challenge

// What the child can ask for. The client shows these as buttons.
export const COACHING_MODES = ["challenge", "idea", "finish", "cheer", "rule", "add"];
export const MODE_TO_MODULE = {
  challenge: "constraint_challenge", // "give me a challenge"
  idea: "problem_finding", // "help me think of something"
  finish: "process_feedback", // "help me finish"
  cheer: "autonomy_support", // "just cheer me on"
  rule: "rule_playing", // "try my own rule" (needs a childRule from the fixed menu)
  add: "elaboration", // "help me add to my picture"
};
export const DEFAULT_MODULE = "general_encouragement";

/**
 * Validates and normalizes canvas statistics coming from the client.
 * `durationSeconds` and `strokeCount` are required. `primaryColors` is optional.
 * `elapsedSeconds` is optional wall-clock time since the child started (pauses included). Only
 * the blank-page rule reads it, because active drawing time can never show a long idle wait.
 * `shapeDiversityScore` is accepted if sent (0 to 1) but is no longer used for anything.
 * Returns { ok: true, metrics } or { ok: false, error }.
 */
export function parseMetrics(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "canvasMetrics must be an object" };
  }
  const {
    durationSeconds,
    strokeCount,
    shapeDiversityScore,
    elapsedSeconds,
    stepShapesExpected,
    stepShapesDrawn,
    ruleStrokes,
    ruleFollowed,
    primaryColors = [],
  } = input;

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
    elapsedSeconds !== undefined &&
    (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > MAX_SECONDS)
  ) {
    return { ok: false, error: "elapsedSeconds must be a number from 0 to 10800" };
  }
  if (
    !Array.isArray(primaryColors) ||
    primaryColors.length > MAX_COLORS ||
    primaryColors.some((color) => typeof color !== "string" || !COLOR_PATTERN.test(color))
  ) {
    return { ok: false, error: "primaryColors must be hex codes or plain color names" };
  }

  // Optional counts the app works out on the device by comparing the child's strokes with the
  // lesson step or with their own rule. Whole numbers only, each pair together, never above
  // its total. They carry no drawing data.
  const countOk = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  const step = stepShapesExpected !== undefined || stepShapesDrawn !== undefined;
  if (step && !(countOk(stepShapesExpected, MAX_STEP_SHAPES) && countOk(stepShapesDrawn, stepShapesExpected))) {
    return { ok: false, error: `stepShapesExpected and stepShapesDrawn must be whole numbers, drawn at most expected, expected at most ${MAX_STEP_SHAPES}` };
  }
  const rule = ruleStrokes !== undefined || ruleFollowed !== undefined;
  if (rule && !(countOk(ruleStrokes, MAX_STROKES) && countOk(ruleFollowed, ruleStrokes))) {
    return { ok: false, error: "ruleStrokes and ruleFollowed must be whole numbers, followed at most strokes" };
  }

  const metrics = { durationSeconds, strokeCount, primaryColors: [...primaryColors] };
  if (elapsedSeconds !== undefined) metrics.elapsedSeconds = elapsedSeconds;
  if (step) Object.assign(metrics, { stepShapesExpected, stepShapesDrawn });
  if (rule) Object.assign(metrics, { ruleStrokes, ruleFollowed });
  return { ok: true, metrics };
}

/** The child's own choice of help. Absent is fine; anything else must be a known mode. */
export function parseCoachingMode(input) {
  if (input === undefined || input === null) return { ok: true, mode: null };
  if (typeof input === "string" && COACHING_MODES.includes(input)) return { ok: true, mode: input };
  return { ok: false, error: `coachingMode must be one of: ${COACHING_MODES.join(", ")}` };
}

/**
 * Time spent on the page for the blank-page rule: the larger of active drawing time and the
 * optional wall-clock `elapsedSeconds`. With no `elapsedSeconds` it is just `durationSeconds`.
 */
export function timeOnPageSeconds(metrics) {
  return Math.max(metrics.durationSeconds, metrics.elapsedSeconds ?? 0);
}

/**
 * The routing matrix as data, in order. First match wins. This one list is what both
 * `evaluateMetrics` and `explainRoute` read, so the explanation cannot drift from the behavior.
 *
 * Speed, number of colors and shape variety are deliberately not used.
 */
export const ROUTING_RULES = [
  {
    id: "child_choice",
    when: "the child chose a kind of help",
    test: (_metrics, mode) => Boolean(mode),
    moduleFor: (mode) => MODE_TO_MODULE[mode],
  },
  {
    id: "long_session",
    when: `active drawing time > ${LONG_SESSION_SECONDS} s`,
    test: (metrics) => metrics.durationSeconds > LONG_SESSION_SECONDS,
    moduleFor: () => "process_feedback", // specific feedback and a break offer
  },
  {
    id: "blank_page",
    when: `<= ${BLANK_CANVAS_MAX_STROKES} strokes and time on page > ${BLANK_CANVAS_AFTER_SECONDS} s`,
    test: (metrics) =>
      metrics.strokeCount <= BLANK_CANVAS_MAX_STROKES && timeOnPageSeconds(metrics) > BLANK_CANVAS_AFTER_SECONDS,
    moduleFor: () => "constraint_challenge", // help getting started
  },
  {
    id: "default",
    when: "nothing above matched",
    test: () => true,
    moduleFor: () => DEFAULT_MODULE,
  },
];

/** Picks a key of `pedagogyData`: the module of the first rule in ROUTING_RULES that matches. */
export function evaluateMetrics(metrics, mode = null) {
  const rule = ROUTING_RULES.find((candidate) => candidate.test(metrics, mode));
  return rule.moduleFor(mode);
}

/**
 * Shows the decision: every rule with whether it matched, and which one decided. Rules after
 * the decisive one are still evaluated so you can see what would have applied otherwise.
 * Pure and derived from ROUTING_RULES.
 */
export function explainRoute(metrics, mode = null) {
  const rules = ROUTING_RULES.map((rule) => ({
    id: rule.id,
    when: rule.when,
    matched: Boolean(rule.test(metrics, mode)),
    module: rule.id === "child_choice" && !mode ? null : rule.moduleFor(mode),
  }));
  const decisive = rules.find((rule) => rule.matched);
  return {
    chosen: decisive.module,
    decidedBy: decisive.id,
    timeOnPageSeconds: timeOnPageSeconds(metrics),
    rules: rules.map((rule) => ({ ...rule, decisive: rule === decisive })),
  };
}
