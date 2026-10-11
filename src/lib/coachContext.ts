import type { CanvasMetrics } from "../hooks/useStatelessStream";
import type { StepProgress } from "./strokeCheck";

// Decisions the canvas makes about when and how to talk to Sunny. They are plain functions so
// they can be tested without a browser. Nothing here touches the network or any storage.

// A lesson title and step title go into the coach's prompt, so the server accepts only plain
// letters, numbers and . , ' ! ? & - up to 60 characters. Anything else would make the whole
// request fail, so it is left out and Sunny coaches without the lesson instead.
export const LESSON_TEXT_PATTERN = /^[\p{L}\p{N} .,'!?&-]{1,60}$/u;

export function lessonContext(lessonTitle: string, stepTitle: string): { title: string; step: string } | undefined {
  const title = lessonTitle.trim();
  const step = stepTitle.trim();
  return LESSON_TEXT_PATTERN.test(title) && LESSON_TEXT_PATTERN.test(step) ? { title, step } : undefined;
}

// When Sunny checks in by herself.
export const AUTO_IDLE_MS = 2500; // after the child pauses this long...
export const AUTO_MIN_NEW_STROKES = 6; // ...with at least this many new strokes since the last check-in
export const CONTINUOUS_CHECKIN_MS = 20_000; // a child who never pauses still hears from her this often
export const BLANK_PAGE_NUDGE_MS = 45_000; // a page still empty after this long gets a way to start
export const MIN_ATTEMPT_GAP_MS = 8_000; // after any attempt, passed or failed, wait this long: a down server is not hammered

export type CheckInState = {
  unlocked: boolean; // a grown-up has entered a ticket
  pending: boolean; // a request is already out
  drawingNow: boolean; // the pen is down
  newStrokes: number; // strokes since the last check-in that went through
  idleMs: number; // since the pen last moved
  msSinceLastSend: number; // since a check-in last went through
  msSinceLastAttempt: number; // since any check-in was tried, including one that failed
};

/** Never talks over a request in flight or a stroke in progress, and never without a ticket. */
export function autoCheckInDue(state: CheckInState): boolean {
  if (!state.unlocked || state.pending || state.drawingNow) return false;
  if (state.msSinceLastAttempt < MIN_ATTEMPT_GAP_MS) return false;
  if (state.newStrokes < AUTO_MIN_NEW_STROKES) return false;
  return state.idleMs >= AUTO_IDLE_MS || state.msSinceLastSend >= CONTINUOUS_CHECKIN_MS;
}

export function blankPageNudgeDue(state: {
  unlocked: boolean;
  pending: boolean;
  strokeCount: number;
  msOnPage: number;
  alreadyNudged: boolean;
}): boolean {
  return state.unlocked && !state.pending && !state.alreadyNudged && state.strokeCount === 0 && state.msOnPage >= BLANK_PAGE_NUDGE_MS;
}

const MAX_ELAPSED_SECONDS = 10_800;

/**
 * The numbers for one request. Starts from the tracker's snapshot (or an empty page), adds time on
 * the page, and adds the on-device step and rule counts only when they exist. Counts only: no
 * drawing data. The server checks all of it again.
 */
export function buildMetrics(
  snapshot: CanvasMetrics | null,
  extra: { elapsedSeconds: number; step?: StepProgress; rule?: { strokes: number; followed: number } },
): CanvasMetrics {
  const base: CanvasMetrics = snapshot ?? { durationSeconds: 0, strokeCount: 0, primaryColors: [] };
  const out: CanvasMetrics = {
    ...base,
    elapsedSeconds: Math.min(MAX_ELAPSED_SECONDS, Math.max(0, Math.round(extra.elapsedSeconds))),
  };
  if (extra.step && extra.step.expected > 0 && extra.step.expected <= 12) {
    out.stepShapesExpected = extra.step.expected;
    out.stepShapesDrawn = Math.min(extra.step.drawn, extra.step.expected);
  }
  if (extra.rule && extra.rule.strokes > 0) {
    out.ruleStrokes = extra.rule.strokes;
    out.ruleFollowed = Math.min(extra.rule.followed, extra.rule.strokes);
  }
  return out;
}
