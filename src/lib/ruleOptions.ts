// The fixed menu for a child's own drawing rule. The child picks one mark and one limit, and
// the app sends their ids as childRule: { mark, limit }. The server only accepts these ids, so
// no typed text ever reaches the model. Render these as buttons; do not add or rename ids.
//
// The same ids and labels live in server/ruleOptions.js. A client test (npm run test:client)
// fails if the two lists drift apart.
export type RuleOption = { id: string; label: string };

export const RULE_MARKS: readonly RuleOption[] = [
  { id: "lines", label: "Only lines" },
  { id: "dots", label: "Only dots" },
  { id: "curves", label: "Only curves" },
  { id: "zigzags", label: "Only zigzags" },
  { id: "loops", label: "Only loops" },
];

export const RULE_LIMITS: readonly RuleOption[] = [
  { id: "no-lifting", label: "Without lifting my hand" },
  { id: "one-color", label: "Just one color" },
  { id: "small-only", label: "Small marks" },
  { id: "big-only", label: "Big marks" },
];
