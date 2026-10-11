// Runs the Gemini preflight against your real key. Costs a few cents at most.
//
//   export GEMINI_API_KEY=...            (paid tier; never put it in a file)
//   export GEMINI_MODEL=gemini-3.8-flash (optional; same default as the server)
//   npm run preflight                    two calls: default and a chosen mode
//   npm run preflight -- --all           one call per scenario, every module at least once
//   npm run preflight -- --frame-stdin < some.jpg    also checks image input
//
// The frame comes in on stdin so this tool never opens a file. Use a drawing you made
// yourself, not a child's.
import { GoogleGenAI } from "@google/genai";
import { CALL_TIMEOUT_MS, runPreflight } from "../preflight.js";

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((arg) => !["--all", "--frame-stdin"].includes(arg));
if (unknown.length) {
  console.error(`unknown argument: ${unknown.join(" ")}\nUsage: npm run preflight -- [--all] [--frame-stdin < frame.jpg]`);
  process.exit(2);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set. Export it in your shell first.");
  process.exit(2);
}
const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

async function readFrameFromStdin() {
  if (process.stdin.isTTY) {
    console.error("--frame-stdin needs a JPEG piped in: npm run preflight -- --frame-stdin < some.jpg");
    process.exit(2);
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    console.error("stdin is not a JPEG (it must start with the JPEG marker).");
    process.exit(2);
  }
  return bytes.toString("base64");
}

const frameBase64 = args.has("--frame-stdin") ? await readFrameFromStdin() : null;
// The SDK's own timeout is a second layer under the one in runPreflight.
const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: CALL_TIMEOUT_MS } });

console.log(`Gemini preflight. model: ${model}${frameBase64 ? ", with image" : ""}\n`);
const { ok, results } = await runPreflight({
  ai,
  model,
  frameBase64,
  all: args.has("--all"),
  onStep: (message) => console.log(`...   ${message}`),
});

const LABEL = { pass: "PASS", warn: "WARN", fail: "FAIL", skip: "SKIP" };
for (const result of results) {
  const timing = result.ms !== undefined ? ` (${result.ms} ms${result.thinkingTokens ? `, ${result.thinkingTokens} thinking tokens` : ""})` : "";
  console.log(`${LABEL[result.status]}  ${result.name}${timing}\n      ${result.detail}`);
  if (result.reply) console.log(`      reply: ${result.reply.replace(/\s+/g, " ")}`);
}
console.log(
  ok
    ? "\nNo failures. Read the replies yourself: the checks catch known problems, not every problem."
    : "\nFailures found. The server would show children \"Sunny is resting\" until this is fixed.",
);
// Exit explicitly: a timed-out request can leave a socket open that would keep Node running.
process.exit(ok ? 0 : 1);
