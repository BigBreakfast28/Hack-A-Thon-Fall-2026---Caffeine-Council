import { useCallback, useEffect, useRef, useState } from "react";

export type ChatTurn = { role: "user" | "model"; text: string };

export type CanvasMetrics = {
  durationSeconds: number;
  strokeCount: number;
  shapeDiversityScore: number;
  primaryColors: string[];
};

// What the server can verify. The client never says "I paid"; it sends proof.
export type AccessCredential =
  | { type: "magic_ticket"; value: string }
  | { type: "wallet"; address: string; nonce: string; signature: string }
  | { type: "storekit"; value: string };

type Reply = { text?: string; history?: ChatTurn[]; error?: string };

// Optional override, for example wss://muse.example.com/ws. Not a secret: the Gemini key never reaches the browser.
const SOCKET_URL = (import.meta.env.VITE_MUSE_WS_URL as string | undefined) ?? "";
const REPLY_TIMEOUT_MS = 15000;

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
        socket.onopen = () => {
          socketRef.current = socket;
          resolve(socket);
        };
        socket.onerror = () => reject(new Error("Could not reach the coach"));
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
        };
      }),
    [closeSocket],
  );

  /** Sends one snapshot and waits for one reply. Returns the coaching text, or null on failure. */
  const dispatchCanvasTelemetry = useCallback(
    async (metrics: CanvasMetrics, frameDataUrl?: string): Promise<string | null> => {
      setPending(true);
      setError(null);
      try {
        const socket = await connect();
        const reply = await new Promise<Reply>((resolve, reject) => {
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
          socket.send(JSON.stringify({ canvasMetrics: metrics, frameData: frameDataUrl, history: chatHistory, credential }));
        });
        if (reply.error || !reply.text || !reply.history) throw new Error(reply.error ?? "Unexpected reply");
        setChatHistory(reply.history);
        return reply.text;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transmission error");
        return null;
      } finally {
        setPending(false);
      }
    },
    [chatHistory, connect, credential],
  );

  /** Closes the connection and clears the conversation and credential from memory. */
  const wipeVolatileMemory = useCallback(() => {
    closeSocket();
    setChatHistory([]);
    setCredential(null);
    setPending(false);
    setError(null);
  }, [closeSocket]);

  return {
    chatHistory,
    pending,
    error,
    dispatchCanvasTelemetry,
    setAccessCredential: setCredential,
    wipeVolatileMemory,
  };
};
