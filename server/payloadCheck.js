// Payload check: is what we hand to the Gemini SDK exactly what we mean to send?
//
// It builds real requests with buildGeminiRequest, the function the live server and the
// preflight both use, and asserts the contract below. It is pure: no network, no key. It
// cannot say how the real model replies or whether the model name exists for your key;
// `npm run preflight` does that. Run by hand or in CI (npm run check:payload).
//
// The contract, and why each part exists:
//  - Only five config keys are allowed. `store` is not a generateContent setting, so it
//    would protect nothing. `maxOutputTokens` counts thinking tokens on Gemini thinking
//    models and can leave an empty reply, so the 3-sentence limit lives in the prompt and
//    waiting time is held down with `thinkingConfig.thinkingLevel` instead (the first live
//    run took up to 11.7 s with unlimited thinking). Anything new must be added to
//    ALLOWED_CONFIG_KEYS on purpose, not by accident.
//  - Google's strictest safety filters are on, on all four categories.
//  - The reply is JSON with `reply` and `seen`.
//  - The system instruction has the guardrails and the chosen module's text, and none of
//    the team-only text (studies, evidence, caveats) or researcher names.
//  - Child-side text (history) stays in `contents` and never enters the system instruction.
//
// `build` is injectable only so the tests can prove this check fails when the contract breaks.
import { SAFETY_SETTINGS, buildGeminiRequest, parseRequest } from "./muse.js";
import { pedagogyData } from "./pedagogy.js";
import { rulePhrase } from "./ruleOptions.js";

// A name no real model has, so the check proves the model passes through unchanged
// without copying the server's default.
export const MODEL_UNDER_TEST = "model-under-test";

const FRAME = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////"; // base64 alphabet only; never decoded
const HISTORY_MARKER = "HISTORY-MARKER-9f3a";

const ALLOWED_CONFIG_KEYS = ["responseMimeType", "responseSchema", "safetySettings", "systemInstruction", "thinkingConfig"];
const THINKING_LEVELS = ["MINIMAL", "LOW", "MEDIUM", "HIGH"]; // the values the SDK's ThinkingLevel accepts
const FORBIDDEN_CONFIG_REASON = {
  store: "`store` is not a generateContent setting and would protect nothing",
  maxOutputTokens: "`maxOutputTokens` counts thinking tokens and can leave an empty reply",
};

const GUARDRAIL_PHRASES = [
  "You are Sunny",
  "at most 3 short, simple sentences",
  "Never rate, score or compare a drawing",
  "Never describe or guess the child's personality",
  "Never draw or paint for the child",
  "Do not name researchers, studies or theories",
  "the safety rules win",
];

// Wording from the original design that must not come back.
const BANNED_WORDING = [/elite/i, /sociological/i, /academic references/i, /under-resourced/i, /exceed 4 sentences/i];

const CHOSEN_LINE = "The child chose this kind of help themselves";
const RULE_LINE = "The child's own rule:";
const LESSON = { title: "Draw a house", step: "Add the windows" };
const HISTORY = [
  { role: "user", text: `Update: 4 strokes, 9 s. ${HISTORY_MARKER}` },
  { role: "model", text: "Nice! What will you add next?" },
];
const A_RULE = { mark: "lines", limit: "no-lifting" };
const canvasMetrics = { durationSeconds: 130, strokeCount: 40, primaryColors: ["#E97962"] };

export const PAYLOAD_SCENARIOS = [
  { name: "default, no picture", payload: { canvasMetrics }, module: "general_encouragement" },
  { name: "child chose a challenge", payload: { canvasMetrics, coachingMode: "challenge" }, module: "constraint_challenge" },
  { name: "child chose an idea", payload: { canvasMetrics, coachingMode: "idea" }, module: "problem_finding" },
  { name: "child chose to finish", payload: { canvasMetrics, coachingMode: "finish" }, module: "process_feedback" },
  { name: "child chose cheering", payload: { canvasMetrics, coachingMode: "cheer" }, module: "autonomy_support" },
  { name: "child chose to add, with a picture", payload: { canvasMetrics, coachingMode: "add", frameData: FRAME }, module: "elaboration" },
  { name: "child made a rule", payload: { canvasMetrics, coachingMode: "rule", childRule: A_RULE }, module: "rule_playing" },
  { name: "earlier history and a lesson", payload: { canvasMetrics, history: HISTORY, lesson: LESSON }, module: "general_encouragement" },
];

