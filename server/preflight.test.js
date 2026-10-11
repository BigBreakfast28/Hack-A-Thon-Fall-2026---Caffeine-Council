import test from "node:test";
import assert from "node:assert/strict";
import { SAFETY_SETTINGS } from "./muse.js";
import { pedagogyData } from "./pedagogy.js";
import { SCENARIOS, SLOW_REPLY_MS, lintReply, runPreflight } from "./preflight.js";

const GOOD = "You filled the page with red lines. Which part do you want to add to next?";
// The real model is asked for JSON with a reply and a one-line picture note.
const GOOD_JSON = JSON.stringify({ reply: GOOD, seen: "Red lines across the page." });

function fakeAi({ models = ["models/test-model", "models/gemini-other"], reply = GOOD_JSON, fail = null, listFails = false } = {}) {
  const calls = [];
  return {
    calls,
    models: {
      list: async () => {
        if (listFails) throw Object.assign(new Error("no"), { status: 403 });
        return (async function* () {
          for (const name of models) yield { name };
        })();
      },
      generateContent: async (args) => {
        calls.push(args);
        if (fail) throw Object.assign(new Error("upstream said no"), { status: fail });
        return typeof reply === "function" ? reply(args) : { text: reply };
      },
    },
  };
}

const ticking = () => {
  let now = 0;
  return () => (now += 100);
};

test("a healthy setup passes and every call carries the production config", async () => {
  const ai = fakeAi();
  const { ok, results } = await runPreflight({ ai, model: "test-model", clock: ticking() });
  assert.equal(ok, true);
  assert.deepEqual(results.map((r) => r.status), ["pass", "pass", "pass", "skip"]);
  assert.equal(results[1].ms, 100);
  assert.equal(ai.calls.length, 2);
  for (const call of ai.calls) {
    assert.equal(call.model, "test-model");
    assert.deepEqual(call.config.safetySettings, SAFETY_SETTINGS);
    assert.match(call.config.systemInstruction, /Never ask for names/);
    assert.equal("maxOutputTokens" in call.config, false);
  }
  assert.match(ai.calls[1].config.systemInstruction, /chose this kind of help themselves/);
});

