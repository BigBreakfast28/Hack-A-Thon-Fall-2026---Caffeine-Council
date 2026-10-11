import { useCallback, useEffect, useRef, useState } from "react";

export type ChatTurn = { role: "user" | "model"; text: string };

// Only strokes and time drive coaching. The server ignores shape variety, and colors are optional context.
// `elapsedSeconds` is time on the page including pauses; only the blank-page rule reads it.
export type CanvasMetrics = {
  durationSeconds: number;
  strokeCount: number;
  elapsedSeconds?: number;
  shapeDiversityScore?: number;
  primaryColors?: string[];
  // Counts worked out on the device by comparing stroke kinds with the lesson step or with the
  // child's own rule (src/lib/strokeCheck.ts). Counts only; each pair goes together.
  stepShapesExpected?: number;
  stepShapesDrawn?: number;
  ruleStrokes?: number;
  ruleFollowed?: number;
};

// The help a child can ask for. Must match COACHING_MODES in server/evaluateMetrics.js.
// "rule" means the child made their own rule, and needs extras.childRule.
export type CoachingMode = "challenge" | "idea" | "finish" | "cheer" | "rule" | "add";

// The child's own drawing rule: ids from RULE_MARKS and RULE_LIMITS in src/lib/ruleOptions.ts.
export type ChildRule = { mark: string; limit: string };

// Optional context for one request. Lesson text is our own lesson content, never typed by the child.
export type CoachExtras = { childRule?: ChildRule; lesson?: { title: string; step: string } };

// What the grown-ups' Studio view shows about one reply. Held in memory only.
export type CoachMeta = {
  module: string;
  framework: string;
  reason: string;
  evidence: string;
  caveat: string;
  studies: string[];
};

// What the server can verify. The client never says "I paid"; it sends proof.
export type AccessCredential =
  | { type: "magic_ticket"; value: string }
  | { type: "wallet"; address: string; nonce: string; signature: string }
  | { type: "storekit"; value: string };

type Reply = {
  text?: string;
  history?: ChatTurn[];
  historyProof?: string;
  meta?: CoachMeta;
  redirected?: boolean;
  resetHistory?: boolean;
  error?: string;
};

// Optional override, for example wss://muse.example.com/ws. Not a secret: the Gemini key never reaches the browser.
const SOCKET_URL = (import.meta.env.VITE_MUSE_WS_URL as string | undefined) ?? "";
const REPLY_TIMEOUT_MS = 15000;
const CONNECT_TIMEOUT_MS = 8000; // a server that never answers fails after this, not after the browser's own minute-long wait

function socketUrl() {
  if (SOCKET_URL) return SOCKET_URL;
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
}

/**
 * Client-owned, RAM-only conversation over a WebSocket. `chatHistory` and the access
 * credential live in React state, are sent with every message, and are dropped by
 * `wipeVolatileMemory` or when the page closes. Nothing here uses any browser storage.
 */
export const useStatelessStream = () => {
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  // The server's proof that it made this history. Without it the server refuses the history.
  const [historyProof, setHistoryProof] = useState<string | null>(null);
  // Why Sunny answered the way she did, for the grown-ups' Studio view. Never sent anywhere.
  const [lastMeta, setLastMeta] = useState<CoachMeta | null>(null);
  const [credential, setCredential] = useState<AccessCredential | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  useEffect(() => closeSocket, [closeSocket]);

  const connect = useCallback(
    () =>
      new Promise<WebSocket>((resolve, reject) => {
        const existing = socketRef.current;
        if (existing && existing.readyState === WebSocket.OPEN) return resolve(existing);
        closeSocket();
        const socket = new WebSocket(socketUrl());
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error("Could not reach the coach"));
        }, CONNECT_TIMEOUT_MS);
        socket.onopen = () => {
          clearTimeout(timer);
          socketRef.current = socket;
          resolve(socket);
        };
        socket.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Could not reach the coach"));
        };
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
        };
      }),
    [closeSocket],
  );

  /**
   * Sends one snapshot and waits for one reply. Returns the coaching text, or null on failure.
   * `coachingMode` is the kind of help the child picked; leave it out to let the server choose.
   * `extras` carries the child's own rule (mode "rule", ids from ruleOptions.ts) and the lesson
   * they are on. The conversation is sent back with the proof the server gave with it. If the
   * server says that proof is no longer good (a restart, or two hours passed), the chat starts
   * fresh once, automatically.
   */
  const dispatchCanvasTelemetry = useCallback(
    async (
      metrics: CanvasMetrics,
      frameDataUrl?: string,
      coachingMode?: CoachingMode,
      extras?: CoachExtras,
    ): Promise<string | null> => {
      setPending(true);
      setError(null);
      try {
        const socket = await connect();
        const send = (history: ChatTurn[], proof: string | null) =>
          new Promise<Reply>((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(timer);
              socket.removeEventListener("message", onMessage);
              socket.removeEventListener("close", onClose);
            };
            const onMessage = (event: MessageEvent) => {
              cleanup();
              try {
                resolve(JSON.parse(String(event.data)) as Reply);
              } catch {
                reject(new Error("Unexpected reply"));
              }
            };
            const onClose = () => {
              cleanup();
              reject(new Error("Connection closed"));
            };
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error("The coach took too long"));
            }, REPLY_TIMEOUT_MS);
            socket.addEventListener("message", onMessage);
            socket.addEventListener("close", onClose);
            socket.send(
              JSON.stringify({
                canvasMetrics: metrics,
                frameData: frameDataUrl,
                coachingMode,
                childRule: extras?.childRule,
                lesson: extras?.lesson,
                history,
                historyProof: proof ?? undefined,
                credential,
              }),
            );
          });

        let reply = await send(chatHistory, historyProof);
        if (reply.resetHistory) {
          setChatHistory([]);
          setHistoryProof(null);
          reply = await send([], null);
        }
        if (reply.error || !reply.text || !reply.history) throw new Error(reply.error ?? "Unexpected reply");
        setChatHistory(reply.history);
        setHistoryProof(reply.historyProof ?? null);
        if (reply.meta) setLastMeta(reply.meta);
        return reply.text;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transmission error");
        return null;
      } finally {
        setPending(false);
      }
    },
    [chatHistory, connect, credential, historyProof],
  );

  /** Closes the connection and clears the conversation, its proof, the Studio note and the credential from memory. */
  const wipeVolatileMemory = useCallback(() => {
    closeSocket();
    setChatHistory([]);
    setHistoryProof(null);
    setLastMeta(null);
    setCredential(null);
    setPending(false);
    setError(null);
  }, [closeSocket]);

  /** Setting or clearing the credential also clears any earlier access error, so it is not shown again. */
  const setAccessCredential = useCallback((next: AccessCredential | null) => {
    setCredential(next);
    setError(null);
  }, []);

  return {
    chatHistory,
    pending,
    error,
    lastMeta,
    dispatchCanvasTelemetry,
    hasCredential: credential !== null,
    setAccessCredential,
    wipeVolatileMemory,
  };
};
