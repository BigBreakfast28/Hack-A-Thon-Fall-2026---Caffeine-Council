// Request pipeline for one coaching reply. It takes a parsed JSON payload and returns
// { status, body }. It never touches disk, never logs request content, and keeps nothing
// after it returns: the client owns the conversation and resends it every time.
import { evaluateMetrics, parseMetrics } from "./evaluateMetrics.js";
import { pedagogyData } from "./pedagogy.js";

export const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 2000;
const MAX_FRAME_CHARS = 600_000; // about 450 KB of JPEG once decoded
const UPSTREAM_TIMEOUT_MS = 10_000;
const SHARED_DRAWING_TURN = "(I shared my drawing)";

// These rules are always sent and always win over a pedagogy module. They are what
// keeps the coaching safe for a child whatever the module text says.
const GUARDRAILS = [
  "You are Sunny, a warm art coach for children aged 5 and up.",
  "Write directly to the child in at most 3 short, simple sentences. Keep it empowering.",
  "Praise effort and choices, never talent. Never say a drawing is bad or wrong.",
  "Never describe or guess the child's personality, feelings, abilities, family, money, or background.",
  "Never ask for names, places, photos of people, or any personal information.",
  "Never draw or paint for the child. Suggest one small next step they can do themselves.",
  "End with one open question that invites the child to choose what happens next.",
  "Stay on art. If asked about anything else, kindly bring the talk back to the drawing.",
  "Do not mention brands, characters owned by companies, or real people.",
  "Do not name researchers, studies or theories.",
].join(" ");

export function buildSystemInstruction(pedagogy) {
  return [
    GUARDRAILS,
    `Coaching focus: ${pedagogy.framework}.`,
    `How to coach: ${pedagogy.prompts_for_kids}`,
    "If the coaching focus ever conflicts with the safety rules above, the safety rules win.",
  ].join("\n\n");
}

/** Accepts a JPEG data URL or bare base64. Returns { ok, frame } with frame null when absent. */
export function parseFrame(frameData) {
  if (frameData === undefined || frameData === null || frameData === "") {
    return { ok: true, frame: null };
  }
  if (typeof frameData !== "string") return { ok: false, error: "frameData must be a string" };
  const base64 = frameData.startsWith("data:")
    ? frameData.replace(/^data:image\/jpeg;base64,/, "")
    : frameData;
  if (base64.startsWith("data:")) return { ok: false, error: "frameData must be a JPEG" };
  if (base64.length > MAX_FRAME_CHARS) return { ok: false, error: "frameData is too large" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, error: "frameData is not valid base64" };
  return { ok: true, frame: base64 };
}

export function parseHistory(history) {
  if (history === undefined) return { ok: true, history: [] };
  if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) {
    return { ok: false, error: `history must be an array of at most ${MAX_HISTORY_TURNS} turns` };
  }
  const clean = [];
  for (const turn of history) {
    const valid =
      turn &&
      (turn.role === "user" || turn.role === "model") &&
      typeof turn.text === "string" &&
      turn.text.length > 0 &&
      turn.text.length <= MAX_TURN_CHARS;
    if (!valid) return { ok: false, error: "each history turn needs a role and short text" };
    clean.push({ role: turn.role, text: turn.text });
  }
  return { ok: true, history: clean };
}

export function parseRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "JSON object required" };
  }
  const metrics = parseMetrics(payload.canvasMetrics);
  if (!metrics.ok) return metrics;
  const history = parseHistory(payload.history);
  if (!history.ok) return history;
  const frame = parseFrame(payload.frameData);
  if (!frame.ok) return frame;
  return { ok: true, metrics: metrics.metrics, history: history.history, frame: frame.frame };
}

export function telemetryText(metrics, hasFrame) {
  const { durationSeconds, strokeCount, primaryColors } = metrics;
  const rate = durationSeconds > 0 ? (strokeCount / durationSeconds).toFixed(1) : "0.0";
  const colors = primaryColors.length ? primaryColors.join(", ") : "none";
  return (
    `Drawing so far: ${strokeCount} strokes in ${Math.round(durationSeconds)} seconds ` +
    `(${rate} strokes per second), main colors: ${colors}.` +
    (hasFrame ? " A picture of my canvas is attached." : "")
  );
}

/** Maps the client's history plus the new drawing update into Gemini `contents`. */
export function buildContents(history, metrics, frame) {
  const contents = history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
  const parts = [{ text: telemetryText(metrics, Boolean(frame)) }];
  if (frame) parts.push({ inlineData: { mimeType: "image/jpeg", data: frame } });
  contents.push({ role: "user", parts });
  return contents;
}

function trimHistory(history) {
  const trimmed = history.slice(-MAX_HISTORY_TURNS);
  while (trimmed.length && trimmed[0].role !== "user") trimmed.shift();
  return trimmed;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const RESTING = "Sunny is resting. Please try again.";

export async function processMuse(payload, { ai, model, verifyAccess }) {
  const parsed = parseRequest(payload);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };

  // The client's own claim of having paid is never read. Only a verifiable credential counts.
  let access;
  try {
    access = await verifyAccess(payload.credential);
  } catch {
    access = { ok: false };
  }
  if (!access.ok) return { status: 401, body: { error: "Access validation failed." } };

  const pedagogy = pedagogyData[evaluateMetrics(parsed.metrics)];
  try {
    // No `store` flag: generateContent keeps no developer-side state, and Google may still
    // retain prompts for abuse monitoring. See ARCHITECTURE.md.
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: buildContents(parsed.history, parsed.metrics, parsed.frame),
        config: { systemInstruction: buildSystemInstruction(pedagogy) },
      }),
      UPSTREAM_TIMEOUT_MS,
    );
    const text = (response.text ?? "").trim();
    if (!text) return { status: 502, body: { error: RESTING } };

    const history = trimHistory([
      ...parsed.history,
      { role: "user", text: SHARED_DRAWING_TURN },
      { role: "model", text },
    ]);
    return { status: 200, body: { text, history } };
  } catch (err) {
    // Log only a status code or error name, never request content.
    console.error("upstream_error", err?.status ?? err?.name ?? "unknown");
    return { status: 502, body: { error: RESTING } };
  }
}
