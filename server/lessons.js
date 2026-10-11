// AI-generated drawing lessons for GET /api/lessons/:id.
//
// Gemini plans the lesson: the steps, the words, and a few simple shapes per step. It never
// sends drawing code. This file checks every shape and number, then draws the step pictures
// itself, so each picture is the earlier steps (gray) plus this step's new shapes (coral).
//
// Lessons are general content, not children's data: no child input reaches this prompt.
// Only lesson ids from LESSON_CATALOG are accepted, so callers cannot write the prompt, and
// each lesson is generated once and kept in memory until the process restarts. Every word
// of the lesson also passes the same child-safety check as Sunny's replies (safety.js).
// The server warms every lesson in the background at start-up (server.js), so a child
// opening a lesson normally gets it instantly.
import { SAFETY_SETTINGS, THINKING_LEVEL } from "./muse.js";
import { anyUnsafe } from "./safety.js";

export const LESSON_CATALOG = {
  "cozy-room": { title: "Cozy room", style: "realism" },
  "little-train": { title: "Little train", style: "realism" },
  "tall-building": { title: "Tall building", style: "realism" },
  "bamboo-stalk": { title: "Bamboo stalk", style: "sumi-e" },
  "ink-apple": { title: "Ink apple", style: "sumi-e" },
  "city-panel": { title: "City panel", style: "graphic-novel" },
  "train-adventure": { title: "Train adventure", style: "graphic-novel" },
};

const STYLE_HINTS = {
  realism: "Realism: simple, true-to-life shapes.",
  "sumi-e": "Sumi-e (Japanese ink painting): few, flowing brush strokes; leave empty space.",
  "graphic-novel": "Graphic novel: start with a comic panel box; bold outlines; add a speech bubble or action lines.",
};

export const VIEW_W = 200;
export const VIEW_H = 150;
const MIN_STEPS = 2;
const MAX_STEPS = 6;
const MAX_SHAPES_PER_STEP = 8;
const MAX_PATH_CHARS = 400;
const UPSTREAM_TIMEOUT_MS = 25_000;
const FAILURE_COOLDOWN_MS = 60_000;

const LESSON_RULES = [
  "You plan step-by-step drawing lessons for children aged 5 and up.",
  `Make ${MIN_STEPS + 1} to ${MAX_STEPS - 1} steps. Big shapes first, small details last.`,
  "Each step adds only a few new shapes. Never repeat shapes from earlier steps.",
  `Shapes are drawn as plain outlines on a ${VIEW_W} by ${VIEW_H} grid. x goes 0 to ${VIEW_W} left to right, y goes 0 to ${VIEW_H} top to bottom. Keep everything inside the grid with a margin of 10.`,
  'Shape kinds: {"kind":"circle","cx","cy","r"}, {"kind":"ellipse","cx","cy","rx","ry"}, {"kind":"rect","x","y","w","h"}, {"kind":"line","x1","y1","x2","y2"}, {"kind":"polyline","points":[[x,y],...]}, {"kind":"path","d":"M ... "} (path d uses only M L Q C Z and numbers). All values are numbers.',
  "Words: short, simple, warm. title at most 6 words. copy is one or two sentences a 5-year-old can follow, at most 30 words. demo is one short caption, at most 10 words.",
  "Never mention brands, company-owned characters, real people, or anything scary.",
  'Reply with JSON only: {"steps":[{"title":"...","copy":"...","demo":"...","shapes":[...]}]}',
].join("\n");

const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const xOk = (v) => num(v, -5, VIEW_W + 5);
const yOk = (v) => num(v, -5, VIEW_H + 5);
const sizeOk = (v) => num(v, 0.5, Math.max(VIEW_W, VIEW_H));
const round = (v) => Math.round(v * 10) / 10;

/** Returns a cleaned shape, or null if anything about it is off. */
export function cleanShape(s) {
  if (!s || typeof s !== "object") return null;
  switch (s.kind) {
    case "circle":
      return xOk(s.cx) && yOk(s.cy) && sizeOk(s.r) ? { kind: "circle", cx: round(s.cx), cy: round(s.cy), r: round(s.r) } : null;
    case "ellipse":
      return xOk(s.cx) && yOk(s.cy) && sizeOk(s.rx) && sizeOk(s.ry)
        ? { kind: "ellipse", cx: round(s.cx), cy: round(s.cy), rx: round(s.rx), ry: round(s.ry) }
        : null;
    case "rect":
      return xOk(s.x) && yOk(s.y) && sizeOk(s.w) && sizeOk(s.h)
        ? { kind: "rect", x: round(s.x), y: round(s.y), w: round(s.w), h: round(s.h) }
        : null;
    case "line":
      return xOk(s.x1) && yOk(s.y1) && xOk(s.x2) && yOk(s.y2)
        ? { kind: "line", x1: round(s.x1), y1: round(s.y1), x2: round(s.x2), y2: round(s.y2) }
        : null;
    case "polyline": {
      if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > 40) return null;
      const pts = [];
      for (const p of s.points) {
        if (!Array.isArray(p) || p.length !== 2 || !xOk(p[0]) || !yOk(p[1])) return null;
        pts.push([round(p[0]), round(p[1])]);
      }
      return { kind: "polyline", points: pts };
    }
    case "path": {
      if (typeof s.d !== "string" || s.d.length > MAX_PATH_CHARS) return null;
      if (!/^[MLQCZmlqcz0-9.,\s-]+$/.test(s.d) || !/^\s*[Mm]/.test(s.d)) return null;
      // Every number in the path must sit near the grid.
      const nums = s.d.match(/-?\d*\.?\d+/g) ?? [];
      if (nums.length < 2 || nums.some((n) => Math.abs(Number(n)) > Math.max(VIEW_W, VIEW_H) + 10)) return null;
      return { kind: "path", d: s.d.replace(/\s+/g, " ").trim() };
    }
    default:
      return null;
  }
}

