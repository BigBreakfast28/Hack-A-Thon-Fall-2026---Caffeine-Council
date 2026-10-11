import test from "node:test";
import assert from "node:assert/strict";
import { RULE_LIMITS, RULE_MARKS } from "./ruleOptions.js";
import { anyUnsafe, isUnsafe, normalizeForCheck } from "./safety.js";
import { EXTRA_ALLOWED_WORDS, EXTRA_BLOCKED_WORDS, SAFE_REDIRECT } from "./safetyTerms.js";

// These lists were used to tune the filter, so a pass here shows the known cases work, not how
// well it does on text it has never seen. Treat it as a floor, not a measurement.
const SWEARS = [
  "fuck", "what the fuck", "FUCK", "FuCk", "sh1t", "$hit", "f*ck", "fuuuuck", "f u c k", "f.u.c.k", "f-u-c-k",
  "ｆｕｃｋ", "fυck", "fück", "f\u200bu\u200bck", "fvck", "phuck", "fuk", "asshole", "a55hole", "b!tch", "bitch", "biatch",
  "d1ck", "dick", "cunt", "bastard", "pu55y", "motherfucker", "bullshit", "dumbass", "jackass", "you are a bitch",
];
const POTTY = [
  "poop", "poopy", "p00p", "p o o p", "po0p", "pooooop", "poo-poo", "fart", "farting", "f4rt", "butt", "butts", "b u t t",
  "bu77", "turd", "pee", "peepee", "pee pee", "craaap", "tinkle", "boobies", "draw a big poop", "draw a fart cloud",
  "the butt of the horse",
];
const HARMLESS = [
  "I live in Scunthorpe", "a classic bass guitar class", "assassin", "assistance", "assess", "class", "pass", "grass",
  "butter", "butterfly", "button", "button up", "peek", "peach", "peacock", "pencil", "peel", "poodle", "pool", "pond",
  "bubble", "but then", "grape", "banana", "Essex", "Sussex", "Dickens", "Hancock", "cocktail", "analysis", "therapist",
  "bassoon", "document", "scrap", "scrapbook", "compass", "skunk", "pumpkin", "puppy", "shiitake", "cockpit", "Penistone",
  "an airplane cockpit", "hello", "Draw a house", "Make a happy robot", "Add a rainbow over the hills",
  "Draw a sun with 5 long rays", "step 3: add windows", "Only straight lines", "Without lifting my hand",
  "You used lots of small lines to make the fur. What will you add next?",
  "Update: 40 strokes, 130 s. Last picture: a red house with two windows and a sun.",
];

test("swear words and their common disguises are blocked", () => {
  const missed = SWEARS.filter((text) => !isUnsafe(text));
  assert.deepEqual(missed, []);
});

test("potty words are blocked too: zero tolerance", () => {
  const missed = POTTY.filter((text) => !isUnsafe(text));
  assert.deepEqual(missed, []);
  for (const word of EXTRA_BLOCKED_WORDS) assert.equal(isUnsafe(`draw a ${word}`), true, word);
});

test("ordinary words that merely look like blocked ones are not blocked", () => {
  const wrong = HARMLESS.filter((text) => isUnsafe(text));
  assert.deepEqual(wrong, []);
  for (const word of EXTRA_ALLOWED_WORDS) assert.equal(isUnsafe(`an ${word}`), false, word);
});

test("a number on its own is never read as a disguised word, but digits inside a word still are", () => {
  // "455" read as leetspeak is "ass": a child who drew for 455 seconds must not be blocked.
  assert.equal(isUnsafe("Update: 0 strokes, 455 s."), false);
  assert.equal(isUnsafe("Update: 12 strokes, 717 s."), false);
  assert.equal(isUnsafe("You made 17 lines! What next?"), false);
  assert.equal(normalizeForCheck("455 s"), "  s");
  // Digits next to letters are the disguise, so these stay blocked.
  for (const text of ["sh1t", "p00p", "5h1t", "a55hole", "f4rt", "b1tch", "455 asshole", "1 asshole"]) {
    assert.equal(isUnsafe(text), true, text);
  }
});

test("every progress note the server writes passes the filter, for any plausible numbers", () => {
  const blocked = [];
  for (let strokes = 0; strokes <= 150; strokes += 1) {
    for (let seconds = 0; seconds <= 1500; seconds += 1) {
      const note = `Update: ${strokes} strokes, ${seconds} s.`;
      if (isUnsafe(note)) blocked.push(note);
    }
  }
  assert.deepEqual(blocked.slice(0, 5), []);
});

test("every word in the rule menu passes, so a child can never be blocked by their own picks", () => {
  for (const option of [...RULE_MARKS, ...RULE_LIMITS]) {
    assert.equal(isUnsafe(option.label), false, option.label);
    assert.equal(isUnsafe(option.phrase), false, option.phrase);
  }
  assert.equal(isUnsafe(SAFE_REDIRECT), false);
});

test("the pairs of menu words are safe in any combination", () => {
  for (const mark of RULE_MARKS) {
    for (const limit of RULE_LIMITS) assert.equal(isUnsafe(`draw ${mark.phrase}, ${limit.phrase}`), false);
  }
});

test("hidden characters and huge input do not get around or slow down the check", () => {
  assert.equal(isUnsafe("p\u200bo\u200bo\u200bp"), true);
  assert.equal(isUnsafe("po\u00adop"), true);
  const started = performance.now();
  assert.equal(isUnsafe("a ".repeat(200_000)), false);
  assert.ok(performance.now() - started < 2000);
});

test("non-text and empty values count as safe (there is nothing to check)", () => {
  for (const value of [undefined, null, 5, {}, [], "", true]) assert.equal(isUnsafe(value), false);
  assert.equal(anyUnsafe([undefined, "hello", null]), false);
  assert.equal(anyUnsafe(["hello", "what the fuck"]), true);
  assert.equal(anyUnsafe([]), false);
});

test("checking text never prints, logs or throws, even for blocked text", () => {
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const printed = [];
  for (const key of Object.keys(original)) console[key] = (...args) => printed.push(args.join(" "));
  try {
    isUnsafe("what the fuck");
    isUnsafe("p o o p");
    isUnsafe("a perfectly nice drawing");
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(printed, []);
});

test("the redirect line is friendly and never repeats what was blocked", () => {
  assert.match(SAFE_REDIRECT, /different idea/);
  assert.match(SAFE_REDIRECT, /\?$/);
  assert.doesNotMatch(SAFE_REDIRECT, /sorry|bad|wrong|naughty|not allowed|rude/i);
});
