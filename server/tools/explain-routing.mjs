// Shows which routing rule picks the coaching module, and why. Offline, no key needed.
//
//   npm run explain -- --examples
//   npm run explain -- --seconds 700 --strokes 30
//   npm run explain -- --seconds 12 --strokes 3 --elapsed 90
//   npm run explain -- --seconds 90 --strokes 10 --mode cheer
//
// It reads the same ROUTING_RULES list the live server uses.
import { COACHING_MODES, explainRoute, parseCoachingMode, parseMetrics } from "../evaluateMetrics.js";

const USAGE = `Usage: npm run explain -- --seconds N --strokes N [--elapsed N] [--mode ${COACHING_MODES.join("|")}]
       npm run explain -- --examples`;

const EXAMPLES = [
  { label: "ordinary session", seconds: 130, strokes: 40 },
  { label: "child taps 'give me a challenge'", seconds: 130, strokes: 40, mode: "challenge" },
  { label: "child taps 'just cheer me on' in a long session", seconds: 900, strokes: 200, mode: "cheer" },
  { label: "long session, no choice made", seconds: 700, strokes: 150 },
  { label: "blank page, if the client sent time on page", seconds: 0, strokes: 0, elapsed: 90 },
  { label: "the same blank page as today's canvas reports it", seconds: 0, strokes: 0 },
  { label: "only 3 strokes in 12 s of drawing, 90 s on the page", seconds: 12, strokes: 3, elapsed: 90 },
  { label: "very fast, very busy drawing", seconds: 10, strokes: 5000 },
];

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--examples") values.examples = true;
    else if (["--seconds", "--strokes", "--elapsed", "--mode"].includes(flag)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      values[flag.slice(2)] = value;
    } else throw new Error(`unknown argument: ${flag}`);
  }
  return values;
}

function show({ label, seconds, strokes, elapsed, mode }) {
  const canvasMetrics = { durationSeconds: Number(seconds), strokeCount: Number(strokes) };
  if (elapsed !== undefined) canvasMetrics.elapsedSeconds = Number(elapsed);
  const parsedMetrics = parseMetrics(canvasMetrics);
  if (!parsedMetrics.ok) throw new Error(parsedMetrics.error);
  const parsedMode = parseCoachingMode(mode ?? null);
  if (!parsedMode.ok) throw new Error(parsedMode.error);

  const result = explainRoute(parsedMetrics.metrics, parsedMode.mode);
  const input = [
    `${seconds} s active`,
    `${strokes} strokes`,
    ...(elapsed !== undefined ? [`${elapsed} s on page`] : []),
    `mode: ${parsedMode.mode ?? "none"}`,
  ].join(", ");

  console.log(`\n${label ? `${label}\n` : ""}  input: ${input}`);
  let reachedDecision = false;
  for (const rule of result.rules) {
    const mark = rule.decisive ? "=>" : "  ";
    const state = rule.decisive ? "MATCH" : rule.matched ? (reachedDecision ? "also true, not reached" : "true") : "no";
    console.log(`  ${mark} ${rule.id.padEnd(13)} ${state.padEnd(24)} ${rule.when}`);
    if (rule.decisive) reachedDecision = true;
  }
  console.log(`  chosen: ${result.chosen} (decided by ${result.decidedBy})`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.examples) {
    for (const example of EXAMPLES) show(example);
  } else if (args.seconds !== undefined && args.strokes !== undefined) {
    show({ ...args, label: "" });
  } else {
    console.log(USAGE);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`${err.message}\n${USAGE}`);
  process.exitCode = 2;
}
