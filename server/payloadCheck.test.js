import test from "node:test";
import assert from "node:assert/strict";
import { buildGeminiRequest } from "./muse.js";
import { MODEL_UNDER_TEST, PAYLOAD_SCENARIOS, runPayloadChecks } from "./payloadCheck.js";
import { pedagogyData } from "./pedagogy.js";

// A builder that is the real one with one edit applied to its output.
const tampered = (edit) => (model, parsed) => {
  const request = structuredClone(buildGeminiRequest(model, parsed));
  edit(request, parsed);
  return request;
};
const problems = (report) => report.results.filter((result) => result.status === "fail").map((result) => result.detail).join(" | ");

test("the production builder holds the contract in every scenario", () => {
  const report = runPayloadChecks();
  assert.equal(problems(report), "");
  assert.equal(report.ok, true);
  assert.equal(report.results.length, PAYLOAD_SCENARIOS.length);
  assert.ok(PAYLOAD_SCENARIOS.length >= 8);
});

test("every module is covered by at least one scenario", () => {
  const covered = new Set(PAYLOAD_SCENARIOS.map((scenario) => scenario.module));
  assert.deepEqual([...covered].sort(), Object.keys(pedagogyData).sort());
});

test("the original design's mistakes each fail the check, with the reason", () => {
  const store = runPayloadChecks({ build: tampered((request) => (request.config.store = false)) });
  assert.match(problems(store), /`store` is not a generateContent setting/);

  const cap = runPayloadChecks({ build: tampered((request) => (request.config.maxOutputTokens = 250)) });
  assert.match(problems(cap), /`maxOutputTokens` counts thinking tokens/);

  const temperature = runPayloadChecks({ build: tampered((request) => (request.config.temperature = 0.7)) });
  assert.match(problems(temperature), /unexpected config key "temperature"/);

  const persona = runPayloadChecks({
    build: tampered((request) => {
      request.config.systemInstruction = `Role: Elite Early Childhood Art Coach.\nSociological Vector: x.\n${request.config.systemInstruction}`;
    }),
  });
  assert.match(problems(persona), /banned wording is back/);

  const wrongModel = runPayloadChecks({ build: tampered((request) => (request.model = "gemini-2.5-flash")) });
  assert.match(problems(wrongModel), /model name was changed/);
});

test("team-only text and researcher names reaching the model fail the check", () => {
  const study = pedagogyData.constraint_challenge.studies[0];
  const leakedStudy = runPayloadChecks({ build: tampered((request) => (request.config.systemInstruction += `\nAcademic References: ${study}`)) });
  assert.match(problems(leakedStudy), /team-only text/);

  const leakedName = runPayloadChecks({ build: tampered((request) => (request.config.systemInstruction += "\nAs Torrance showed, be playful.")) });
  assert.match(problems(leakedName), /researcher's name reached the model: Torrance/);

  const leakedEvidence = runPayloadChecks({ build: tampered((request) => (request.config.systemInstruction += `\n${pedagogyData.elaboration.evidence}`)) });
  assert.match(problems(leakedEvidence), /team-only text/);
});

test("weaker safety settings and a missing JSON format fail the check", () => {
  const dropped = runPayloadChecks({ build: tampered((request) => (request.config.safetySettings = [])) });
  assert.match(problems(dropped), /four harm categories/);

  const weaker = runPayloadChecks({ build: tampered((request) => (request.config.safetySettings[0].threshold = "BLOCK_ONLY_HIGH")) });
  assert.match(problems(weaker), /not all at BLOCK_LOW_AND_ABOVE/);

  const plain = runPayloadChecks({ build: tampered((request) => (request.config.responseMimeType = "text/plain")) });
  assert.match(problems(plain), /not requested as JSON/);
});

test("child-side text in the system instruction, and a lost picture or history, fail the check", () => {
  const copied = runPayloadChecks({
    build: tampered((request, parsed) => {
      if (parsed.history.length) request.config.systemInstruction += `\n${parsed.history[0].text}`;
    }),
  });
  assert.match(problems(copied), /child-side text was copied into the system instruction/);

  const noImage = runPayloadChecks({ build: tampered((request) => request.contents.at(-1).parts.splice(1)) });
  assert.match(problems(noImage), /picture was not sent as a JPEG part/);

  const noHistory = runPayloadChecks({ build: tampered((request) => request.contents.splice(0, request.contents.length - 1)) });
  assert.match(problems(noHistory), /earlier history was dropped/);
});

test("a wrong module's text, or a missing guardrail, fails the check", () => {
  const wrongModule = runPayloadChecks({
    build: tampered((request) => {
      request.config.systemInstruction = request.config.systemInstruction.replace(/Coaching focus: [^\n]+/, "Coaching focus: something else.");
    }),
  });
  assert.match(problems(wrongModule), /focus is missing/);

  const noGuardrail = runPayloadChecks({
    build: tampered((request) => {
      request.config.systemInstruction = request.config.systemInstruction.replace("Never draw or paint for the child.", "");
    }),
  });
  assert.match(problems(noGuardrail), /guardrail missing: "Never draw or paint for the child"/);
});

test("the model name is a sentinel, so the check never depends on the server's default", () => {
  assert.equal(MODEL_UNDER_TEST, "model-under-test");
  assert.equal(buildGeminiRequest(MODEL_UNDER_TEST, { metrics: { durationSeconds: 1, strokeCount: 1, primaryColors: [] }, mode: null, childRule: null, lesson: null, history: [], frame: null }).model, MODEL_UNDER_TEST);
});
