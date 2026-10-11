// Gemini preflight: answers "will the real call work, and does the real reply follow our
// own rules?" before a child ever sees it. It is an operator tool run by hand with a
// synthetic drawing summary. It is not part of the request path, is not copied into the
// Docker image, and handles no child data.
//
// The Gemini client is injected so the checks can be tested offline. Every call goes
// through buildGeminiRequest, the same function the live server uses, so the model name,
// system instruction and safety settings tested here are the ones that will be sent.
import { parseRequest, buildGeminiRequest, readModelOutput } from "./muse.js";

export const SLOW_REPLY_MS = 6000; // the server gives up at 10 s; a reply this slow feels broken
export const CALL_TIMEOUT_MS = 30_000; // a hung network call becomes a visible failure instead of a silent hang
const MAX_LISTED_ALTERNATIVES = 8;

const SAMPLE = { durationSeconds: 130, strokeCount: 40, primaryColors: ["#E97962", "#6F9FC6"] };

/** Synthetic requests that together cover each module once. The first two are the default run. */
export const SCENARIOS = [
  { name: "default encouragement", payload: { canvasMetrics: SAMPLE } },
  { name: "child chose a challenge", payload: { canvasMetrics: SAMPLE, coachingMode: "challenge" } },
  { name: "child chose an idea", payload: { canvasMetrics: SAMPLE, coachingMode: "idea" } },
  { name: "child chose to finish", payload: { canvasMetrics: SAMPLE, coachingMode: "finish" } },
  { name: "child chose cheering", payload: { canvasMetrics: SAMPLE, coachingMode: "cheer" } },
  { name: "child chose to add", payload: { canvasMetrics: SAMPLE, coachingMode: "add" } },
  {
    name: "child made a rule",
    payload: { canvasMetrics: SAMPLE, coachingMode: "rule", childRule: { mark: "lines", limit: "no-lifting" } },
  },
  { name: "long session", payload: { canvasMetrics: { ...SAMPLE, durationSeconds: 700 } } },
  { name: "blank page", payload: { canvasMetrics: { durationSeconds: 90, strokeCount: 0 } } },
];
export const DEFAULT_SCENARIO_COUNT = 2;

