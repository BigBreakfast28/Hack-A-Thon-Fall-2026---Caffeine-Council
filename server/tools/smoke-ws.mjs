// End-to-end check of a running server: the health endpoint, then one real exchange over
// the WebSocket, the way the browser does it. Works against localhost or your Vultr domain.
//
//   npm run smoke                                         ws://127.0.0.1:8080/ws
//   npm run smoke -- --url wss://muse.example.com/ws
//   npm run smoke -- --url wss://muse.example.com/ws --expect-denied
//   npm run smoke -- --url wss://muse.example.com/ws --origin https://not-the-front-end.example --expect-origin-refused
//   npm run smoke -- --mode challenge
//
// Credential: MAGIC_TICKET (an existing ticket) or MAGIC_TICKET_SECRET (a 5 minute ticket is
// minted here). If the server runs with ACCESS_MODE=open, neither is needed.
// If the server sets ALLOWED_ORIGIN, pass the same value with --origin or SMOKE_ORIGIN.
//
// The drawing summary sent is synthetic. A passing run with a real model uses one paid call.
import WebSocket from "ws";
import { COACHING_MODES } from "../evaluateMetrics.js";
import { mintMagicTicket } from "../access.js";

const TIMEOUT_MS = 30_000;
const ACCESS_REFUSAL = "Access validation failed."; // the exact text processMuse returns for a failed credential
const USAGE = `Usage: npm run smoke -- [--url ws://host/ws] [--origin https://app] [--mode ${COACHING_MODES.filter((m) => m !== "rule").join("|")}] [--expect-denied | --expect-origin-refused]`;

function parseArgs(argv) {
  const out = { url: process.env.MUSE_WS_URL ?? "ws://127.0.0.1:8080/ws", origin: process.env.SMOKE_ORIGIN, mode: undefined, expectDenied: false, expectOriginRefused: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--expect-denied") out.expectDenied = true;
    else if (flag === "--expect-origin-refused") out.expectOriginRefused = true;
    else if (flag === "--url" || flag === "--origin" || flag === "--mode") {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      out[flag.slice(2)] = value;
    } else throw new Error(`unknown argument: ${flag}`);
  }
  if (out.mode === "rule") throw new Error("mode rule needs a childRule, which this tool does not send");
  if (out.mode !== undefined && !COACHING_MODES.includes(out.mode)) throw new Error(`mode must be one of: ${COACHING_MODES.join(", ")}`);
  if (out.expectDenied && out.expectOriginRefused) throw new Error("pick one of --expect-denied and --expect-origin-refused");
  if (out.expectOriginRefused && !out.origin) throw new Error("--expect-origin-refused needs an --origin that is NOT the allowed one");
  if (!/^wss?:\/\//.test(out.url)) throw new Error("url must start with ws:// or wss://");
  return out;
}

function credential() {
  if (process.env.MAGIC_TICKET) return { type: "magic_ticket", value: process.env.MAGIC_TICKET };
  if (process.env.MAGIC_TICKET_SECRET) {
    const expiresAtSec = Math.floor(Date.now() / 1000) + 300;
    return { type: "magic_ticket", value: mintMagicTicket({ secret: process.env.MAGIC_TICKET_SECRET, expiresAtSec }) };
  }
  return undefined;
}

const steps = [];
const record = (ok, name, detail) => {
  steps.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
};

async function checkHealth(wsUrl) {
  const url = new URL(wsUrl.replace(/^ws/, "http"));
  url.pathname = "/api/health";
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    record(response.status === 200 && body.ok === true, "health endpoint", `${url.origin}/api/health ${response.status} in ${Math.round(performance.now() - started)} ms`);
  } catch (err) {
    record(false, "health endpoint", `${url.origin}/api/health unreachable (${err.name})`);
  }
}

function exchange({ url, origin }, message) {
  return new Promise((resolve, reject) => {
    const connectStarted = performance.now();
    const socket = new WebSocket(url, origin ? { headers: { Origin: origin } } : undefined);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`no reply within ${TIMEOUT_MS / 1000} s`));
    }, TIMEOUT_MS);
    let sentAt = 0;
    let connectMs = 0;
    socket.on("unexpected-response", (req, res) => {
      clearTimeout(timer);
      const refusal = new Error(`server refused the connection: HTTP ${res.statusCode}`);
      refusal.httpStatus = res.statusCode;
      // Close the refused connection so the process can exit instead of waiting on it.
      res.resume();
      req.destroy();
      reject(refusal);
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`connection failed: ${err.message}`));
    });
    socket.on("open", () => {
      connectMs = Math.round(performance.now() - connectStarted);
      sentAt = performance.now();
      socket.send(JSON.stringify(message));
    });
    socket.on("message", (data) => {
      clearTimeout(timer);
      const replyMs = Math.round(performance.now() - sentAt);
      socket.close();
      try {
        resolve({ body: JSON.parse(data.toString()), connectMs, replyMs });
      } catch {
        reject(new Error("reply was not JSON"));
      }
    });
  });
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}\n${USAGE}`);
  process.exit(2);
}

console.log(`Smoke test: ${args.url}${args.expectDenied ? " (expecting an access refusal)" : ""}${args.expectOriginRefused ? " (expecting an origin refusal)" : ""}\n`);
await checkHealth(args.url);

const canvasMetrics = { durationSeconds: 95, strokeCount: 30, primaryColors: ["#E97962", "#6F9FC6"] };
const message = { canvasMetrics, history: [], ...(args.mode ? { coachingMode: args.mode } : {}) };

try {
  if (args.expectOriginRefused) {
    // The upgrade itself must be refused (HTTP 403) before any message is read.
    try {
      await exchange(args, message);
      record(false, "wrong origin is refused at the upgrade", "the server accepted the connection and replied");
    } catch (err) {
      record(err.httpStatus === 403, "wrong origin is refused at the upgrade", err.httpStatus ? `HTTP ${err.httpStatus} (expected 403)` : err.message);
    }
  } else if (args.expectDenied) {
    // No credential at all: a server that requires access must refuse and never call the model.
    // Only the access refusal counts. Any other error (bad request, upstream) would hide a gap.
    const { body, connectMs, replyMs } = await exchange(args, message);
    record(body.error === ACCESS_REFUSAL && body.text === undefined, "request without a ticket is refused for lack of access", `got: ${JSON.stringify(body)} (connect ${connectMs} ms, reply ${replyMs} ms)`);
    record(replyMs < 2000, "refusal is fast, so the model was not called", `${replyMs} ms`);
  } else {
    const cred = credential();
    if (!cred) console.log("note  no MAGIC_TICKET or MAGIC_TICKET_SECRET set; this only works if the server is in open mode\n");
    const { body, connectMs, replyMs } = await exchange(args, { ...message, ...(cred ? { credential: cred } : {}) });
    record(true, "connected", `${connectMs} ms`);
    if (typeof body.text === "string" && body.text.length > 0) {
      const signed = typeof body.historyProof === "string" && body.historyProof.length > 0;
      record(Array.isArray(body.history) && body.history.length === 2 && signed, "reply has text, a 2-turn history and its signed proof", `${replyMs} ms round trip, including the model call`);
      console.log(`      reply: ${body.text.replace(/\s+/g, " ")}`);
    } else {
      record(false, "reply has text", `server said: ${JSON.stringify(body)}`);
    }
  }
} catch (err) {
  record(false, "exchange", err.message);
}

const ok = steps.every(Boolean);
console.log(ok ? "\nAll checks passed." : "\nSome checks failed.");
// Exit explicitly: a refused connection must never keep the process waiting.
process.exit(ok ? 0 : 1);
