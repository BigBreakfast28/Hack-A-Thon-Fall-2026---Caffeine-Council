import test from "node:test";
import assert from "node:assert/strict";
import { acceptedKinds, createLessonService } from "./lessons.js";
import { parseMetrics } from "./evaluateMetrics.js";
import { buildGeminiRequest, buildSystemInstruction, parseRequest, processMuse, telemetryText } from "./muse.js";
import { pedagogyData } from "./pedagogy.js";

const base = { durationSeconds: 60, strokeCount: 20, primaryColors: ["red"] };
const foxLesson = {
  steps: [
    { title: "Draw the head", copy: "Draw a big round head.", demo: "A round head.", shapes: [{ kind: "circle", cx: 100, cy: 70, r: 40 }] },
    { title: "Add the face", copy: "Two eyes and a nose.", demo: "Eyes and nose.", shapes: [{ kind: "circle", cx: 85, cy: 65, r: 3 }, { kind: "circle", cx: 115, cy: 65, r: 3 }, { kind: "line", x1: 100, y1: 75, x2: 100, y2: 85 }] },
  ],
};
const fakeAi = (answer) => ({ models: { generateContent: async () => ({ text: JSON.stringify(answer) }) } });

test("every lesson step carries which stroke kinds could draw each of its shapes, but not the raw shapes", async () => {
  const { status, body } = await createLessonService({ ai: fakeAi(foxLesson), model: "m" })("little-train");
  assert.equal(status, 200);
  assert.deepEqual(body.steps[0].expects, [["loop", "curve"]]);
  assert.deepEqual(body.steps[1].expects, [["loop", "dot", "curve"], ["loop", "dot", "curve"], ["line", "curve"]]);
  for (const step of body.steps) assert.equal(step.shapes, undefined, "raw shapes still stay on the server");
});

test("acceptedKinds covers every shape kind with only the five classifier words", () => {
  const five = new Set(["dot", "line", "loop", "zigzag", "curve"]);
  const shapes = [
    { kind: "circle", r: 30 }, { kind: "circle", r: 2 }, { kind: "ellipse", rx: 20, ry: 10 }, { kind: "ellipse", rx: 2, ry: 3 },
    { kind: "rect" }, { kind: "line" }, { kind: "polyline" }, { kind: "path" },
  ];
  for (const shape of shapes) {
    const kinds = acceptedKinds(shape);
    assert.ok(kinds.length > 0, shape.kind);
    assert.ok(kinds.every((kind) => five.has(kind)), shape.kind);
  }
  assert.ok(acceptedKinds({ kind: "circle", r: 2 }).includes("dot"), "a tiny round shape is a dot");
  assert.ok(!acceptedKinds({ kind: "circle", r: 30 }).includes("dot"));
});

test("step and rule counts are optional, validated whole numbers that come in pairs", () => {
  assert.deepEqual(parseMetrics(base).metrics, { ...base });
  const ok = parseMetrics({ ...base, stepShapesExpected: 4, stepShapesDrawn: 3, ruleStrokes: 6, ruleFollowed: 5 });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.metrics.stepShapesExpected, ok.metrics.stepShapesDrawn, ok.metrics.ruleStrokes, ok.metrics.ruleFollowed], [4, 3, 6, 5]);
  const bad = [
    { stepShapesExpected: 4 }, { stepShapesDrawn: 2 }, { stepShapesExpected: 3, stepShapesDrawn: 4 },
    { stepShapesExpected: 13, stepShapesDrawn: 1 }, { stepShapesExpected: -1, stepShapesDrawn: 0 }, { stepShapesExpected: 2.5, stepShapesDrawn: 1 },
    { stepShapesExpected: "4", stepShapesDrawn: "3" }, { ruleStrokes: 5 }, { ruleFollowed: 1 }, { ruleStrokes: 2, ruleFollowed: 3 },
    { ruleStrokes: 100001, ruleFollowed: 0 }, { ruleStrokes: NaN, ruleFollowed: 0 }, { ruleStrokes: null, ruleFollowed: null },
  ];
  for (const extra of bad) assert.equal(parseMetrics({ ...base, ...extra }).ok, false, JSON.stringify(extra));
  assert.equal(parseMetrics({ ...base, stepShapesExpected: 0, stepShapesDrawn: 0 }).ok, true);
});

test("the model is told the counts as plain numbers, and only when they exist", () => {
  assert.doesNotMatch(telemetryText(base, false), /lesson step|my own rule/);
  const text = telemetryText({ ...base, stepShapesExpected: 4, stepShapesDrawn: 3, ruleStrokes: 6, ruleFollowed: 5 }, true);
  assert.match(text, /^Drawing so far: 20 strokes in 60 seconds, main colors: red\./);
  assert.match(text, /For this lesson step, 3 of 4 shapes look drawn\./);
  assert.match(text, /5 of 6 strokes since I made my own rule follow it\./);
  assert.match(text, /A picture of my canvas is attached\.$/);
});

test("the progress instruction is added only when counts are sent, and says it is never a grade", () => {
  const plain = parseRequest({ canvasMetrics: base });
  assert.doesNotMatch(buildGeminiRequest("m", plain).config.systemInstruction, /rough counts/);
  const counted = parseRequest({ canvasMetrics: { ...base, stepShapesExpected: 4, stepShapesDrawn: 3 } });
  const text = buildGeminiRequest("m", counted).config.systemInstruction;
  assert.match(text, /rough counts, not a grade/);
  assert.match(text, /never say a drawing is wrong, incomplete or needs fixing/);
  assert.match(text, /safety rules win/);
  assert.match(buildSystemInstruction(pedagogyData.general_encouragement, false, { hasProgress: true }), /rough counts/);
});

test("a full request with counts reaches the model with the numbers and nothing else new", async () => {
  const calls = [];
  const ai = { models: { generateContent: async (request) => (calls.push(request), { text: JSON.stringify({ reply: "You are nearly there. Ready for the next step?", seen: "" }) }) } };
  const payload = { canvasMetrics: { ...base, stepShapesExpected: 3, stepShapesDrawn: 3 }, lesson: { title: "Friendly fox", step: "Add the face" } };
  const { status } = await processMuse(payload, { ai, model: "m", verifyAccess: async () => ({ ok: true }) });
  assert.equal(status, 200);
  assert.match(calls[0].contents.at(-1).parts[0].text, /3 of 3 shapes look drawn/);
  assert.match(calls[0].config.systemInstruction, /Friendly fox/);
  assert.deepEqual(Object.keys(calls[0].config).sort(), ["responseMimeType", "responseSchema", "safetySettings", "systemInstruction", "thinkingConfig"]);
});
