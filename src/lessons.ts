// Lesson catalog and lesson steps.
//
// The screens never hardcode lesson text. They call getLessonSteps(), which:
//   1. asks the server (VITE_API_URL) for steps, if a server is set up, and
//   2. falls back to the starter steps below if there is no server yet
//      or the server fails, so the demo never breaks.
//
// See LESSON_API.md for what the server should send back.

import { createLessonLoader } from "./lib/lessonLoader";
import { cleanExpects, type StepExpects } from "./lib/strokeCheck";

export type IconName =
  | "apple"
  | "bamboo"
  | "city"
  | "lock"
  | "arrow"
  | "home"
  | "pencil"
  | "marker"
  | "brush"
  | "eraser"
  | "download"
  | "print"
  | "trash"
  | "sparkle"
  | "palette"
  | "room"
  | "train"
  | "building"
  | "fox";

export type StyleId = "realism" | "sumi-e" | "graphic-novel";

export type ArtStyle = {
  id: StyleId;
  title: string;
  subtitle: string;
  icon: IconName;
  tone: string;
};

export type Lesson = {
  id: string;
  style: StyleId;
  title: string;
  tags: string[];
  icon: IconName;
  tone: string;
};

export type LessonStep = {
  title: string; // short heading, e.g. "Let's find the room"
  copy: string; // the instruction the kid reads (and Sunny says)
  demo: string; // one-line caption under the picture
  imageUrl?: string; // optional picture for this step (AI-generated or a file)
  // For each shape in the step, the stroke kinds that could draw it. Only the lesson server sends
  // this. With it the app can tell, on the device, when the child has drawn what the step asks for.
  expects?: StepExpects;
};

export const styles: ArtStyle[] = [
  { id: "realism", title: "Realism", subtitle: "Draw what you see", icon: "apple", tone: "peach" },
  { id: "sumi-e", title: "Sumi-e", subtitle: "Paint with ink", icon: "bamboo", tone: "sage" },
  { id: "graphic-novel", title: "Graphic Novel", subtitle: "Tell a story", icon: "city", tone: "blue" },
];

export const lessons: Lesson[] = [
  { id: "cozy-room", style: "realism", title: "Cozy room", tags: ["Perspective", "Color"], icon: "room", tone: "peach" },
  { id: "little-train", style: "realism", title: "Little train", tags: ["Shapes", "Shading"], icon: "train", tone: "blue" },
  { id: "tall-building", style: "realism", title: "Tall building", tags: ["Perspective"], icon: "building", tone: "yellow" },
  { id: "friendly-fox", style: "realism", title: "Friendly fox", tags: ["Shapes", "Animals"], icon: "fox", tone: "peach" },
  { id: "bamboo-stalk", style: "sumi-e", title: "Bamboo stalk", tags: ["Brush strokes"], icon: "bamboo", tone: "sage" },
  { id: "ink-apple", style: "sumi-e", title: "Ink apple", tags: ["Shapes", "Shading"], icon: "apple", tone: "peach" },
  { id: "city-panel", style: "graphic-novel", title: "City panel", tags: ["Perspective", "Story"], icon: "city", tone: "blue" },
  { id: "train-adventure", style: "graphic-novel", title: "Train adventure", tags: ["Shapes", "Story"], icon: "train", tone: "yellow" },
];

export function styleById(id: StyleId): ArtStyle {
  return styles.find((s) => s.id === id) ?? styles[0];
}

export function lessonsForStyle(id: StyleId): Lesson[] {
  return lessons.filter((l) => l.style === id);
}

