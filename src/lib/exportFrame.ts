export const FRAME_SCALE = 0.5;
export const FRAME_QUALITY = 0.7;
const PAPER_COLOR = "#fffdf7";

/**
 * Turns the drawing canvas into a small JPEG data URL for the model broker.
 * The copy is half the source size and flattened onto the paper color first, because
 * JPEG has no alpha channel and transparent pixels would otherwise turn black.
 */
export function exportFrame(source: HTMLCanvasElement): string {
  const width = Math.max(1, Math.round(source.width * FRAME_SCALE));
  const height = Math.max(1, Math.round(source.height * FRAME_SCALE));
  const frame = document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  const ctx = frame.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return frame.toDataURL("image/jpeg", FRAME_QUALITY);
}
