import test from "node:test";
import assert from "node:assert/strict";
import { createStrokeTracker } from "./canvasTelemetry.ts";
import { cleanExpects, ruleAdherence, stepProgress } from "./strokeCheck.ts";

const line = () => Array.from({ length: 12 }, (_, i) => ({ x: i * 12, y: 0 }));
const circle = () => Array.from({ length: 25 }, (_, i) => ({ x: 40 * Math.cos((2 * Math.PI * i) / 24), y: 40 * Math.sin((2 * Math.PI * i) / 24) }));
const zigzag = () => Array.from({ length: 9 }, (_, i) => ({ x: i * 12, y: i % 2 === 0 ? 0 : 30 }));
const arc = () => Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 90 * Math.sin((Math.PI * i) / 19) }));
const dot = () => [{ x: 5, y: 5 }];

let clock = 0;
function draw(tracker, points, color = "#E97962") {
  tracker.beginStroke(points[0].x, points[0].y, color, (clock += 500));
  for (const p of points.slice(1)) tracker.addPoint(p.x, p.y);
  tracker.endStroke((clock += 500));
}

test("the tracker keeps a summary per stroke with kind, size and color, and no coordinates", () => {
  const tracker = createStrokeTracker();
  draw(tracker, line());
  draw(tracker, circle(), "#6F9FC6");
  const [first, second] = tracker.summariesSince(0);
  assert.equal(first.kind, "line");
  assert.equal(second.kind, "loop");
  assert.equal(second.color, "#6F9FC6");
  assert.ok(first.width >= 130 && first.height === 0, JSON.stringify(first));
  assert.ok(second.width >= 70 && second.height >= 70, JSON.stringify(second));
  assert.ok(second.length > 200);
  assert.deepEqual(Object.keys(first).sort(), ["color", "endedAtMs", "height", "kind", "length", "width"]);
  assert.doesNotMatch(JSON.stringify(tracker.summariesSince(0)), /points|coords|"x"|"y"/i);
});

test("summariesSince counts from an absolute stroke number, returns copies, and reset clears them", () => {
  const tracker = createStrokeTracker();
  for (let i = 0; i < 5; i++) draw(tracker, line());
  assert.equal(tracker.summariesSince(3).length, 2);
  assert.equal(tracker.summariesSince(5).length, 0);
  tracker.summariesSince(0)[0].kind = "dot";
  assert.equal(tracker.summariesSince(0)[0].kind, "line", "callers cannot change the tracker's own list");
  tracker.reset();
  assert.equal(tracker.summariesSince(0).length, 0);
  draw(tracker, circle());
  assert.equal(tracker.summariesSince(0).length, 1);
});

test("old strokes fall out of the cap but stroke numbers stay absolute", () => {
  const tracker = createStrokeTracker();
  for (let i = 0; i < 1005; i++) draw(tracker, dot());
  assert.equal(tracker.strokeCount(), 1005);
  assert.equal(tracker.summariesSince(0).length, 1000);
  assert.equal(tracker.summariesSince(1003).length, 2, "the last two strokes, by absolute number");
});

test("stepProgress: a step is ready once most of its shapes have a stroke of an accepted kind", () => {
  // A step that asks for a round head, two eyes (small round or dots) and a mouth line.
  const expects = [["loop"], ["loop", "dot"], ["loop", "dot"], ["line", "curve", "zigzag"]];
  const tracker = createStrokeTracker();
  draw(tracker, circle());
  let progress = stepProgress(tracker.summariesSince(0), expects);
  assert.deepEqual(progress, { expected: 4, drawn: 1, ready: false });
  draw(tracker, dot());
  draw(tracker, dot());
  progress = stepProgress(tracker.summariesSince(0), expects);
  assert.deepEqual(progress, { expected: 4, drawn: 3, ready: true }, "3 of 4 is enough");
  draw(tracker, line());
  assert.equal(stepProgress(tracker.summariesSince(0), expects).drawn, 4);
});

test("stepProgress: one stroke is never counted for two shapes, and picky shapes choose first", () => {
  const expects = [["loop", "line"], ["loop"]];
  const tracker = createStrokeTracker();
  draw(tracker, line());
  draw(tracker, circle());
  assert.equal(stepProgress(tracker.summariesSince(0), expects).drawn, 2, "the loop goes to the loop-only shape");
  const one = createStrokeTracker();
  draw(one, circle());
  assert.equal(stepProgress(one.summariesSince(0), expects).drawn, 1, "a single loop cannot fill both");
});

