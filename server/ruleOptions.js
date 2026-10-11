// The fixed vocabulary for a child's own drawing rule. The child picks one mark and one limit
// from these lists, the client sends their ids, and only ids that appear here are accepted.
// No child-typed text ever reaches the model, which is what keeps this feature safe.
//
// src/lib/ruleOptions.ts must list the same ids and labels (a client test checks it).
// `phrase` is the wording the model is given; it is never sent to or from the client.
export const RULE_MARKS = [
  { id: "lines", label: "Only lines", phrase: "only straight lines" },
  { id: "dots", label: "Only dots", phrase: "only dots" },
  { id: "curves", label: "Only curves", phrase: "only curvy lines" },
  { id: "zigzags", label: "Only zigzags", phrase: "only zigzags" },
  { id: "loops", label: "Only loops", phrase: "only loops and circles" },
];

export const RULE_LIMITS = [
  { id: "no-lifting", label: "Without lifting my hand", phrase: "without lifting the pencil" },
  { id: "one-color", label: "Just one color", phrase: "using just one color" },
  { id: "small-only", label: "Small marks", phrase: "keeping every mark small" },
  { id: "big-only", label: "Big marks", phrase: "making every mark big" },
];

/** Accepts { mark, limit } with known ids. Absent is fine. Returns { ok, childRule } or { ok: false, error }. */
export function parseChildRule(input) {
  if (input === undefined || input === null) return { ok: true, childRule: null };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "childRule must be an object" };
  const mark = RULE_MARKS.find((option) => option.id === input.mark);
  const limit = RULE_LIMITS.find((option) => option.id === input.limit);
  if (!mark || !limit) return { ok: false, error: "childRule needs a known mark and limit" };
  return { ok: true, childRule: { mark: mark.id, limit: limit.id } };
}

/** The sentence given to the model, built only from our own wording. */
export function rulePhrase(childRule) {
  const mark = RULE_MARKS.find((option) => option.id === childRule.mark);
  const limit = RULE_LIMITS.find((option) => option.id === childRule.limit);
  return `draw ${mark.phrase}, ${limit.phrase}`;
}
