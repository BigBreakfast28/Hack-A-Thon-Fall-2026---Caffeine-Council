// Stateless WebSocket broker. Nothing here persists: no database, no files, no session
// store, and no request logging. TLS is terminated in front of this process (reverse proxy
// or load balancer), so browsers connect with wss:// and this process speaks plain ws://.
import http from "node:http";
import { pathToFileURL } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { WebSocketServer } from "ws";
import { createAccessVerifier, createSolanaBalanceFetcher } from "./access.js";
import { createHistoryProofs } from "./historyProof.js";
import { processMuse } from "./muse.js";
import { createLessonService } from "./lessons.js";

const MAX_PAYLOAD_BYTES = 1_000_000;
const MAX_CONNECTIONS = 50;
const MESSAGES_PER_MINUTE = 20;
const LESSON_CACHE_SECONDS = 300;

export function createServer({
  ai,
  verifyAccess,
  model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  allowedOrigin = process.env.ALLOWED_ORIGIN,
  // One signer for the whole server. HISTORY_SECRET keeps histories valid across restarts;
  // without it a random secret is made now and old histories are refused after a restart.
  historyProofs = createHistoryProofs(),
  getLesson = createLessonService({ ai, model }),
}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && path === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    // Lesson plans are general content (no child data in or out). The browser fetches them
    // directly, so allow the front end's origin (any origin when ALLOWED_ORIGIN is unset).
    const lessonMatch = /^\/api\/lessons\/([a-z0-9-]{1,40})$/.exec(path);
    if (req.method === "GET" && lessonMatch) {
      const { status, body } = await getLesson(lessonMatch[1]);
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowedOrigin || "*",
        // A finished lesson is the same for everyone, so the browser may keep it for a few
        // minutes and reopen it instantly. Errors are never kept.
        "Cache-Control": status === 200 ? `public, max-age=${LESSON_CACHE_SECONDS}` : "no-store",
      });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const refuse = (line) => {
      socket.write(`HTTP/1.1 ${line}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/ws") return refuse("404 Not Found");
    if (allowedOrigin && req.headers.origin !== allowedOrigin) return refuse("403 Forbidden");
    if (wss.clients.size >= MAX_CONNECTIONS) return refuse("503 Service Unavailable");
    return wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    let busy = false;
    let count = 0;
    // Per-connection counter held in RAM only; nothing identifies the client.
    const window = setInterval(() => {
      count = 0;
    }, 60_000);
    window.unref();
    ws.on("close", () => clearInterval(window));
    ws.on("error", () => {});

    const reply = (body) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(body));
    };

    ws.on("message", async (data, isBinary) => {
      if (isBinary) return reply({ error: "Text messages only." });
      if (busy) return reply({ error: "One request at a time." });
      count += 1;
      if (count > MESSAGES_PER_MINUTE) return reply({ error: "Too many requests. Please slow down." });

      busy = true;
      try {
        let payload;
        try {
          payload = JSON.parse(data.toString());
        } catch {
          return reply({ error: "Bad request" });
        }
        const { status, body } = await processMuse(payload, { ai, model, verifyAccess, historyProofs });
        return reply(status === 200 ? body : { error: body.error, ...(body.resetHistory ? { resetHistory: true } : {}) });
      } catch {
        return reply({ error: "Transformation error." });
      } finally {
        busy = false;
      }
    });
  });

  // Never rejects (it runs unattended at start-up): a lesson that cannot be made is simply
  // left for the app's built-in steps.
  const warmLessons = async () => {
    try {
      return typeof getLesson.warm === "function" ? await getLesson.warm() : 0;
    } catch {
      return 0;
    }
  };

  return { server, wss, warmLessons };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set. Export it in the environment; do not put it in a file.");
    process.exit(1);
  }
  const wantsOpen = process.env.ACCESS_MODE === "open";
  const inProduction = process.env.NODE_ENV === "production";
  if (wantsOpen && inProduction) console.error("ACCESS_MODE=open is ignored in production.");

  const verifyAccess = createAccessVerifier({
    mode: wantsOpen && !inProduction ? "open" : "required",
    ticketSecret: process.env.MAGIC_TICKET_SECRET,
    minLamports: Number(process.env.WALLET_MIN_LAMPORTS ?? 1),
    fetchBalance: process.env.SOLANA_RPC_URL
      ? createSolanaBalanceFetcher({ rpcUrl: process.env.SOLANA_RPC_URL })
      : undefined,
  });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const port = Number(process.env.PORT ?? 8080);
  const app = createServer({ ai, verifyAccess });
  app.server.listen(port, "0.0.0.0", () => {
    console.log(`muse server listening on ${port}`);
    // Generate the lessons now, in the background, so the first child does not wait for Gemini.
    // This costs one Gemini call per lesson at every start. LESSON_PREWARM=off turns it off.
    if (process.env.LESSON_PREWARM !== "off") void app.warmLessons();
  });
}