// Team-only text and the researchers' surnames, gathered from the real modules so a new
// study is covered without editing this file.
function teamOnly() {
  const texts = new Set();
  const surnames = new Set();
  for (const module of Object.values(pedagogyData)) {
    for (const study of module.studies) {
      texts.add(study);
      surnames.add(study.split(/[ ,(&]/)[0]);
    }
    if (module.evidence) texts.add(module.evidence);
    if (module.caveat) texts.add(module.caveat);
  }
  return { texts: [...texts], surnames: [...surnames].filter(Boolean) };
}

function checkRequest(scenario, request, parsed) {
  const problems = [];
  const keys = Object.keys(request ?? {}).sort();
  if (keys.join() !== "config,contents,model") problems.push(`request has keys [${keys.join(", ")}], expected [config, contents, model]`);
  if (request?.model !== MODEL_UNDER_TEST) problems.push("the model name was changed on the way");

  const config = request?.config ?? {};
  for (const key of Object.keys(config)) {
    if (!ALLOWED_CONFIG_KEYS.includes(key)) problems.push(FORBIDDEN_CONFIG_REASON[key] ?? `unexpected config key "${key}"`);
  }
  for (const key of ALLOWED_CONFIG_KEYS) {
    if (!(key in config)) problems.push(`config is missing ${key}`);
  }

  const settings = config.safetySettings ?? [];
  const wantCategories = SAFETY_SETTINGS.map((setting) => setting.category).sort().join();
  if (settings.map((setting) => setting.category).sort().join() !== wantCategories) problems.push("safety settings do not cover the four harm categories");
  if (settings.length === 0 || settings.some((setting) => setting.threshold !== "BLOCK_LOW_AND_ABOVE")) problems.push("safety filters are not all at BLOCK_LOW_AND_ABOVE");

  if (!THINKING_LEVELS.includes(config.thinkingConfig?.thinkingLevel)) problems.push(`thinkingConfig.thinkingLevel must be one of ${THINKING_LEVELS.join(", ")}`);
  if (config.responseMimeType !== "application/json") problems.push("the reply is not requested as JSON");
  if (JSON.stringify(config.responseSchema?.required) !== JSON.stringify(["reply", "seen"])) problems.push("the reply schema must require reply and seen");

  const contents = Array.isArray(request?.contents) ? request.contents : [];
  const wantTurns = (scenario.payload.history?.length ?? 0) + 1;
  if (contents.length !== wantTurns) problems.push(`${contents.length} turns sent, expected ${wantTurns}`);
  if (contents.some((turn) => !["user", "model"].includes(turn.role) || !Array.isArray(turn.parts) || turn.parts.length === 0)) {
    problems.push("a turn has the wrong shape");
  }
  const last = contents.at(-1);
  if (last?.role !== "user") problems.push("the last turn is not from the user");
  if (!/^Drawing so far: \d+ strokes in \d+ seconds/.test(last?.parts?.[0]?.text ?? "")) problems.push("the last turn does not start with the drawing summary");
  const image = last?.parts?.find((part) => part.inlineData);
  if (scenario.payload.frameData) {
    if (image?.inlineData?.mimeType !== "image/jpeg" || image.inlineData.data !== FRAME) problems.push("the picture was not sent as a JPEG part");
  } else if (image) {
    problems.push("a picture was sent although none was given");
  }
  if (scenario.payload.history && !JSON.stringify(contents).includes(HISTORY_MARKER)) problems.push("the earlier history was dropped");

  const text = typeof config.systemInstruction === "string" ? config.systemInstruction : "";
  if (!text) {
    problems.push("there is no system instruction");
    return problems;
  }
  for (const phrase of GUARDRAIL_PHRASES) {
    if (!text.includes(phrase)) problems.push(`guardrail missing: "${phrase}"`);
  }
  const module = pedagogyData[scenario.module];
  if (!text.includes(`Coaching focus: ${module.framework}.`)) problems.push(`the ${scenario.module} focus is missing`);
  if (!text.includes(`How to coach: ${module.prompts_for_kids}`)) problems.push(`the ${scenario.module} coaching text is missing`);

  const { texts, surnames } = teamOnly();
  if (texts.some((snippet) => text.includes(snippet))) problems.push("team-only text (a study, evidence or caveat) reached the model");
  const leaked = surnames.filter((name) => text.includes(name));
  if (leaked.length) problems.push(`a researcher's name reached the model: ${leaked.join(", ")}`);
  for (const pattern of BANNED_WORDING) {
    if (pattern.test(text)) problems.push(`banned wording is back: ${pattern}`);
  }

  if (text.includes(CHOSEN_LINE) !== Boolean(parsed.mode)) problems.push(parsed.mode ? "the child's choice is not flagged to the model" : "the model is told the child chose, but they did not");
  if (parsed.childRule) {
    if (!text.includes(`${RULE_LINE} ${rulePhrase(parsed.childRule)}.`)) problems.push("the child's rule is missing or reworded");
  } else if (text.includes(RULE_LINE)) {
    problems.push("a rule line appears although the child made no rule");
  }
  if (parsed.lesson && !text.includes(`lesson "${LESSON.title}", step "${LESSON.step}"`)) problems.push("the lesson line is missing");
  if (!parsed.lesson && text.includes("is working on the lesson")) problems.push("a lesson line appears although there is no lesson");
  if (parsed.frame ? !text.includes("A picture of the drawing is attached") : !text.includes("No picture is attached")) {
    problems.push("the instruction does not say correctly whether a picture is attached");
  }
  if (text.includes(HISTORY_MARKER)) problems.push("child-side text was copied into the system instruction");
  return problems;
}

/**
 * @param {object} [options]
 * @param {(model: string, parsed: object) => object} [options.build]
 * @returns {{ ok: boolean, results: Array<{name: string, status: string, detail: string}> }}
 */
export function runPayloadChecks({ build = buildGeminiRequest } = {}) {
  const results = PAYLOAD_SCENARIOS.map((scenario) => {
    const parsed = parseRequest(scenario.payload);
    if (!parsed.ok) return { name: scenario.name, status: "fail", detail: `scenario is invalid: ${parsed.error}` };
    const problems = checkRequest(scenario, build(MODEL_UNDER_TEST, parsed), parsed);
    return { name: scenario.name, status: problems.length ? "fail" : "pass", detail: problems.length ? problems.join("; ") : "contract holds" };
  });
  return { ok: results.every((result) => result.status === "pass"), results };
}
