import test from "node:test";
import assert from "node:assert/strict";
import { cleanLesson, cleanShape, createLessonService, stepPicture } from "./lessons.js";
import { createServer } from "./server.js";

const trainLesson = {
  steps: [
    { title: "Start with a box", copy: "Draw a long box near the bottom.", demo: "A long box is the train.", shapes: [{ kind: "rect", x: 40, y: 70, w: 110, h: 40 }] },
    { title: "Add the wheels", copy: "Draw two circles under the box.", demo: "Circles make it roll.", shapes: [{ kind: "circle", cx: 65, cy: 118, r: 10 }, { kind: "circle", cx: 125, cy: 118, r: 10 }] },
    { title: "Add a chimney", copy: "Draw a small box on top.", demo: "Puff puff!", shapes: [{ kind: "rect", x: 125, y: 50, w: 14, h: 20 }] },
  ],
};

function fakeAi(...answers) {
  const calls = [];
  return {
    calls,
    models: {
      generateContent: async (args) => {
        calls.push(args);
        const next = answers.length > 1 ? answers.shift() : answers[0];
        return { text: typeof next === "string" ? next : JSON.stringify(next) };
      },
    },
  };
}

const decode = (url) => decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));

test("a good lesson comes back with a picture for every step", async () => {
  const getLesson = createLessonService({ ai: fakeAi(trainLesson), model: "m" });
  const { status, body } = await getLesson("little-train");
  assert.equal(status, 200);
  assert.equal(body.steps.length, 3);
  for (const step of body.steps) {
    assert.ok(step.title && step.copy && step.demo);
    assert.match(step.imageUrl, /^data:image\/svg\+xml/);
    assert.equal(step.shapes, undefined, "raw shapes are not sent to the app");
  }
});

test("each picture keeps earlier steps in gray and shows only this step's new shapes in coral", () => {
  const { steps } = cleanLesson(trainLesson);
  const step3 = decode(stepPicture(steps, 2));
  assert.equal((step3.match(/#B8B0A3/g) ?? []).length, 3, "box and two wheels in gray");
  assert.equal((step3.match(/#E97962/g) ?? []).length, 1, "only the chimney in coral");
  const step1 = decode(stepPicture(steps, 0));
  assert.equal((step1.match(/#B8B0A3/g) ?? []).length, 0);
});

test("pictures contain only shapes the server drew", () => {
  const { steps } = cleanLesson(trainLesson);
  const svg = decode(stepPicture(steps, 1));
  assert.doesNotMatch(svg, /script|href|on[a-z]+=|foreignObject/i);
});

test("bad shapes are dropped and unsafe paths are refused", () => {
  assert.equal(cleanShape({ kind: "circle", cx: 50, cy: 50, r: "10" }), null);
  assert.equal(cleanShape({ kind: "rect", x: 9999, y: 0, w: 5, h: 5 }), null);
  assert.equal(cleanShape({ kind: "image", href: "x" }), null);
  assert.equal(cleanShape({ kind: "path", d: "M 10 10 L 20 20\"/><script>" }), null);
  assert.equal(cleanShape({ kind: "path", d: "L 10 10" }), null);
  assert.deepEqual(cleanShape({ kind: "path", d: "M 10 10  Q 20 5 30 10" }), { kind: "path", d: "M 10 10 Q 20 5 30 10" });
});

test("text is length-checked and stripped of angle brackets", () => {
  const long = structuredClone(trainLesson);
  long.steps[0].copy = "word ".repeat(80);
  assert.equal(cleanLesson(long).ok, false);
  const tagged = structuredClone(trainLesson);
  tagged.steps[0].copy = "Draw a <b>big</b> box.";
  assert.equal(cleanLesson(tagged).steps[0].copy, "Draw a bbig/b box.");
});

test("only catalog lessons are accepted, so callers cannot write the prompt", async () => {
  const ai = fakeAi(trainLesson);
  const getLesson = createLessonService({ ai, model: "m" });
  assert.equal((await getLesson("draw-anything-please")).status, 404);
  assert.equal((await getLesson("__proto__")).status, 404);
  assert.equal(ai.calls.length, 0);
});

test("each lesson is generated once, even with callers at the same time", async () => {
  const ai = fakeAi(trainLesson);
  const getLesson = createLessonService({ ai, model: "m" });
  const results = await Promise.all([getLesson("little-train"), getLesson("little-train"), getLesson("little-train")]);
  await getLesson("little-train");
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(ai.calls.length, 1);
});

test("an unusable answer is retried once, then reported so the app uses its own steps", async () => {
  const retried = fakeAi("not json", trainLesson);
  assert.equal((await createLessonService({ ai: retried, model: "m" })("little-train")).status, 200);
  assert.equal(retried.calls.length, 2);

  const broken = fakeAi("not json");
  const getLesson = createLessonService({ ai: broken, model: "m" });
  assert.equal((await getLesson("little-train")).status, 502);
  assert.equal(broken.calls.length, 2);
  // A failure is not cached: the next request tries again.
  await getLesson("little-train");
  assert.equal(broken.calls.length, 4);
});

test("Gemini is asked for JSON and told the lesson and style", async () => {
  const ai = fakeAi(trainLesson);
  await createLessonService({ ai, model: "m" })("bamboo-stalk");
  const [call] = ai.calls;
  assert.equal(call.config.responseMimeType, "application/json");
  assert.match(call.contents[0].parts[0].text, /Bamboo stalk/);
  assert.match(call.contents[0].parts[0].text, /Sumi-e/);
});

test("the server answers GET /api/lessons/:id with the front end's origin allowed", async () => {
  const { server } = createServer({
    ai: fakeAi(trainLesson),
    model: "m",
    verifyAccess: async () => ({ ok: true }),
    allowedOrigin: "https://app.example",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}/api/lessons/little-train?style=realism`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://app.example");
    assert.equal((await res.json()).steps.length, 3);
    assert.equal((await fetch(`${base}/api/lessons/nope`)).status, 404);
    assert.equal((await fetch(`${base}/api/lessons/../../etc`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a lesson with unsafe words is refused, like any of Sunny's replies", async () => {
  const bad = structuredClone(trainLesson);
  bad.steps[1].copy = "Draw two bastard circles under the box.";
  const ai = fakeAi(bad);
  const { status } = await createLessonService({ ai, model: "m" })("little-train");
  assert.equal(status, 502);
  assert.equal(ai.calls.length, 2);
});

test("step titles the coach would reject are refused, so Sunny's check-ins keep working", async () => {
  const odd = structuredClone(trainLesson);
  odd.steps[0].title = "Step 1: the box";
  const { status } = await createLessonService({ ai: fakeAi(odd), model: "m" })("little-train");
  assert.equal(status, 502);
  const { parseLesson } = await import("./muse.js");
  const { body } = await createLessonService({ ai: fakeAi(trainLesson), model: "m" })("little-train");
  for (const step of body.steps) assert.ok(parseLesson({ title: "Little train", step: step.title }).ok, step.title);
});