// Starter steps, used until the server is connected.
const starterSteps: Record<string, LessonStep[]> = {
  "cozy-room": [
    { title: "Let's find the room", copy: "Start with one big, soft rectangle. It can be wobbly. Rooms are cozy that way.", demo: "One big rectangle makes the room." },
    { title: "Add a cozy corner", copy: "Draw two gentle lines toward the middle. Now your room has walls and a floor.", demo: "Two lines give the room depth." },
    { title: "Make it feel like home", copy: "Add a window, a chair, or your favorite toy. Pick one thing you would love in your room.", demo: "Simple shapes become favorite things." },
    { title: "Final touches", copy: "Look for one empty spot. Add a tiny detail or a splash of color.", demo: "A final detail makes it yours." },
  ],
  "little-train": [
    { title: "Start with a box", copy: "Draw a long rectangle near the bottom of your paper. That's the train car.", demo: "A long box is the train's body." },
    { title: "Add the wheels", copy: "Draw two or three circles under the box. Make them touch the bottom.", demo: "Circles make it roll." },
    { title: "Build the engine", copy: "Add a tall square on one end and a little chimney on top.", demo: "The engine leads the way." },
    { title: "Add some shadow", copy: "Color one side of each wheel a little darker. Now they look round!", demo: "Dark sides make things look round." },
  ],
  "tall-building": [
    { title: "Draw a tall box", copy: "Make a tall, skinny rectangle from the bottom of your paper up high.", demo: "Tall and skinny makes a building." },
    { title: "Add the windows", copy: "Draw rows of small squares, one row at a time.", demo: "Rows of windows show the floors." },
    { title: "Add a door", copy: "Draw a door at the bottom, right in the middle.", demo: "Every building needs a way in." },
    { title: "Make it stand out", copy: "Color the sky behind it. Your building will pop!", demo: "A colored sky makes it shine." },
  ],
  "friendly-fox": [
    { title: "Draw the big head", copy: "Draw one big round shape for the fox's head. It can be wobbly.", demo: "A big round head." },
    { title: "Add two pointy ears", copy: "Draw a little pointy hat on each side of the top of the head.", demo: "Two ears on top." },
    { title: "Give it a face", copy: "Add two small eyes and a little nose. You pick where they go.", demo: "Eyes and a nose." },
    { title: "Add a bushy tail", copy: "Draw a big curvy tail next to your fox. Make it as fluffy as you like.", demo: "A big curvy tail." },
  ],
  "bamboo-stalk": [
    { title: "One long stroke", copy: "Use the brush. Pull one long line from the bottom to the top, slowly.", demo: "Bamboo grows in one long stroke." },
    { title: "Add the joints", copy: "Make small lines across the stalk, spaced out like steps.", demo: "Little lines show where it grows." },
    { title: "Add leaves", copy: "Press and lift the brush to make pointy leaves.", demo: "Press, then lift, makes a leaf." },
  ],
  "ink-apple": [
    { title: "Draw a round shape", copy: "Make a big circle with a little dip at the top.", demo: "An apple is a circle with a dip." },
    { title: "Add the stem", copy: "Draw a short line coming out of the dip.", demo: "A tiny stem on top." },
    { title: "Add a shadow", copy: "Make one side darker with a few soft strokes.", demo: "One dark side makes it round." },
  ],
  "city-panel": [
    { title: "Draw the panel", copy: "Make a big box. This is your comic panel.", demo: "Every comic starts with a box." },
    { title: "Add the skyline", copy: "Draw tall and short rectangles along the bottom.", demo: "Different heights make a city." },
    { title: "Tell the story", copy: "Add a speech bubble. What is the city saying?", demo: "A bubble starts the story." },
  ],
  "train-adventure": [
    { title: "Draw the panel", copy: "Make a big box for your comic.", demo: "Start with a box." },
    { title: "Add the train", copy: "Draw a long box with circle wheels inside the panel.", demo: "Box plus circles makes a train." },
    { title: "Add action lines", copy: "Draw quick lines behind the train. Now it zooms!", demo: "Lines behind it show speed." },
  ],
};

function genericSteps(lesson: Lesson): LessonStep[] {
  return [
    { title: "Start big", copy: `Draw the biggest shape of your ${lesson.title.toLowerCase()} first.`, demo: "Big shapes come first." },
    { title: "Add the details", copy: "Now add the smaller parts, one at a time.", demo: "Little things come next." },
    { title: "Add color", copy: "Pick your favorite colors and fill it in.", demo: "Color brings it to life." },
  ];
}

function isValidSteps(data: unknown): data is LessonStep[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((s) => s && typeof s.title === "string" && typeof s.copy === "string" && typeof s.demo === "string")
  );
}

// The lesson server. VITE_API_URL wins; otherwise it is the same server as the coach
// (VITE_MUSE_WS_URL, e.g. wss://host/ws becomes https://host).
function lessonServer(): string | undefined {
  const explicit = import.meta.env.VITE_API_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, "");
  const ws = import.meta.env.VITE_MUSE_WS_URL as string | undefined;
  if (!ws) return undefined;
  try {
    const url = new URL(ws);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    return url.origin;
  } catch {
    return undefined;
  }
}

const API_URL = lessonServer();
// A child waits at most this long for the server's lesson. After that the built-in steps are
// used straight away, and the request carries on in the background so the next time the
// lesson is opened the finished steps are already here.
const LESSON_WAIT_MS = 6_000;
// How long that background request may run before it is given up (the server tries twice).
const LESSON_REQUEST_TIMEOUT_MS = 45_000;

async function fetchServerSteps(id: string): Promise<LessonStep[] | null> {
  const lesson = lessons.find((candidate) => candidate.id === id);
  if (!API_URL || !lesson) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LESSON_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/api/lessons/${encodeURIComponent(id)}?style=${lesson.style}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Server answered ${res.status}`);
    const body = await res.json();
    const steps = Array.isArray(body) ? body : body?.steps;
    if (!isValidSteps(steps)) throw new Error("Server sent steps in the wrong shape");
    // Keep only well-formed stroke hints; anything else is dropped and the step simply has none.
    return steps.map((step) => ({ ...step, expects: cleanExpects((step as { expects?: unknown }).expects) }));
  } catch (err) {
    console.warn("Using starter steps:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const loader = createLessonLoader<LessonStep>({ fetchSteps: fetchServerSteps, waitMs: LESSON_WAIT_MS });

export async function getLessonSteps(lesson: Lesson): Promise<LessonStep[]> {
  const fallback = starterSteps[lesson.id] ?? genericSteps(lesson);
  if (!API_URL) return fallback;
  return loader.get(lesson.id, fallback);
}

/** Starts loading these lessons from the server now, so they open instantly when tapped. */
export function prefetchLessonSteps(items: Lesson[]): void {
  if (API_URL) loader.prefetch(items.map((lesson) => lesson.id));
}
