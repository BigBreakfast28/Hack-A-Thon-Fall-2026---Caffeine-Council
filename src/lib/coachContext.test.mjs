import test from "node:test";
import assert from "node:assert/strict";
import { parseRequest } from "../../server/muse.js";
import {
  AUTO_IDLE_MS,
  AUTO_MIN_NEW_STROKES,
  BLANK_PAGE_NUDGE_MS,
  CONTINUOUS_CHECKIN_MS,
  MIN_ATTEMPT_GAP_MS,
  autoCheckInDue,
  blankPageNudgeDue,
  buildMetrics,
  lessonContext,
} from "./coachContext.ts";

const ready = {
  unlocked: true,
  pending: false,
  drawingNow: false,
  newStrokes: AUTO_MIN_NEW_STROKES,
  idleMs: AUTO_IDLE_MS,
  msSinceLastSend: 1000,
  msSinceLastAttempt: 60_000,
};

test("lessonContext keeps plain titles and drops anything the server would reject", () => {
  assert.deepEqual(lessonContext("Cozy room", "Let's find the room"), { title: "Cozy room", step: "Let's find the room" });
  assert.deepEqual(lessonContext("  Fox ", " Add the ears! "), { title: "Fox", step: "Add the ears!" });
  for (const bad of ["Step 1: the head", "Draw a fox \u{1F98A}", "Say \"hi\"", "", "   ", "a".repeat(61), "line\nbreak", "<b>bold</b>"]) {
    assert.equal(lessonContext("Cozy room", bad), undefined, JSON.stringify(bad));
    assert.equal(lessonContext(bad, "Fine step"), undefined, JSON.stringify(bad));
  }
  // Whatever it keeps, the real server accepts.
  const kept = lessonContext("Little train", "Add the wheels");
  assert.equal(parseRequest({ canvasMetrics: { durationSeconds: 1, strokeCount: 1 }, lesson: kept }).ok, true);
});

test("a check-in is due after a pause with enough new strokes, and not before", () => {
  assert.equal(autoCheckInDue(ready), true);
  assert.equal(autoCheckInDue({ ...ready, idleMs: AUTO_IDLE_MS - 1 }), false);
  assert.equal(autoCheckInDue({ ...ready, newStrokes: AUTO_MIN_NEW_STROKES - 1 }), false);
});

test("a check-in never happens without a ticket, over a request in flight, or mid-stroke", () => {
  assert.equal(autoCheckInDue({ ...ready, unlocked: false }), false, "no unprompted 'ask a grown-up' message");
  assert.equal(autoCheckInDue({ ...ready, pending: true }), false);
  assert.equal(autoCheckInDue({ ...ready, drawingNow: true, idleMs: 99_999, msSinceLastSend: 99_999 }), false);
});

test("a failing server is not hammered: after any attempt there is a minimum wait", () => {
  assert.equal(autoCheckInDue({ ...ready, msSinceLastAttempt: MIN_ATTEMPT_GAP_MS - 1 }), false);
  assert.equal(autoCheckInDue({ ...ready, msSinceLastAttempt: MIN_ATTEMPT_GAP_MS }), true);
  // Even a child who never pauses, with a long silence behind them, waits out the gap after a failure.
  const failed = { ...ready, idleMs: 0, msSinceLastSend: 10 * CONTINUOUS_CHECKIN_MS, msSinceLastAttempt: 1000 };
  assert.equal(autoCheckInDue(failed), false);
});

test("a child who never pauses still hears from Sunny after a while", () => {
  const busy = { ...ready, idleMs: 100, msSinceLastSend: CONTINUOUS_CHECKIN_MS - 1 };
  assert.equal(autoCheckInDue(busy), false);
  assert.equal(autoCheckInDue({ ...busy, msSinceLastSend: CONTINUOUS_CHECKIN_MS }), true);
  assert.equal(autoCheckInDue({ ...busy, msSinceLastSend: CONTINUOUS_CHECKIN_MS, newStrokes: 2 }), false, "but only if there is something new to talk about");
});

test("the blank-page nudge fires once, only on an empty page, after the wait", () => {
  const empty = { unlocked: true, pending: false, strokeCount: 0, msOnPage: BLANK_PAGE_NUDGE_MS, alreadyNudged: false };
  assert.equal(blankPageNudgeDue(empty), true);
  assert.equal(blankPageNudgeDue({ ...empty, msOnPage: BLANK_PAGE_NUDGE_MS - 1 }), false);
  assert.equal(blankPageNudgeDue({ ...empty, strokeCount: 1 }), false);
  assert.equal(blankPageNudgeDue({ ...empty, alreadyNudged: true }), false);
  assert.equal(blankPageNudgeDue({ ...empty, unlocked: false }), false);
  assert.equal(blankPageNudgeDue({ ...empty, pending: true }), false);
});

test("buildMetrics adds time on the page, and step or rule counts only when they exist", () => {
  const snapshot = { durationSeconds: 40, strokeCount: 12, shapeDiversityScore: 0.5, primaryColors: ["#E97962"] };
  assert.deepEqual(buildMetrics(snapshot, { elapsedSeconds: 70.4 }), { ...snapshot, elapsedSeconds: 70 });
  const both = buildMetrics(snapshot, { elapsedSeconds: 70, step: { expected: 4, drawn: 3, ready: true }, rule: { strokes: 6, followed: 5 } });
  assert.deepEqual([both.stepShapesExpected, both.stepShapesDrawn, both.ruleStrokes, both.ruleFollowed], [4, 3, 6, 5]);
  const none = buildMetrics(snapshot, { elapsedSeconds: 1, step: { expected: 0, drawn: 0, ready: false }, rule: { strokes: 0, followed: 0 } });
  assert.equal("stepShapesExpected" in none, false);
  assert.equal("ruleStrokes" in none, false);
});

test("buildMetrics works on an empty page and always clamps to what the server accepts", () => {
  const blank = buildMetrics(null, { elapsedSeconds: 50 });
  assert.deepEqual(blank, { durationSeconds: 0, strokeCount: 0, primaryColors: [], elapsedSeconds: 50 });
  const wild = buildMetrics({ durationSeconds: 5, strokeCount: 5, primaryColors: [] }, {
    elapsedSeconds: 9e9,
    step: { expected: 4, drawn: 9, ready: true },
    rule: { strokes: 3, followed: 8 },
  });
  assert.equal(wild.elapsedSeconds, 10800);
  assert.equal(wild.stepShapesDrawn, 4);
  assert.equal(wild.ruleFollowed, 3);
  for (const metrics of [blank, wild, buildMetrics(null, { elapsedSeconds: -5 })]) {
    const parsed = parseRequest({ canvasMetrics: metrics });
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
  }
});

test("the blank-page request really reaches the blank-page rule on the server", async () => {
  const { evaluateMetrics } = await import("../../server/evaluateMetrics.js");
  const parsed = parseRequest({ canvasMetrics: buildMetrics(null, { elapsedSeconds: BLANK_PAGE_NUDGE_MS / 1000 + 1 }) });
  assert.equal(parsed.ok, true);
  assert.equal(evaluateMetrics(parsed.metrics, parsed.mode), "constraint_challenge");
  const early = parseRequest({ canvasMetrics: buildMetrics(null, { elapsedSeconds: 10 }) });
  assert.equal(evaluateMetrics(early.metrics, early.mode), "general_encouragement");
});
