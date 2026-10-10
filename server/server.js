// Stateless WebSocket broker. Nothing here persists: no database, no files, no session
// store, and no request logging. TLS is terminated in front of this process (reverse proxy
// or load balancer), so browsers connect with wss:// and this process speaks plain ws://.
import http from "node:http";
import { pathToFileURL } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { WebSocketServer } from "ws";
import { createAccessVerifier, createSolanaBalanceFetcher } from "./access.js";
import { processMuse } from "./muse.js";

const MAX_PAYLOAD_BYTES = 1_000_000;
const MAX_CONNECTIONS = 50;
const MESSAGES_PER_MINUTE = 20;

export function createServer({
  ai,
  verifyAccess,
  model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  allowedOrigin = process.env.ALLOWED_ORIGIN,
}) {
  const server = http.createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET" && req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
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
        const { status, body } = await processMuse(payload, { ai, model, verifyAccess });
        return reply(status === 200 ? body : { error: body.error });
      } catch {
        return reply({ error: "Transformation error." });
      } finally {
        busy = false;
      }
    });
  });

  return { server, wss };
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
  createServer({ ai, verifyAccess }).server.listen(port, "0.0.0.0", () => {
    console.log(`muse server listening on ${port}`);
  });
}
