import type { StrokeKind, StrokeSummary } from "./canvasTelemetry";

// What the stroke classifier is for. It sorts every finished stroke into dot, line, loop, zigzag
// or curve. Those same five words are the fixed menu of the child's own rule ("Only zigzags")
// and the kinds a lesson step's shapes are drawn with, so two questions can be answered on the
// device, with no drawing data leaving it:
//   1. Did the child draw the shapes this lesson step asks for?   -> stepProgress
//   2. Did the child's strokes follow the rule they chose?        -> ruleAdherence
// Both are deliberately coarse. They compare the kind and rough size of strokes, not where on
// the page they are, and children draw messily. They are for gentle nudges and for counts the
// coach can mention. They are never a grade, and they never say a drawing is wrong.

export const STROKE_KIND_IDS: readonly StrokeKind[] = ["dot", "line", "loop", "zigzag", "curve"];
const MIN_REAL_STROKE_PX = 12;
const MAX_SHAPES_PER_STEP = 12;
// A step counts as done when this share of its shapes has a matching stroke. Lenient on purpose.
const READY_SHARE = 0.75;

/** For each shape in a step, the stroke kinds that could draw it. The server works this out. */
export type StepExpects = StrokeKind[][];

/** Accepts the server's `expects` field only if every shape lists at least one known kind. */
export function cleanExpects(input: unknown): StepExpects | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const out: StepExpects = input.slice(0, MAX_SHAPES_PER_STEP).map((accepts) =>
    Array.isArray(accepts) ? accepts.filter((kind): kind is StrokeKind => STROKE_KIND_IDS.includes(kind)) : [],
  );
  return out.every((accepts) => accepts.length > 0) ? out : undefined;
}

export type StepProgress = { expected: number; drawn: number; ready: boolean };

/**
 * How many of a step's shapes have a stroke of an accepted kind. Each stroke is used for at most
 * one shape, and the pickiest shapes choose first so a loop is not spent on a shape that would
 * also have taken a line. Strokes should be the ones drawn since the step began.
 */
export function stepProgress(strokes: readonly StrokeSummary[], expects: StepExpects): StepProgress {
  const expected = expects.length;
  const used = new Set<number>();
  const pickiestFirst = expects.map((accepts) => accepts).sort((a, b) => a.length - b.length);
  let drawn = 0;
  for (const accepts of pickiestFirst) {
    const at = strokes.findIndex(
      (stroke, i) => !used.has(i) && accepts.includes(stroke.kind) && (stroke.kind === "dot" || stroke.length >= MIN_REAL_STROKE_PX),
    );
    if (at >= 0) {
      used.add(at);
      drawn += 1;
    }
  }
  return { expected, drawn, ready: expected > 0 && drawn >= Math.max(1, Math.ceil(expected * READY_SHARE)) };
}

// The child's own rule: ids from src/lib/ruleOptions.ts.
export type ChildRuleIds = { mark: string; limit: string };

const MARK_KIND: Record<string, StrokeKind> = { lines: "line", dots: "dot", curves: "curve", zigzags: "zigzag", loops: "loop" };
const SMALL_FRACTION = 0.12; // a small mark is at most this share of the shorter side of the page
const BIG_FRACTION = 0.25; // a big mark is at least this share

/**
 * How many of the strokes drawn since the rule was chosen follow it. `canvasMin` is the shorter
 * side of the drawing page in pixels. "Without lifting my hand" can only be followed by the first
 * stroke, because any later stroke means the hand was lifted.
 */
export function ruleAdherence(
  strokes: readonly StrokeSummary[],
  rule: ChildRuleIds,
  canvasMin: number,
): { strokes: number; followed: number } {
  const kind = MARK_KIND[rule.mark];
  const firstColor = strokes[0]?.color;
  let followed = 0;
  strokes.forEach((stroke, i) => {
    if (kind && stroke.kind !== kind) return;
    const size = Math.max(stroke.width, stroke.height);
    let ok = true;
    if (rule.limit === "no-lifting") ok = i === 0;
    else if (rule.limit === "one-color") ok = stroke.color === firstColor;
    else if (rule.limit === "small-only") ok = size <= SMALL_FRACTION * canvasMin;
    else if (rule.limit === "big-only") ok = size >= BIG_FRACTION * canvasMin;
    if (ok) followed += 1;
  });
  return { strokes: strokes.length, followed };
}
