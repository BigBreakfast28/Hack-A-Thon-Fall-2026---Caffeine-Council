import type { CanvasMetrics } from "../hooks/useStatelessStream";

// Drawing statistics for the coach. Everything lives in this plain object, never in React
// state, and only four numbers and a short color list ever leave it. Stroke coordinates are
// kept for the stroke being drawn, classified when it ends, and then thrown away.

type Point = { x: number; y: number };

export const STROKE_KINDS = ["dot", "line", "loop", "zigzag", "curve"] as const;
export type StrokeKind = (typeof STROKE_KINDS)[number];

const MIN_POINT_SPACING = 6; // px; ignores jitter when classifying
const SHARP_TURN_RADIANS = (60 * Math.PI) / 180;
const MAX_POINTS_PER_STROKE = 2000;
const MAX_PAUSE_MS = 5000; // pauses longer than this do not count as drawing time
const MIN_COLOR_SHARE = 0.1; // a color counts once it is in at least 10% of the strokes
const MIN_STROKES_FOR_DIVERSITY = 5;

// What is kept about a finished stroke, on this device only: its kind, size, color and when it
// ended. There are no coordinates in it. It lets the app check a lesson step or the child's own
// rule, and only counts of those checks ever leave the device.
export type StrokeSummary = { kind: StrokeKind; length: number; width: number; height: number; color: string; endedAtMs: number };

const MAX_SUMMARIES = 1000;

/** Length and bounding-box size of a stroke, in pixels. */
export function strokeGeometry(points: Point[]): { length: number; width: number; height: number } {
  let length = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((point, i) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    if (i > 0) length += Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y);
  });
  if (points.length === 0) return { length: 0, width: 0, height: 0 };
  return { length: Math.round(length), width: Math.round(maxX - minX), height: Math.round(maxY - minY) };
}

export function classifyStroke(points: Point[]): StrokeKind {
  if (points.length < 2) return "dot";

  const kept: Point[] = [points[0]];
  for (const point of points.slice(1)) {
    const last = kept[kept.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) >= MIN_POINT_SPACING) kept.push(point);
  }
  if (kept.length < 2) return "dot";

  let length = 0;
  let sharpTurns = 0;
  let previousAngle: number | null = null;
  for (let i = 1; i < kept.length; i++) {
    const dx = kept[i].x - kept[i - 1].x;
    const dy = kept[i].y - kept[i - 1].y;
    length += Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    if (previousAngle !== null) {
      let change = Math.abs(angle - previousAngle);
      if (change > Math.PI) change = 2 * Math.PI - change;
      if (change > SHARP_TURN_RADIANS) sharpTurns += 1;
    }
    previousAngle = angle;
  }
  if (length < 12) return "dot";

  const first = kept[0];
  const last = kept[kept.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);

  if (sharpTurns >= 3) return "zigzag";
  if (length > 40 && chord < 0.25 * length) return "loop";
  if (chord / length > 0.9) return "line";
  return "curve";
}

/** Normalized Shannon entropy of the stroke kinds, from 0 (all alike) to 1 (evenly mixed). */
export function shapeDiversity(counts: Record<StrokeKind, number>): number {
  const total = STROKE_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
  if (total < MIN_STROKES_FOR_DIVERSITY) return 0;
  let entropy = 0;
  for (const kind of STROKE_KINDS) {
    const share = counts[kind] / total;
    if (share > 0) entropy -= share * Math.log2(share);
  }
  return Math.round((entropy / Math.log2(STROKE_KINDS.length)) * 100) / 100;
}

export function createStrokeTracker() {
  let strokeCount = 0;
  let activeMs = 0;
  let lastEventAt: number | null = null;
  let current: Point[] | null = null;
  let currentColor = "";
  const kinds: Record<StrokeKind, number> = { dot: 0, line: 0, loop: 0, zigzag: 0, curve: 0 };
  const colors = new Map<string, number>();
  const summaries: StrokeSummary[] = [];
  let dropped = 0; // summaries pushed out of the cap, so indexes stay absolute

  const tick = (nowMs: number) => {
    if (lastEventAt !== null) activeMs += Math.min(Math.max(nowMs - lastEventAt, 0), MAX_PAUSE_MS);
    lastEventAt = nowMs;
  };

  return {
    beginStroke(x: number, y: number, color: string, nowMs: number) {
      tick(nowMs);
      current = [{ x, y }];
      currentColor = color;
    },
    addPoint(x: number, y: number) {
      if (current && current.length < MAX_POINTS_PER_STROKE) current.push({ x, y });
    },
    endStroke(nowMs: number) {
      if (!current) return;
      tick(nowMs);
      const kind = classifyStroke(current);
      kinds[kind] += 1;
      strokeCount += 1;
      colors.set(currentColor, (colors.get(currentColor) ?? 0) + 1);
      summaries.push({ kind, ...strokeGeometry(current), color: currentColor, endedAtMs: nowMs });
      if (summaries.length > MAX_SUMMARIES) {
        summaries.shift();
        dropped += 1;
      }
      current = null;
    },
    strokeCount: () => strokeCount,
    /** Finished strokes from the given absolute stroke number on (0 is the first stroke drawn). Copies, never the live list. */
    summariesSince: (fromStroke: number): StrokeSummary[] =>
      summaries.slice(Math.max(0, fromStroke - dropped)).map((summary) => ({ ...summary })),
    /** The statistics the server expects, or null when nothing has been drawn yet. */
    snapshot(): CanvasMetrics | null {
      if (strokeCount === 0) return null;
      const ranked = [...colors.entries()].sort((a, b) => b[1] - a[1]);
      let primaryColors = ranked.filter(([, uses]) => uses / strokeCount >= MIN_COLOR_SHARE).map(([color]) => color);
      if (primaryColors.length === 0) primaryColors = [ranked[0][0]];
      return {
        durationSeconds: Math.round(activeMs / 1000),
        strokeCount,
        shapeDiversityScore: shapeDiversity(kinds),
        primaryColors,
      };
    },
    reset() {
      strokeCount = 0;
      activeMs = 0;
      lastEventAt = null;
      current = null;
      currentColor = "";
      for (const kind of STROKE_KINDS) kinds[kind] = 0;
      colors.clear();
      summaries.length = 0;
      dropped = 0;
    },
  };
}

export type StrokeTracker = ReturnType<typeof createStrokeTracker>;
