// Run with: pnpm run test:client   (Node strips the TypeScript types on import)
import test from "node:test";
import assert from "node:assert/strict";
import { createCheckInScheduler } from "./checkInScheduler.ts";

const PAUSE = 4000; // the values App.tsx uses
const STROKES = 10;

// A virtual clock: timers run in order when time is advanced, so nothing here waits for real time.
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    timers: {
      set: (callback, ms) => {
        const id = nextId++;
        timers.set(id, { callback, at: now + ms });
        return id;
      },
      clear: (id) => timers.delete(id),
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = target;
    },
    outstanding: () => timers.size,
  };
}

// A scheduler wired like App.tsx: asking sends a request and marks the strokes as sent right away.
function setup({ strokes = 0, pending = false } = {}) {
  const state = { strokes, pending, asks: 0 };
  const clock = fakeClock();
  let scheduler;
  scheduler = createCheckInScheduler({
    pauseMs: PAUSE,
    minNewStrokes: STROKES,
    strokeCount: () => state.strokes,
    isPending: () => state.pending,
    ask: () => {
      state.asks += 1;
      scheduler.markSent(state.strokes);
    },
    timers: clock.timers,
  });
  return { state, clock, scheduler };
}

test("checks in once after a pause, when there are enough new strokes", () => {
  const { state, clock, scheduler } = setup({ strokes: 10 });
  scheduler.strokeEnded();
  clock.advance(PAUSE - 1);
  assert.equal(state.asks, 0);
  clock.advance(1);
  assert.equal(state.asks, 1);
  clock.advance(60_000);
  assert.equal(state.asks, 1); // not again: nothing new was drawn
});

test("does not check in with fewer than 10 new strokes", () => {
  const { state, clock, scheduler } = setup({ strokes: 9 });
  scheduler.strokeEnded();
  clock.advance(60_000);
  assert.equal(state.asks, 0);
});

test("a check-in never fires in the middle of a stroke", () => {
  const { state, clock, scheduler } = setup({ strokes: 10 });
  scheduler.strokeEnded(); // pause starts at 0 s
  clock.advance(3000);
  scheduler.strokeStarted(); // the child starts a long stroke before the pause is over
  clock.advance(10_000); // the stroke lasts well past the old 4 s mark
  assert.equal(state.asks, 0);
  assert.equal(clock.outstanding(), 0);
  state.strokes = 11;
  scheduler.strokeEnded();
  clock.advance(PAUSE);
  assert.equal(state.asks, 1);
});

test("a child who keeps drawing with short gaps is not interrupted, as before", () => {
  const { state, clock, scheduler } = setup();
  for (let i = 1; i <= 40; i++) {
    state.strokes = i;
    scheduler.strokeStarted();
    clock.advance(500);
    scheduler.strokeEnded();
    clock.advance(1000); // the gap between strokes is shorter than the pause
  }
  assert.equal(state.asks, 0);
  clock.advance(PAUSE); // they stop: now Sunny checks in
  assert.equal(state.asks, 1);
});

test("a check-in that comes due while a request is pending is retried, not dropped", () => {
  const { state, clock, scheduler } = setup({ strokes: 10, pending: true });
  scheduler.strokeEnded();
  clock.advance(PAUSE);
  assert.equal(state.asks, 0);
  assert.equal(clock.outstanding(), 1); // waiting for another pause
  clock.advance(PAUSE);
  assert.equal(state.asks, 0); // still pending: still waiting, one timer at a time
  assert.equal(clock.outstanding(), 1);
  state.pending = false;
  clock.advance(PAUSE);
  assert.equal(state.asks, 1);
  assert.equal(clock.outstanding(), 0);
});

test("a retry does not ask twice when the earlier request already covered those strokes", () => {
  const { state, clock, scheduler } = setup({ strokes: 10, pending: true });
  scheduler.strokeEnded();
  clock.advance(PAUSE); // due, but pending: re-armed
  scheduler.markSent(10); // the pending request was for these same strokes
  state.pending = false;
  clock.advance(PAUSE);
  assert.equal(state.asks, 0);
});

test("markSent spends the strokes, so a failed request waits for a whole new round", () => {
  const { state, clock, scheduler } = setup({ strokes: 10 });
  scheduler.strokeEnded();
  clock.advance(PAUSE);
  assert.equal(state.asks, 1);
  state.strokes = 19;
  scheduler.strokeEnded();
  clock.advance(PAUSE);
  assert.equal(state.asks, 1); // 9 new strokes: not yet
  state.strokes = 20;
  scheduler.strokeEnded();
  clock.advance(PAUSE);
  assert.equal(state.asks, 2);
});

test("reset clears the timer and the count; stop cancels a check-in that was about to fire", () => {
  const { state, clock, scheduler } = setup({ strokes: 10 });
  scheduler.strokeEnded();
  scheduler.reset();
  clock.advance(60_000);
  assert.equal(state.asks, 0);

  state.strokes = 10; // a fresh canvas that gets 10 strokes is asked about again
  scheduler.strokeEnded();
  clock.advance(PAUSE);
  assert.equal(state.asks, 1);

  state.strokes = 20;
  scheduler.strokeEnded();
  scheduler.stop();
  clock.advance(60_000);
  assert.equal(state.asks, 1);
});

test("ending strokes in a row keeps a single timer outstanding", () => {
  const { clock, scheduler } = setup({ strokes: 10 });
  for (let i = 0; i < 5; i++) scheduler.strokeEnded();
  assert.equal(clock.outstanding(), 1);
});
