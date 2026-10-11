// Run with: npm run test:client   (Node strips the TypeScript types on import)
import test from "node:test";
import assert from "node:assert/strict";
import { createLessonLoader } from "./lessonLoader.ts";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FALLBACK = [{ title: "built-in" }];
const SERVER = [{ title: "from the server" }];

test("a quick server: the child gets the server's steps", async () => {
  const loader = createLessonLoader({ fetchSteps: async () => SERVER, waitMs: 200 });
  assert.deepEqual(await loader.get("a", FALLBACK), SERVER);
});

test("a slow server: the child is not kept waiting, and the finished steps are there next time", async () => {
  let calls = 0;
  const loader = createLessonLoader({
    fetchSteps: async () => {
      calls += 1;
      await wait(100);
      return SERVER;
    },
    waitMs: 20,
  });
  const started = Date.now();
  assert.deepEqual(await loader.get("a", FALLBACK), FALLBACK);
  assert.ok(Date.now() - started < 90, "gave up waiting after about waitMs, not after the server finished");

  await wait(150); // the background request finishes
  const again = Date.now();
  assert.deepEqual(await loader.get("a", FALLBACK), SERVER);
  assert.ok(Date.now() - again < 20, "instant from memory");
  assert.equal(calls, 1, "the slow request was not cancelled or repeated");
});

test("a failed or empty answer gives the built-in steps and is not remembered", async () => {
  const answers = [null, SERVER];
  let calls = 0;
  const loader = createLessonLoader({ fetchSteps: async () => answers[calls++], waitMs: 200 });
  assert.deepEqual(await loader.get("a", FALLBACK), FALLBACK);
  assert.deepEqual(await loader.get("a", FALLBACK), SERVER);
  assert.equal(calls, 2);

  let threw = 0;
  const failing = createLessonLoader({
    fetchSteps: async () => {
      threw += 1;
      throw new Error("network down");
    },
    waitMs: 200,
  });
  assert.deepEqual(await failing.get("a", FALLBACK), FALLBACK);
  assert.deepEqual(await failing.get("a", FALLBACK), FALLBACK);
  assert.equal(threw, 2, "tried again each time, since nothing was kept");

  // Even a fetch that throws before returning a promise cannot break the child's screen.
  const sync = createLessonLoader({ fetchSteps: () => { throw new Error("sync"); }, waitMs: 50 });
  assert.deepEqual(await sync.get("a", FALLBACK), FALLBACK);
});

test("callers at the same moment share one request", async () => {
  let calls = 0;
  const loader = createLessonLoader({
    fetchSteps: async () => {
      calls += 1;
      await wait(20);
      return SERVER;
    },
    waitMs: 200,
  });
  loader.prefetch(["a"]);
  const results = await Promise.all([loader.get("a", FALLBACK), loader.get("a", FALLBACK), loader.get("a", FALLBACK)]);
  assert.ok(results.every((steps) => steps === results[0]));
  assert.equal(calls, 1);
});

test("prefetch has lessons ready before the child taps one, and a lesson is fetched once", async () => {
  const seen = [];
  const loader = createLessonLoader({
    fetchSteps: async (id) => {
      seen.push(id);
      await wait(10);
      return [{ title: id }];
    },
    waitMs: 1,
  });
  loader.prefetch(["a", "b", "c"]);
  loader.prefetch(["b", "c"]);
  await wait(60);
  // waitMs is 1 ms here, so these only succeed because the steps are already in memory.
  assert.deepEqual(await loader.get("a", FALLBACK), [{ title: "a" }]);
  assert.deepEqual(await loader.get("c", FALLBACK), [{ title: "c" }]);
  assert.deepEqual(seen.sort(), ["a", "b", "c"]);
});

test("prefetch never throws, even when every request fails", async () => {
  const loader = createLessonLoader({ fetchSteps: async () => { throw new Error("no"); }, waitMs: 20 });
  assert.doesNotThrow(() => loader.prefetch(["a", "b"]));
  await wait(20);
  assert.deepEqual(await loader.get("a", FALLBACK), FALLBACK);
});

test("clear forgets the steps kept in memory", async () => {
  let version = 0;
  const loader = createLessonLoader({ fetchSteps: async () => [{ title: `v${++version}` }], waitMs: 100 });
  assert.deepEqual(await loader.get("a", FALLBACK), [{ title: "v1" }]);
  assert.deepEqual(await loader.get("a", FALLBACK), [{ title: "v1" }]);
  loader.clear();
  assert.deepEqual(await loader.get("a", FALLBACK), [{ title: "v2" }]);
});
