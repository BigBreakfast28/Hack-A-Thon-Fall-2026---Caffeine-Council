import test from "node:test";
import assert from "node:assert/strict";
import { THINKING_LEVEL, buildGenerationConfig, buildGeminiRequest, parseRequest } from "./muse.js";
import { pedagogyData } from "./pedagogy.js";
import { REPEATED_ENDING_COUNT, checkVariety, lintReply } from "./preflight.js";

test("every Gemini request limits thinking, and does not use maxOutputTokens", () => {
  assert.ok(["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(THINKING_LEVEL));
  const config = buildGenerationConfig(pedagogyData.general_encouragement);
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: THINKING_LEVEL });
  assert.equal("maxOutputTokens" in config, false);

  const parsed = parseRequest({ canvasMetrics: { durationSeconds: 60, strokeCount: 10 }, coachingMode: "challenge" });
  assert.deepEqual(buildGeminiRequest("m", parsed).config.thinkingConfig, { thinkingLevel: THINKING_LEVEL });
});

test("lint flags guesses about how the child feels or thinks", () => {
  assert.match(lintReply("You spent lots of focused time on this! What next?").join(), /guesses how the child feels/);
  assert.match(lintReply("You must be so proud! What next?").join(), /proud/);
  assert.deepEqual(lintReply("You added forty strokes in two minutes. What would you like to add next?"), []);
});

test("lint flags more than one question", () => {
  const problems = lintReply("What are you making? What would you like to add next?").join();
  assert.match(problems, /2 questions/);
  assert.deepEqual(lintReply("You made a lot of lines, and you can change them whenever you like. What next?"), []);
});

test("checkVariety flags a closing line reused across replies", () => {
  const same = ["Nice lines. What are you making today?", "Good work. What are you making in your picture?", "More colors. What are you making next?"];
  assert.equal(same.length, REPEATED_ENDING_COUNT);
  const result = checkVariety(same);
  assert.equal(result.status, "warn");
  assert.match(result.detail, /3 of 3.*what are you making/);

  const varied = ["Nice lines. Which color next?", "Good work. Want to try a new shape?", "More colors. Where will the next line go?"];
  assert.equal(checkVariety(varied).status, "pass");
  // Two of the same is not enough to call it a habit.
  assert.equal(checkVariety([same[0], same[1], varied[0]]).status, "pass");
});
