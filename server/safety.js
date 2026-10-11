// Child-safety text check. One question, answered in one place: "may this text reach the
// model, or be shown to a child?" It is a heuristic layer, not a guarantee. It sits next to
// the model's own safety settings, the system prompt rules, and a fixed vocabulary for the
// rule picker. It never logs, stores or returns the text it checks.
//
// The word matching is done by two open-source libraries (obscenity and allprofanity, both
// MIT) plus our own word list. They are isolated in this file, so replacing one touches only
// this file. We chose to use both after comparing them on our own test set: each missed
// spellings the other caught.
import {
  DataSet,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  parseRawPattern,
  resolveConfusablesTransformer,
  resolveLeetSpeakTransformer,
  toAsciiLowerCaseTransformer,
} from "obscenity";
import { AllProfanity } from "allprofanity";
import { EXTRA_ALLOWED_WORDS, EXTRA_BLOCKED_WORDS } from "./safetyTerms.js";

const MAX_CHECKED_CHARS = 20_000;

// The library's own word list, with its recommended handling of leetspeak, look-alike
// characters and repeated letters.
function buildLibraryMatcher() {
  return new RegExpMatcher({ ...new DataSet().addAll(englishDataset).build(), ...englishRecommendedTransformers });
}

// Our own words get their own matcher. The library's recommended handling squeezes doubled
// letters ("butt" becomes "but"), which would make our patterns match the ordinary word "but"
// or never match at all, so ours skips that step. Stretched words such as "pooooop" are
// handled in `squeezeStretched` below instead.
function buildOwnMatcher() {
  const dataset = new DataSet();
  for (const word of EXTRA_BLOCKED_WORDS) {
    dataset.addPhrase((phrase) => phrase.setMetadata({ originalWord: word }).addPattern(parseRawPattern(`|${word}|`)));
  }
  return new RegExpMatcher({
    ...dataset.build(),
    blacklistMatcherTransformers: [
      resolveConfusablesTransformer(),
      resolveLeetSpeakTransformer(),
      toAsciiLowerCaseTransformer(),
    ],
  });
}

// A second open-source library as a second opinion. The two miss different spellings, so a
// text is blocked when either one flags it. English only, and quiet: it must not print.
function buildSecondOpinion() {
  const filter = new AllProfanity({ languages: ["english"], silent: true, enableLeetSpeak: true });
  filter.add(EXTRA_BLOCKED_WORDS);
  return filter;
}

const libraryMatcher = buildLibraryMatcher();
const ownMatcher = buildOwnMatcher();
const secondOpinion = buildSecondOpinion();
const ALLOWED_WORD_PATTERN = new RegExp(`\\b(?:${EXTRA_ALLOWED_WORDS.join("|")})\\b`, "giu");

/** "pooooop" becomes "poop": any run of three or more of the same letter is cut to two. */
function squeezeStretched(text) {
  return text.replace(/(\p{L})\1{2,}/giu, "$1$1");
}

function matches(text) {
  const checked = text.replace(ALLOWED_WORD_PATTERN, " ");
  return (
    libraryMatcher.hasMatch(checked) ||
    ownMatcher.hasMatch(checked) ||
    ownMatcher.hasMatch(squeezeStretched(checked)) ||
    secondOpinion.check(checked)
  );
}

/**
 * Prepares text for matching: Unicode compatibility form, zero-width and control characters
 * removed (they are used to split a word so a filter misses it), and a length cap so a huge
 * input cannot slow the check down.
 *
 * Numbers on their own are blanked out. The leetspeak step reads digits as letters (4 as a,
 * 5 as s), so without this a plain "455 s" in a progress note would read as a swear word.
 * A swear spelled with digits still has letters next to them ("sh1t", "p00p"), so it is kept.
 */
export function normalizeForCheck(text) {
  return String(text)
    .slice(0, MAX_CHECKED_CHARS)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, "")
    .replace(/(?<![\p{L}\p{N}])\d+(?![\p{L}\p{N}])/gu, " ");
}

/** True when the text contains blocked language. Non-strings count as safe (nothing to check). */
export function isUnsafe(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  const cleaned = normalizeForCheck(text);
  if (matches(cleaned)) return true;
  // Also check with separators between letters closed up, so "p.o.o.p" and "p o o p" are caught.
  // Only done when the text has at least three single letters in a row separated by dots,
  // dashes, underscores or spaces, to avoid running the closed-up form on ordinary sentences.
  const spacedLetters = /(?:^|[^\p{L}])(?:\p{L}[\s.\-_*]+){2,}\p{L}(?:$|[^\p{L}])/u;
  if (spacedLetters.test(cleaned)) {
    const closedUp = cleaned.replace(/(?<=\b\p{L})[\s.\-_*]+(?=\p{L}\b)/gu, "");
    if (matches(closedUp)) return true;
  }
  return false;
}

/** True if any of the given values is unsafe text. */
export function anyUnsafe(values) {
  return values.some((value) => isUnsafe(value));
}
