// Pure functions only: nothing here reads or writes disk, env, network or logs.

const MAX_SECONDS = 60 * 60 * 3;
const MAX_STROKES = 100000;
const MAX_COLORS = 64;
// Colors end up inside the model prompt, so only hex codes or short plain color names
// are accepted. Free text here would be a way to smuggle instructions to the model.
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/;

/**
 * Validates and normalizes canvas telemetry coming from the client.
 * Returns { ok: true, metrics } or { ok: false, error }.
 */
export function parseMetrics(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "canvasMetrics must be an object" };
  }
  const { durationSeconds, strokeCount, shapeDiversityScore, primaryColors } = input;

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > MAX_SECONDS) {
    return { ok: false, error: "durationSeconds must be a number from 0 to 10800" };
  }
  if (!Number.isInteger(strokeCount) || strokeCount < 0 || strokeCount > MAX_STROKES) {
    return { ok: false, error: "strokeCount must be a whole number from 0 to 100000" };
  }
  if (!Number.isFinite(shapeDiversityScore) || shapeDiversityScore < 0 || shapeDiversityScore > 1) {
    return { ok: false, error: "shapeDiversityScore must be a number from 0 to 1" };
  }
  if (
    !Array.isArray(primaryColors) ||
    primaryColors.length > MAX_COLORS ||
    primaryColors.some((color) => typeof color !== "string" || !COLOR_PATTERN.test(color))
  ) {
    return { ok: false, error: "primaryColors must be hex codes or plain color names" };
  }

  return {
    ok: true,
    metrics: { durationSeconds, strokeCount, shapeDiversityScore, primaryColors: [...primaryColors] },
  };
}

/**
 * Picks a key of `pedagogyData`. Rules are checked in this order and the first match wins:
 *
 *   delayed_gratification_and_grit   durationSeconds > 120 OR strokeCount > 150
 *   spatial_logic_and_systemic_framing   shapeDiversityScore > 0.75
 *   resourceful_problem_solving      primaryColors.length <= 2 AND strokeCount > 30
 *   emotional_regulation_and_agency  strokeCount / durationSeconds > 3.0 (skipped at 0 seconds)
 *
 * Anything else gets `general_encouragement`.
 */
export function evaluateMetrics(metrics) {
  const { durationSeconds, strokeCount, shapeDiversityScore, primaryColors } = metrics;

  if (durationSeconds > 120 || strokeCount > 150) return "delayed_gratification_and_grit";
  if (shapeDiversityScore > 0.75) return "spatial_logic_and_systemic_framing";
  if (primaryColors.length <= 2 && strokeCount > 30) return "resourceful_problem_solving";
  if (durationSeconds > 0 && strokeCount / durationSeconds > 3.0) return "emotional_regulation_and_agency";
  return "general_encouragement";
}
