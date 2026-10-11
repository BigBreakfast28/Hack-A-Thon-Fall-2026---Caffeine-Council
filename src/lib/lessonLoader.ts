// Loads lesson steps without making a child wait.
//
// The server plans lessons with Gemini, which can take several seconds the first time. This
// loader gives the server a short time to answer; if it is slower, the child gets the app's
// built-in steps right away. The request keeps running in the background, so the next time
// the lesson is opened the finished steps are already here. Finished steps are kept in memory
// only (lost on reload), and a failed request is never kept, so it can be tried again.
//
// Nothing here touches the network or the environment by itself: the caller passes in the
// function that fetches steps, which keeps this file testable and free of browser storage.

export type LoaderOptions<Step> = {
  /** Fetches one lesson's steps. Resolves to null when the server has none or fails. */
  fetchSteps: (id: string) => Promise<Step[] | null>;
  /** How long the child may wait for the server before the built-in steps are used. */
  waitMs: number;
};

export function createLessonLoader<Step>({ fetchSteps, waitMs }: LoaderOptions<Step>) {
  const ready = new Map<string, Step[]>();
  const inFlight = new Map<string, Promise<Step[] | null>>();

  /** Starts (or joins) the fetch for one lesson. Shared by every caller until it finishes. */
  function load(id: string): Promise<Step[] | null> {
    const done = ready.get(id);
    if (done) return Promise.resolve(done);
    const running = inFlight.get(id);
    if (running) return running;
    const started = Promise.resolve()
      .then(() => fetchSteps(id))
      .catch(() => null)
      .then((steps) => {
        if (steps) ready.set(id, steps);
        return steps;
      })
      .finally(() => inFlight.delete(id));
    inFlight.set(id, started);
    return started;
  }

  return {
    /**
     * The server's steps if they arrive within `waitMs` (or are already here), otherwise
     * `fallback`. A slow request is not cancelled: it fills the cache for next time.
     */
    async get(id: string, fallback: Step[]): Promise<Step[]> {
      const done = ready.get(id);
      if (done) return done;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tooSlow = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), waitMs);
      });
      try {
        return (await Promise.race([load(id), tooSlow])) ?? fallback;
      } finally {
        clearTimeout(timer);
      }
    },

    /** Starts fetching these lessons now so they are ready when the child taps one. Never throws. */
    prefetch(ids: string[]): void {
      for (const id of ids) void load(id);
    },

    /** Forgets everything kept in memory. */
    clear(): void {
      ready.clear();
    },
  };
}