test("--all runs every scenario, and each one reaches a different module", async () => {
  const ai = fakeAi();
  await runPreflight({ ai, model: "test-model", all: true, clock: ticking() });
  assert.equal(ai.calls.length, SCENARIOS.length);
  const frameworks = new Set(ai.calls.map((call) => call.config.systemInstruction.match(/Coaching focus: ([^.\n]+)/)[1]));
  assert.equal(frameworks.size, Object.keys(pedagogyData).length);
  assert.ok(ai.calls.some((call) => /The child's own rule: draw only straight lines/.test(call.config.systemInstruction)));
});

test("a model the key cannot see fails before any generation call, and suggests real ones", async () => {
  const ai = fakeAi({ models: ["models/gemini-real-one", "models/embedding-x"] });
  const { ok, results } = await runPreflight({ ai, model: "gemini-3.8-flash" });
  assert.equal(ok, false);
  assert.equal(results.length, 1);
  assert.match(results[0].detail, /not available to this key/);
  assert.match(results[0].detail, /gemini-real-one/);
  assert.doesNotMatch(results[0].detail, /embedding-x/);
  assert.equal(ai.calls.length, 0);
});

test("a listing failure is reported with its status code", async () => {
  const { ok, results } = await runPreflight({ ai: fakeAi({ listFails: true }), model: "m" });
  assert.equal(ok, false);
  assert.match(results[0].detail, /403/);
});

test("a blocked or empty reply fails and says what a child would see", async () => {
  const blocked = fakeAi({ reply: () => ({ text: undefined, candidates: [{ finishReason: "SAFETY" }] }), models: ["m"] });
  const { ok, results } = await runPreflight({ ai: blocked, model: "m" });
  assert.equal(ok, false);
  assert.match(results[1].detail, /SAFETY/);
  assert.match(results[1].detail, /Sunny is resting/);
});

test("a failing call is a failure with the status code", async () => {
  const { ok, results } = await runPreflight({ ai: fakeAi({ fail: 429, models: ["m"] }), model: "m" });
  assert.equal(ok, false);
  assert.match(results[1].detail, /429/);
});

test("a reply that breaks our rules is a warning, not a failure", async () => {
  const ai = fakeAi({ reply: "You are such a talented artist! Your drawing is better than most. Here are three more tips. And a fourth.", models: ["m"] });
  const { ok, results } = await runPreflight({ ai, model: "m" });
  assert.equal(ok, true);
  assert.equal(results[1].status, "warn");
  assert.match(results[1].detail, /talented/);
  assert.match(results[1].detail, /artist/);
  assert.match(results[1].detail, /compares/);
  assert.match(results[1].detail, /4 sentences/);
  assert.match(results[1].detail, /open question/);
});

test("a slow reply is a warning", async () => {
  let t = 0;
  const clock = () => (t += SLOW_REPLY_MS + 1);
  const { results } = await runPreflight({ ai: fakeAi({ models: ["m"] }), model: "m", clock });
  assert.equal(results[1].status, "warn");
  assert.match(results[1].detail, /slow/);
});

test("a frame is sent as an image with every call, and the image check is no longer skipped", async () => {
  const ai = fakeAi({ models: ["m"] });
  const frame = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////";
  const { results } = await runPreflight({ ai, model: "m", frameBase64: frame });
  assert.equal(results.some((r) => r.status === "skip"), false);
  assert.deepEqual(ai.calls[0].contents.at(-1).parts.at(-1), { inlineData: { mimeType: "image/jpeg", data: frame } });
});

test("lintReply passes a good reply and catches the specific problems", () => {
  assert.deepEqual(lintReply(GOOD), []);
  assert.deepEqual(lintReply("Nice! What next?"), []);
  assert.match(lintReply("Keep going.").join(), /open question/);
  assert.match(lintReply("That is 9 out of 10! What next?").join(), /rates/);
  assert.match(lintReply("What is your name?").join(), /personal information/);
  assert.match(lintReply("Where do you live?").join(), /personal information/);
});

const never = () => new Promise(() => {});

test("a model listing that never answers fails with a timeout instead of hanging", async () => {
  const ai = { models: { list: never, generateContent: never } };
  const { ok, results } = await runPreflight({ ai, model: "m", timeoutMs: 20 });
  assert.equal(ok, false);
  assert.equal(results.length, 1);
  assert.match(results[0].detail, /timed out/);
});

test("a generation call that never answers fails with a timeout, and the run still finishes", async () => {
  const ai = fakeAi({ models: ["m"] });
  ai.models.generateContent = never;
  const { ok, results } = await runPreflight({ ai, model: "m", timeoutMs: 20 });
  assert.equal(ok, false);
  assert.match(results[1].detail, /timed out/);
  assert.match(results[2].detail, /timed out/);
});

test("progress steps are reported before each network call", async () => {
  const steps = [];
  await runPreflight({ ai: fakeAi({ models: ["m"] }), model: "m", onStep: (message) => steps.push(message), clock: ticking() });
  assert.equal(steps.length, 3);
  assert.match(steps[0], /model exists/);
  assert.match(steps[1], /default encouragement/);
  assert.match(steps[2], /challenge/);
});

test("listing stops as soon as the model is found, so later pages are never fetched", async () => {
  let reachedSecondPage = false;
  const ai = fakeAi({ models: ["m"] });
  ai.models.list = async () =>
    (async function* () {
      yield { name: "models/m" };
      reachedSecondPage = true;
      await never();
    })();
  const { ok } = await runPreflight({ ai, model: "m", timeoutMs: 50 });
  assert.equal(ok, true);
  assert.equal(reachedSecondPage, false);
});
