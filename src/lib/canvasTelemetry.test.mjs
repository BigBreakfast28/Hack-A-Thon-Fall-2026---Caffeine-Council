// Run with: npm run test:client   (Node strips the TypeScript types on import)
import test from "node:test";
import assert from "node:assert/strict";
import { classifyStroke, createStrokeTracker, shapeDiversity, STROKE_KINDS } from "./canvasTelemetry.ts";
import { evaluateMetrics } from "../../server/evaluateMetrics.js";
import { parseRequest } from "../../server/muse.js";

const line = (n = 20, step = 10) => Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0 }));
const circle = (n = 40, r = 40) =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: r * Math.cos((2 * Math.PI * i) / n), y: r * Math.sin((2 * Math.PI * i) / n) }));
const zigzag = () => Array.from({ length: 9 }, (_, i) => ({ x: i * 12, y: i % 2 === 0 ? 0 : 30 }));
const arc = () => Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 90 * Math.sin((Math.PI * i) / 19) }));

test("classifies the basic stroke shapes", () => {
  assert.equal(classifyStroke([{ x: 5, y: 5 }]), "dot");
  assert.equal(classifyStroke([{ x: 5, y: 5 }, { x: 7, y: 6 }]), "dot");
  assert.equal(classifyStroke(line()), "line");
  assert.equal(classifyStroke(circle()), "loop");
  assert.equal(classifyStroke(zigzag()), "zigzag");
  assert.equal(classifyStroke(arc()), "curve");
});

test("shape diversity is 0 with few strokes, near 0 when alike, 1 when evenly mixed", () => {
  const counts = (overrides) => ({ dot: 0, line: 0, loop: 0, zigzag: 0, curve: 0, ...overrides });
  assert.equal(shapeDiversity(counts({ line: 4 })), 0);
  assert.equal(shapeDiversity(counts({ line: 20 })), 0);
  assert.equal(shapeDiversity(counts({ dot: 2, line: 2, loop: 2, zigzag: 2, curve: 2 })), 1);
  const mixed = shapeDiversity(counts({ line: 6, loop: 2, curve: 2 }));
  assert.ok(mixed > 0.4 && mixed < 0.75, String(mixed));
});

function draw(tracker, points, color, startMs, endMs) {
  tracker.beginStroke(points[0].x, points[0].y, color, startMs);
  for (const p of points.slice(1)) tracker.addPoint(p.x, p.y);
  tracker.endStroke(endMs);
}

test("snapshot is null until something is drawn and resets cleanly", () => {
  const tracker = createStrokeTracker();
  assert.equal(tracker.snapshot(), null);
  draw(tracker, line(), "#E97962", 0, 1000);
  assert.equal(tracker.snapshot().strokeCount, 1);
  tracker.reset();
  assert.equal(tracker.snapshot(), null);
  assert.equal(tracker.strokeCount(), 0);
});

test("counts strokes and reports only colors that make up at least 10% of strokes", () => {
  const tracker = createStrokeTracker();
  let t = 0;
  for (let i = 0; i < 18; i++) draw(tracker, line(), "#E97962", (t += 500), (t += 500));
  for (let i = 0; i < 10; i++) draw(tracker, arc(), "#6F9FC6", (t += 500), (t += 500));
  draw(tracker, line(), "#755E8B", (t += 500), (t += 500)); // 1 of 29 strokes: an accident, not a main color
  const snapshot = tracker.snapshot();
  assert.equal(snapshot.strokeCount, 29);
  assert.deepEqual(snapshot.primaryColors, ["#E97962", "#6F9FC6"]);
});

test("a lone color is still reported even below the 10% line", () => {
  const tracker = createStrokeTracker();
  draw(tracker, line(), "#E97962", 0, 500);
  assert.deepEqual(tracker.snapshot().primaryColors, ["#E97962"]);
});

test("duration counts active drawing time and ignores long pauses", () => {
  const tracker = createStrokeTracker();
  draw(tracker, line(), "#E97962", 0, 2000); // 2 s of drawing
  draw(tracker, line(), "#E97962", 62000, 64000); // 60 s pause (capped at 5 s) then 2 s of drawing
  assert.equal(tracker.snapshot().durationSeconds, 9);
});

test("coordinates are not kept after a stroke ends", () => {
  const tracker = createStrokeTracker();
  draw(tracker, circle(), "#E97962", 0, 1000);
  const keys = JSON.stringify(Object.keys(tracker));
  assert.doesNotMatch(keys, /points|path|coords/i);
  assert.deepEqual(Object.keys(tracker.snapshot()).sort(), ["durationSeconds", "primaryColors", "shapeDiversityScore", "strokeCount"]);
});

test("contract: tracker output passes the server's validation and picks the expected module", () => {
  // A busy, fast two-color session is ordinary: speed, stroke volume and palette no longer pick a module.
  const tracker = createStrokeTracker();
  let t = 0;
  for (let i = 0; i < 160; i++) draw(tracker, i % 2 ? line() : arc(), i % 3 ? "#E97962" : "#6F9FC6", (t += 200), (t += 200));
  const parsed = parseRequest({ canvasMetrics: tracker.snapshot(), history: [] });
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(evaluateMetrics(parsed.metrics), "general_encouragement");

  // A short two-color session is ordinary too.
  const small = createStrokeTracker();
  t = 0;
  for (let i = 0; i < 35; i++) draw(small, i % 2 ? line() : arc(), i % 2 ? "#E97962" : "#6F9FC6", (t += 1500), (t += 1500));
  const smallParsed = parseRequest({ canvasMetrics: small.snapshot(), history: [] });
  assert.equal(smallParsed.ok, true, JSON.stringify(smallParsed));
  assert.equal(evaluateMetrics(smallParsed.metrics), "general_encouragement");

  // More than 10 minutes of active drawing time earns specific feedback and a break offer.
  const long = createStrokeTracker();
  t = 0;
  for (let i = 0; i < 70; i++) draw(long, line(), "#E97962", (t += 5000), (t += 5000));
  const longParsed = parseRequest({ canvasMetrics: long.snapshot(), history: [] });
  assert.equal(longParsed.ok, true, JSON.stringify(longParsed));
  assert.ok(longParsed.metrics.durationSeconds > 600, String(longParsed.metrics.durationSeconds));
  assert.equal(evaluateMetrics(longParsed.metrics), "process_feedback");

  // What the child chooses wins, and the mode is validated by the same parser.
  const chosen = parseRequest({ canvasMetrics: tracker.snapshot(), coachingMode: "cheer", history: [] });
  assert.equal(chosen.ok, true, JSON.stringify(chosen));
  assert.equal(evaluateMetrics(chosen.metrics, chosen.mode), "autonomy_support");
});

test("the blank-page rule cannot fire from this tracker: each pause is capped at 5 s, so 5 strokes show at most 45 s", () => {
  const tracker = createStrokeTracker();
  let t = 0;
  for (let i = 0; i < 5; i++) draw(tracker, line(), "#E97962", (t += 60000), (t += 60000));
  const { durationSeconds, strokeCount } = tracker.snapshot();
  assert.equal(strokeCount, 5);
  assert.ok(durationSeconds <= 45, String(durationSeconds));
  // The child can still ask for a starting challenge by choosing it.
  assert.equal(evaluateMetrics(tracker.snapshot(), "challenge"), "constraint_challenge");
});

test("every kind is reachable", () => {
  assert.deepEqual([...STROKE_KINDS].sort(), ["curve", "dot", "line", "loop", "zigzag"]);
});