// Things the system prompt tells the model never to do. Matching text here is a smell to
// look at by hand, not proof of a violation, and absence of a match is not proof of safety.
const REPLY_SMELLS = [
  // Found by reading the first live replies: "lots of focused time" guesses the child's attention.
  [/\b(focused|concentrat\w*|proud|excited|happy|tired|frustrated|brave|patient)\b/i, "guesses how the child feels or thinks"],
  [/\b(talented|gifted|smart|genius|prodigy)\b/i, "praises what the child is, not what they did"],
  [/\byou(?:'re| are)\s+(?:a|an|such a)\s+(?:\w+\s+)?artist\b/i, "calls the child an artist"],
  [/\b\d+\s*(?:\/|out of)\s*10\b/i, "rates the drawing"],
  [/\bbetter than\b|\bother (?:kids|children)\b/i, "compares the child or the drawing"],
  [/\b(?:what(?:'s| is) your (?:name|address|school)|where do you live)\b/i, "asks for personal information"],
];

function sentenceCount(text) {
  return text.split(/[.!?]+(?:\s+|$)/).filter((part) => part.trim().length > 0).length;
}

/** Checks one reply against the format and guardrails. Returns a list of plain-language problems. */
export function lintReply(text) {
  const problems = [];
  const trimmed = text.trim();
  const sentences = sentenceCount(trimmed);
  if (sentences > 3) problems.push(`${sentences} sentences (limit is 3)`);
  if (!trimmed.endsWith("?")) problems.push("does not end with an open question");
  const questions = (trimmed.match(/\?/g) ?? []).length;
  if (questions > 1) problems.push(`${questions} questions (the rule is one)`);
  for (const [pattern, why] of REPLY_SMELLS) {
    const match = trimmed.match(pattern);
    if (match) problems.push(`${why}: "${match[0]}"`);
  }
  return problems;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${Math.round(ms / 1000)} s`), { name: "TimeoutError" })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The opening words of a reply's last sentence, used to spot the same closing line being reused. */
function closingKey(text) {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  return sentences.at(-1).toLowerCase().replace(/[^a-z' ]/g, "").split(/\s+/).slice(0, 4).join(" ");
}

export const REPEATED_ENDING_COUNT = 3;

/** Flags when several replies close with the same opening words. Needs REPEATED_ENDING_COUNT replies. */
export function checkVariety(replies) {
  const counts = new Map();
  for (const reply of replies) counts.set(closingKey(reply), (counts.get(closingKey(reply)) ?? 0) + 1);
  const [key, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (count >= REPEATED_ENDING_COUNT) {
    return { name: "variety of endings", status: "warn", detail: `${count} of ${replies.length} replies end with "${key} ..."` };
  }
  return { name: "variety of endings", status: "pass", detail: "endings differ" };
}

async function checkModelExists(ai, model, timeoutMs) {
  const names = [];
  let found = false;
  const listAll = async () => {
    for await (const entry of await ai.models.list()) {
      const name = entry.name ?? "";
      names.push(name);
      if (name === model || name === `models/${model}`) {
        found = true;
        return; // no need to read the remaining pages
      }
    }
  };
  try {
    await withTimeout(listAll(), timeoutMs, "listing models");
  } catch (err) {
    return { name: "model exists", status: "fail", detail: `could not list models (${errorCode(err)}): ${err?.message ?? ""}`.trim() };
  }
  if (found) {
    return { name: "model exists", status: "pass", detail: model };
  }
  const alternatives = names
    .map((name) => name.replace(/^models\//, ""))
    .filter((name) => /^gemini-/.test(name))
    .slice(0, MAX_LISTED_ALTERNATIVES);
  const hint = alternatives.length ? ` Some that exist: ${alternatives.join(", ")}.` : "";
  return { name: "model exists", status: "fail", detail: `"${model}" is not available to this key.${hint}` };
}

function errorCode(err) {
  return err?.status ?? err?.name ?? "unknown error";
}

async function checkScenario(ai, model, scenario, frameBase64, clock, timeoutMs) {
  const parsed = parseRequest({ ...scenario.payload, ...(frameBase64 ? { frameData: frameBase64 } : {}) });
  if (!parsed.ok) return { name: scenario.name, status: "fail", detail: `scenario is invalid: ${parsed.error}` };

  const started = clock();
  let response;
  try {
    response = await withTimeout(ai.models.generateContent(buildGeminiRequest(model, parsed)), timeoutMs, "the call");
  } catch (err) {
    return { name: scenario.name, status: "fail", detail: `call failed (${errorCode(err)}): ${err?.message ?? ""}`.trim() };
  }
  const ms = Math.round(clock() - started);

  const output = readModelOutput(response);
  if (!output) {
    const reason = response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason ?? "empty";
    return { name: scenario.name, status: "fail", ms, detail: `empty reply (${reason}). A child would see "Sunny is resting".` };
  }

  const problems = lintReply(output.reply);
  if (!output.fromJson) problems.push("reply was not JSON, so the picture note will be missing");
  if (ms > SLOW_REPLY_MS) problems.push(`slow: ${ms} ms`);
  const thinking = response.usageMetadata?.thoughtsTokenCount;
  return {
    name: scenario.name,
    status: problems.length ? "warn" : "pass",
    ms,
    reply: output.reply,
    ...(output.seen ? { seen: output.seen } : {}),
    detail: problems.length ? problems.join("; ") : "format and guardrail checks passed",
    ...(thinking ? { thinkingTokens: thinking } : {}),
  };
}

/**
 * @param {object} options
 * @param {object} options.ai            a GoogleGenAI client (or a fake with the same two methods)
 * @param {string} options.model
 * @param {string} [options.frameBase64] optional JPEG to send with the checks, as a real client would
 * @param {boolean} [options.all]        run every scenario instead of the first two
 * @param {() => number} [options.clock]
 * @param {number} [options.timeoutMs]   per network step; a stalled call fails instead of hanging
 * @param {(message: string) => void} [options.onStep] called before each network step, so a slow run shows where it is
 * @returns {Promise<{ ok: boolean, results: Array }>} ok is false if any check failed; warnings do not fail it
 */
export async function runPreflight({
  ai,
  model,
  frameBase64 = null,
  all = false,
  clock = () => performance.now(),
  timeoutMs = CALL_TIMEOUT_MS,
  onStep = () => {},
}) {
  const results = [];
  onStep("checking that the model exists for this key...");
  const exists = await checkModelExists(ai, model, timeoutMs);
  results.push(exists);
  if (exists.status === "fail") return { ok: false, results };

  const scenarios = all ? SCENARIOS : SCENARIOS.slice(0, DEFAULT_SCENARIO_COUNT);
  for (const scenario of scenarios) {
    onStep(`calling the model: ${scenario.name}...`);
    results.push(await checkScenario(ai, model, scenario, frameBase64, clock, timeoutMs));
  }
  const replies = results.filter((result) => result.reply).map((result) => result.reply);
  if (replies.length >= REPEATED_ENDING_COUNT) results.push(checkVariety(replies));
  if (!frameBase64) {
    results.push({ name: "image input", status: "skip", detail: "no frame given. Pass one on stdin (see npm run preflight)." });
  }
  return { ok: results.every((result) => result.status !== "fail"), results };
}