test("stepProgress only looks at strokes drawn since the step began", () => {
  const tracker = createStrokeTracker();
  for (let i = 0; i < 3; i++) draw(tracker, circle());
  const stepStart = tracker.strokeCount();
  assert.equal(stepProgress(tracker.summariesSince(stepStart), [["loop"]]).drawn, 0);
  draw(tracker, circle());
  assert.equal(stepProgress(tracker.summariesSince(stepStart), [["loop"]]).drawn, 1);
});

test("stepProgress ignores scribbles that are too small, except for a step that accepts dots", () => {
  const tiny = [{ kind: "line", length: 5, width: 5, height: 0, color: "#000", endedAtMs: 1 }];
  assert.equal(stepProgress(tiny, [["line"]]).drawn, 0);
  const dots = [{ kind: "dot", length: 0, width: 0, height: 0, color: "#000", endedAtMs: 1 }];
  assert.equal(stepProgress(dots, [["loop", "dot"]]).drawn, 1);
  assert.equal(stepProgress(dots, [["loop"]]).drawn, 0);
});

test("cleanExpects accepts only well-formed lists of known kinds", () => {
  assert.deepEqual(cleanExpects([["loop"], ["line", "curve"]]), [["loop"], ["line", "curve"]]);
  assert.equal(cleanExpects(undefined), undefined);
  assert.equal(cleanExpects([]), undefined);
  assert.equal(cleanExpects([["loop"], []]), undefined);
  assert.equal(cleanExpects([["swirl"]]), undefined, "unknown kinds are dropped, leaving a shape with nothing to match");
  assert.deepEqual(cleanExpects([["loop", "swirl"]]), [["loop"]]);
  assert.equal(cleanExpects("loop"), undefined);
  assert.equal(cleanExpects(Array.from({ length: 30 }, () => ["loop"])).length, 12);
});

test("ruleAdherence: the mark decides which stroke kind counts", () => {
  const tracker = createStrokeTracker();
  draw(tracker, zigzag());
  draw(tracker, zigzag());
  draw(tracker, line());
  const strokes = tracker.summariesSince(0);
  assert.deepEqual(ruleAdherence(strokes, { mark: "zigzags", limit: "one-color" }, 600), { strokes: 3, followed: 2 });
  assert.deepEqual(ruleAdherence(strokes, { mark: "lines", limit: "one-color" }, 600), { strokes: 3, followed: 1 });
  assert.equal(ruleAdherence(strokes, { mark: "loops", limit: "one-color" }, 600).followed, 0);
});

test("ruleAdherence: one color, no lifting, small and big marks", () => {
  const tracker = createStrokeTracker();
  draw(tracker, line(), "#E97962");
  draw(tracker, line(), "#6F9FC6");
  draw(tracker, line(), "#E97962");
  const strokes = tracker.summariesSince(0);
  assert.equal(ruleAdherence(strokes, { mark: "lines", limit: "one-color" }, 600).followed, 2, "the first color is the rule's color");
  assert.equal(ruleAdherence(strokes, { mark: "lines", limit: "no-lifting" }, 600).followed, 1, "only the first stroke was without lifting");
  // each line is about 132 px wide
  assert.equal(ruleAdherence(strokes, { mark: "lines", limit: "small-only" }, 600).followed, 0, "132 px is not small on a 600 px page");
  assert.equal(ruleAdherence(strokes, { mark: "lines", limit: "small-only" }, 2000).followed, 3);
  assert.equal(ruleAdherence(strokes, { mark: "lines", limit: "big-only" }, 400).followed, 3, "132 px is big on a 400 px page");
  assert.equal(ruleAdherence(strokes, { mark: "lines", limit: "big-only" }, 1000).followed, 0);
});

test("ruleAdherence: no strokes, unknown ids and impossible combinations never throw", () => {
  assert.deepEqual(ruleAdherence([], { mark: "lines", limit: "one-color" }, 500), { strokes: 0, followed: 0 });
  const tracker = createStrokeTracker();
  draw(tracker, arc());
  const strokes = tracker.summariesSince(0);
  assert.deepEqual(ruleAdherence(strokes, { mark: "???", limit: "???" }, 500), { strokes: 1, followed: 1 });
  assert.equal(ruleAdherence(strokes, { mark: "dots", limit: "no-lifting" }, 500).followed, 0, "an arc is not a dot");
});
