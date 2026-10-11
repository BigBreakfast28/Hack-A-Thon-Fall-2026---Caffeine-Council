// Decides when Sunny checks in on her own. The rule has not changed: after a pause in
// drawing, once there are enough new strokes since the last check-in. What this module
// fixes is how the pause is measured and what happens when a request is still running:
//  - the pause restarts when a new stroke begins, so a check-in cannot fire in the middle of
//    a stroke (the timer used to be armed only when a stroke ended and was never cleared);
//  - a check-in that comes due while a request is still pending is tried again after another
//    pause, instead of being dropped until the child finishes another stroke.
// It deliberately does not retry after a failed request. `markSent` is called when a request
// goes out, so a failure waits for a whole round of new strokes. That doubles as a backoff:
// with the server down or the app locked, the same error does not repeat after every pause.
//
// Pure logic with injectable timers, so it is tested without a browser (checkInScheduler.test.mjs).

export type CheckInTimers = {
  set: (callback: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

export type CheckInOptions = {
  /** How long the child must stop drawing before Sunny may check in. */
  pauseMs: number;
  /** How many strokes must be new since the last check-in. */
  minNewStrokes: number;
  strokeCount: () => number;
  /** True while a request to the coach is still running. */
  isPending: () => boolean;
  /** Sends the check-in. Must call `markSent` itself when it actually sends one. */
  ask: () => void | Promise<void>;
  timers?: CheckInTimers;
};

const browserTimers: CheckInTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
};

export function createCheckInScheduler(options: CheckInOptions) {
  const timers = options.timers ?? browserTimers;
  let sent = 0;
  let handle: unknown;

  const clear = () => {
    if (handle !== undefined) timers.clear(handle);
    handle = undefined;
  };

  const arm = () => {
    clear();
    handle = timers.set(fire, options.pauseMs);
  };

  function fire() {
    handle = undefined;
    if (options.strokeCount() - sent < options.minNewStrokes) return;
    // A request is still running: try again after another pause rather than dropping the check-in.
    if (options.isPending()) {
      arm();
      return;
    }
    void options.ask();
  }

  return {
    /** A stroke began, so the child has not paused: cancel any check-in that was about to fire. */
    strokeStarted: clear,
    /** A stroke ended: start the pause. */
    strokeEnded: arm,
    /** A request went out when the child had drawn this many strokes. */
    markSent: (count: number) => {
      sent = count;
    },
    /** The canvas was cleared. */
    reset: () => {
      clear();
      sent = 0;
    },
    /** The screen is closing. */
    stop: clear,
  };
}

export type CheckInScheduler = ReturnType<typeof createCheckInScheduler>;
