// Checks the real routing code at its boundaries and with extreme or hostile input.
// Offline: no key, no network, no files. Exit code 0 when every check passes, 1 otherwise.
//
//   npm run check:router
//   npm run check:router -- --failures      only show what failed
//
// For why a single input lands where it does, use: npm run explain -- --seconds N --strokes N
import { runRouterChecks } from "../routerCheck.js";

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((arg) => arg !== "--failures");
if (unknown.length) {
  console.error(`unknown argument: ${unknown.join(" ")}\nUsage: npm run check:router -- [--failures]`);
  process.exit(2);
}

const { ok, thresholds, results } = runRouterChecks();
console.log("Router check against the real routing code");
console.log(
  `thresholds in use: long session > ${thresholds.longSessionSeconds} s, blank page <= ${thresholds.blankPageMaxStrokes} strokes after > ${thresholds.blankPageAfterSeconds} s (placeholders to tune in a pilot)\n`,
);

let group = null;
for (const result of results) {
  if (args.has("--failures") && result.status === "pass") continue;
  if (result.group !== group) {
    group = result.group;
    console.log(`[${group}]`);
  }
  const detail = result.detail ? `  -> ${result.detail}` : "";
  console.log(`  ${result.status === "pass" ? "PASS" : "FAIL"}  ${result.name}${result.status === "pass" ? "" : detail}`);
}

const failed = results.filter((result) => result.status !== "pass").length;
console.log(ok ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} checks failed.`);
process.exit(ok ? 0 : 1);