function cleanText(v, maxChars) {
  if (typeof v !== "string") return null;
  const t = v.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return t && t.length <= maxChars ? t : null;
}

/** Validates Gemini's lesson. Returns { ok, steps } with shapes kept, or { ok: false }. */
// Step titles are sent back to the coach as the lesson context, and muse.js only accepts
// this alphabet there, so a title outside it would make Sunny's check-ins fail.
const TITLE_PATTERN = /^[\p{L}\p{N} .,'!?&-]{1,60}$/u;

export function cleanLesson(raw) {
  const steps = raw?.steps;
  if (!Array.isArray(steps) || steps.length < MIN_STEPS || steps.length > MAX_STEPS) return { ok: false };
  const out = [];
  for (const step of steps) {
    const title = cleanText(step?.title, 60);
    const copy = cleanText(step?.copy, 240);
    const demo = cleanText(step?.demo, 90);
    if (!title || !TITLE_PATTERN.test(title) || !copy || !demo || !Array.isArray(step.shapes)) return { ok: false };
    const shapes = step.shapes.slice(0, MAX_SHAPES_PER_STEP).map(cleanShape).filter(Boolean);
    if (shapes.length === 0) return { ok: false };
    out.push({ title, copy, demo, shapes });
  }
  return { ok: true, steps: out };
}

function shapeSvg(s, stroke, width) {
  const a = `fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (s.kind) {
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" ${a}/>`;
    case "ellipse":
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" ${a}/>`;
    case "rect":
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="2" ${a}/>`;
    case "line":
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ${a}/>`;
    case "polyline":
      return `<polyline points="${s.points.map((p) => p.join(",")).join(" ")}" ${a}/>`;
    case "path":
      return `<path d="${s.d}" ${a}/>`;
    default:
      return "";
  }
}

/** Picture for step index i: earlier steps in soft gray, this step's new shapes in coral. */
export function stepPicture(steps, i) {
  const earlier = steps.slice(0, i).flatMap((s) => s.shapes).map((s) => shapeSvg(s, "#B8B0A3", 2.5));
  const current = steps[i].shapes.map((s) => shapeSvg(s, "#E97962", 3.5));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}">` +
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="#FFFDF7"/>` +
    earlier.join("") +
    current.join("") +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseJson(text) {
  const t = (text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function generateLesson(id, { ai, model }) {
  const { title, style } = LESSON_CATALOG[id];
  const ask = (extra = "") =>
    withTimeout(
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: `Lesson: ${title}.\nStyle: ${STYLE_HINTS[style]}${extra}` }] }],
        // Same strict Google filters and short thinking as Sunny's replies (see muse.js).
        config: {
          systemInstruction: LESSON_RULES,
          safetySettings: SAFETY_SETTINGS.map((setting) => ({ ...setting })),
          thinkingConfig: { thinkingLevel: THINKING_LEVEL },
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      }),
      UPSTREAM_TIMEOUT_MS,
    );

  // One retry if the first answer is not usable.
  for (const extra of ["", "\nYour last answer was not valid. Follow the JSON format and shape rules exactly."]) {
    const lesson = cleanLesson(parseJson((await ask(extra)).text));
    if (lesson.ok && !anyUnsafe(lesson.steps.flatMap((s) => [s.title, s.copy, s.demo]))) {
      return lesson.steps.map((step, i) => ({
        title: step.title,
        copy: step.copy,
        demo: step.demo,
        imageUrl: stepPicture(lesson.steps, i),
      }));
    }
  }
  throw new Error("unusable lesson");
}

/**
 * Builds the lesson service: one Gemini call per lesson id, shared by concurrent callers.
 *
 * A lesson that fails is not asked for again for `cooldownMs`. Without that, anyone could
 * keep requesting a failing lesson and make us pay for two Gemini calls each time.
 * `getLesson.warm()` generates every catalog lesson in the background, one at a time, so a
 * child opening a lesson almost never waits for Gemini. `now` is injectable for tests.
 */
export function createLessonService({ ai, model, now = Date.now, cooldownMs = FAILURE_COOLDOWN_MS }) {
  const ready = new Map(); // id -> steps
  const pending = new Map(); // id -> Promise<steps>
  const failedAt = new Map(); // id -> time of the last failure

  async function getLesson(id) {
    if (!Object.hasOwn(LESSON_CATALOG, id)) return { status: 404, body: { error: "Unknown lesson" } };
    if (ready.has(id)) return { status: 200, body: { steps: ready.get(id) } };
    const lastFailure = failedAt.get(id);
    if (lastFailure !== undefined && now() - lastFailure < cooldownMs) {
      return { status: 502, body: { error: "Lesson not available right now." } };
    }
    if (!pending.has(id)) {
      pending.set(
        id,
        generateLesson(id, { ai, model })
          .then((steps) => {
            ready.set(id, steps);
            failedAt.delete(id);
            return steps;
          })
          .catch((err) => {
            failedAt.set(id, now());
            throw err;
          })
          .finally(() => pending.delete(id)),
      );
    }
    try {
      return { status: 200, body: { steps: await pending.get(id) } };
    } catch {
      // The app falls back to its built-in steps on any non-200 answer.
      return { status: 502, body: { error: "Lesson not available right now." } };
    }
  }

  /** Generates every lesson not yet ready, one after another. Never throws. Returns how many are ready. */
  getLesson.warm = async () => {
    for (const id of Object.keys(LESSON_CATALOG)) await getLesson(id);
    return ready.size;
  };

  return getLesson;
}
