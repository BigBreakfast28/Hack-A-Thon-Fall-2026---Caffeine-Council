// Drives the real server with the browser-style WebSocket that Node ships, sending exactly
// the message shape the useStatelessStream hook sends. This is not a browser test: it checks
// the wire contract between the canvas statistics, the hook and the server.
import test from "node:test";
import assert from "node:assert/strict";
import { createAccessVerifier, mintMagicTicket } from "../../server/access.js";
import { createServer } from "../../server/server.js";
import { createStrokeTracker } from "./canvasTelemetry.ts";

const SECRET = "wire-test-secret-not-real";
const NOW = Date.now();
const goodTicket = () => mintMagicTicket({ secret: SECRET, expiresAtSec: Math.floor(NOW / 1000) + 3600 });
const expiredTicket = () => mintMagicTicket({ secret: SECRET, expiresAtSec: Math.floor(NOW / 1000) - 10 });
// A tiny JPEG-shaped base64 string; the server checks the alphabet and size only.
const FRAME = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwD/2Q==";

function sketch(strokes = 40) {
  const tracker = createStrokeTracker();
  let t = 0;
  for (let i = 0; i < strokes; i++) {
    const points = Array.from({ length: 20 }, (_, k) => ({ x: k * 10, y: i % 2 ? 0 : 90 * Math.sin((Math.PI * k) / 19) }));
    tracker.beginStroke(points[0].x, points[0].y, i % 2 ? "#E97962" : "#6F9FC6", (t += 900));
    for (const p of points.slice(1)) tracker.addPoint(p.x, p.y);
    tracker.endStroke((t += 900));
  }
  return tracker.snapshot();
}

async function withServer(run) {
  const calls = [];
  const ai = {
    models: {
      generateContent: async (args) => {
        calls.push(args);
        return { text: `Reply ${calls.length}: lovely work! What will you add next?` };
      },
    },
  };
  const verifyAccess = createAccessVerifier({ ticketSecret: SECRET });
  const { server, wss } = createServer({ ai, model: "wire-test", verifyAccess, allowedOrigin: undefined });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  try {
    await run({ url, calls });
  } finally {
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
}

const connect = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", () => reject(new Error("connect failed")), { once: true });
  });

const exchange = (ws, message) =>
  new Promise((resolve) => {
    ws.addEventListener("message", (event) => resolve(JSON.parse(event.data)), { once: true });
    ws.send(JSON.stringify(message));
  });

test("two rounds with a real ticket: the client owns and resends the history", async () => {
  await withServer(async ({ url, calls }) => {
    const ws = await connect(url);
    const credential = { type: "magic_ticket", value: goodTicket() };

    // Same shape the hook sends: canvasMetrics, frameData (omitted when frames are off), history, credential.
    const first = await exchange(ws, { canvasMetrics: sketch(40), frameData: undefined, history: [], credential });
    assert.match(first.text, /^Reply 1/);
    assert.deepEqual(first.history.map((turn) => turn.role), ["user", "model"]);

    const second = await exchange(ws, { canvasMetrics: sketch(60), history: first.history, credential });
    assert.match(second.text, /^Reply 2/);
    assert.equal(second.history.length, 4);

    // The model saw the earlier turns only because the client sent them back.
    assert.equal(calls[1].contents.length, 3);
    assert.equal(calls[1].contents[1].parts[0].text, first.text);
    // No image went out in telemetry-only mode.
    assert.equal(calls[0].contents.at(-1).parts.length, 1);
    ws.close();
  });
});

test("a snapshot frame is forwarded as an image when frames are switched on", async () => {
  await withServer(async ({ url, calls }) => {
    const ws = await connect(url);
    const reply = await exchange(ws, {
      canvasMetrics: sketch(12),
      frameData: `data:image/jpeg;base64,${FRAME}`,
      history: [],
      credential: { type: "magic_ticket", value: goodTicket() },
    });
    assert.ok(reply.text);
    assert.deepEqual(calls[0].contents.at(-1).parts.at(-1), { inlineData: { mimeType: "image/jpeg", data: FRAME } });
    ws.close();
  });
});

test("no ticket, an expired ticket, or a client-side claim all produce the error the canvas turns into a friendly message", async () => {
  await withServer(async ({ url, calls }) => {
    const ws = await connect(url);
    const metrics = sketch(12);
    for (const message of [
      { canvasMetrics: metrics, history: [], credential: null },
      { canvasMetrics: metrics, history: [], credential: { type: "magic_ticket", value: expiredTicket() } },
      { canvasMetrics: metrics, history: [], tokenValid: true },
    ]) {
      const reply = await exchange(ws, message);
      assert.match(reply.error, /access validation/i); // the same pattern App.tsx's friendlyCoachError tests for
      assert.equal(reply.text, undefined);
    }
    assert.equal(calls.length, 0);
    ws.close();
  });
});
