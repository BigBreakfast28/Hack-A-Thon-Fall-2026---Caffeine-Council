// Checks the request we hand to the Gemini SDK, built by the same function the live server
// uses. Offline: no key, no network, no files. Exit code 0 when the contract holds, 1 otherwise.
//
//   npm run check:payload
//
// It does not call Gemini, so it cannot tell you whether your model name exists for your key
// or how the real model replies. Use `npm run preflight` for that.
import { runPayloadChecks } from "../payloadCheck.js";

if (process.argv.length > 2) {
  console.error(`unknown argument: ${process.argv.slice(2).join(" ")}\nUsage: npm run check:payload`);
  process.exit(2);
}

const { ok, results } = runPayloadChecks();
console.log("Gemini payload contract, built by the production request builder\n");
for (const result of results) {
  console.log(`${result.status === "pass" ? "PASS" : "FAIL"}  ${result.name}${result.status === "pass" ? "" : `\n      ${result.detail}`}`);
}
const failed = results.filter((result) => result.status !== "pass").length;
console.log(ok ? `\nAll ${results.length} scenarios hold the contract.` : `\n${failed} of ${results.length} scenarios break the contract.`);
console.log("Not checked here: the real model name and how Gemini actually replies. Run npm run preflight for that.");
process.exit(ok ? 0 : 1);
