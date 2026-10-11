import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createServer } from "./server.js";

const metrics = { durationSeconds: 130, strokeCount: 40, shapeDiversityScore: 0.2, primaryColors: ["red"] };

async function withServer(options, run) {
  const ai = options.ai ?? { models: { generateContent: async () => ({ text: "Lovely lines! What next?" }) } };
  const { server, wss } = createServer({
    ai,
    model: "test-model",
    verifyAccess: options.verifyAccess ?? (async () => ({ ok: true })),
    allowedOrigin: options.allowedOrigin,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    await run({ port, wsUrl: `ws://127.0.0.1:${port}/ws`, httpUrl: `http://127.0.0.1:${port}` });
  } finally {
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
}

const open = (url, options) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(Object.assign(new Error("refused"), { status: res.statusCode })));
  });
const nextMessage = (ws) => new Promise((resolve) => ws.once("message", (data) => resolve(JSON.parse(data.toString()))));

test("a coaching reply comes back over the socket", async () => {
  await withServer({}, async ({ wsUrl }) => {
    const ws = await open(wsUrl);
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ canvasMetrics: metrics, history: [] }));
    const body = await reply;
    assert.equal(body.text, "Lovely lines! What next?");
    assert.deepEqual(body.history.map((turn) => turn.role), ["user", "model"]);
    ws.close();
  });
});

test("an access failure is returned as an error and does not close the socket", async () => {
  await withServer({ verifyAccess: async () => ({ ok: false }) }, async ({ wsUrl }) => {
    const ws = await open(wsUrl);
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ canvasMetrics: metrics, tokenValid: true }));
    assert.deepEqual(await reply, { error: "Access validation failed." });
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  });
});

test("bad JSON and binary frames get an error back", async () => {
  await withServer({}, async ({ wsUrl }) => {
    const ws = await open(wsUrl);
    let reply = nextMessage(ws);
    ws.send("{oops");
    assert.deepEqual(await reply, { error: "Bad request" });
    reply = nextMessage(ws);
    ws.send(Buffer.from([1, 2, 3]));
    assert.deepEqual(await reply, { error: "Text messages only." });
    ws.close();
  });
});

// Reads messages strictly in arrival order, so two replies can never be mixed up.
function messageQueue(ws) {
  const queue = [];
  const waiters = [];
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  return () =>
    new Promise((resolve) => {
      if (queue.length) resolve(queue.shift());
      else waiters.push(resolve);
    });
}

test("a second request while one is in flight is refused", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const ai = { models: { generateContent: async () => (await gate, { text: "done" }) } };
  await withServer({ ai }, async ({ wsUrl }) => {
    const ws = await open(wsUrl);
    const next = messageQueue(ws);
    ws.send(JSON.stringify({ canvasMetrics: metrics }));
    ws.send(JSON.stringify({ canvasMetrics: metrics }));
    assert.deepEqual(await next(), { error: "One request at a time." });
    release();
    assert.equal((await next()).text, "done");
    ws.close();
  });
});

test("the 21st message in a minute is rate limited", async () => {
  await withServer({}, async ({ wsUrl }) => {
    const ws = await open(wsUrl);
    let last;
    for (let i = 0; i < 21; i++) {
      const reply = nextMessage(ws);
      ws.send(JSON.stringify({ canvasMetrics: metrics }));
      last = await reply;
    }
    assert.deepEqual(last, { error: "Too many requests. Please slow down." });
    ws.close();
  });
});

test("only the allowed origin may connect, and only on /ws", async () => {
  await withServer({ allowedOrigin: "https://muse.example" }, async ({ port, wsUrl }) => {
    await assert.rejects(() => open(wsUrl, { origin: "https://evil.example" }), { status: 403 });
    await assert.rejects(() => open(wsUrl), { status: 403 });
    await assert.rejects(() => open(`ws://127.0.0.1:${port}/other`, { origin: "https://muse.example" }), { status: 404 });
    const ws = await open(wsUrl, { origin: "https://muse.example" });
    ws.close();
  });
});

test("health endpoint answers and nothing else is served", async () => {
  await withServer({}, async ({ httpUrl }) => {
    const health = await fetch(`${httpUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("cache-control"), "no-store");
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal((await fetch(`${httpUrl}/api/muse`)).status, 404);
  });
});
