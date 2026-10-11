// Our own additions to the open-source word list. The product rule is zero tolerance:
// swears, sexual words, slurs and potty words never reach the model and are never repeated.
// Common lists are built for adult chat and miss most of the potty words, so they are
// listed here. Each entry is matched as a whole word (so "butter" and "peek" are fine), and
// the matcher's leetspeak, repeated-letter and look-alike-character handling applies too.
//
// A harmless word will sometimes be blocked ("poop deck"). That is accepted: the child gets
// a friendly redirect, never a scolding, and the blocked text is never logged.

// Base forms plus the endings children actually use.
const POTTY_WORDS = [
  "poop", "poops", "pooped", "pooping", "poopy",
  "poo", "poos",
  "pee", "pees", "peed", "peeing", "peepee",
  "fart", "farts", "farted", "farting", "farty",
  "turd", "turds",
  "crap", "craps", "crappy",
  "butt", "butts", "butthead", "buttface", "booty",
  "wiener", "weiner", "willy",
  "boob", "boobs", "boobies",
  "nipple", "nipples",
  "tinkle",
  "snot",
];

// Spellings that get past the open-source lists in our own tests, and compound insults they miss.
const EVASIONS_AND_COMPOUNDS = ["phuck", "fvck", "fuk", "fuking", "fukin", "biatch", "dumbass", "jackass"];

export const EXTRA_BLOCKED_WORDS = [...new Set([...POTTY_WORDS, ...EVASIONS_AND_COMPOUNDS])];

// Whole words that contain or look like a blocked word but are harmless, found as false
// positives in the tests. They are removed from the text before checking, as whole words only.
// Add a word here only after a real false positive shows up in safety.test.js.
export const EXTRA_ALLOWED_WORDS = ["cockpit", "shiitake", "penistone"];

/** The only thing a child sees when something is blocked. Friendly, short, never names the word. */
export const SAFE_REDIRECT = "Let's pick a different idea for your picture. What would you like to try next?";
