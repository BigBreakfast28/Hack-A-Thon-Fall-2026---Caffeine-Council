// The client menu and the server menu must list the same ids and labels. Run with:
// npm run test:client   (Node strips the TypeScript types on import)
import test from "node:test";
import assert from "node:assert/strict";
import { RULE_LIMITS, RULE_MARKS } from "./ruleOptions.ts";
import * as server from "../../server/ruleOptions.js";
import { parseChildRule } from "../../server/ruleOptions.js";

const idsAndLabels = (options) => options.map(({ id, label }) => ({ id, label }));

test("the buttons the child sees match what the server accepts, in the same order", () => {
  assert.deepEqual(idsAndLabels(RULE_MARKS), idsAndLabels(server.RULE_MARKS));
  assert.deepEqual(idsAndLabels(RULE_LIMITS), idsAndLabels(server.RULE_LIMITS));
});

test("every pair of buttons is accepted by the server", () => {
  for (const mark of RULE_MARKS) {
    for (const limit of RULE_LIMITS) {
      assert.deepEqual(parseChildRule({ mark: mark.id, limit: limit.id }), { ok: true, childRule: { mark: mark.id, limit: limit.id } });
    }
  }
});

test("ids are plain lowercase words so they are safe to send and to compare", () => {
  for (const option of [...RULE_MARKS, ...RULE_LIMITS]) {
    assert.match(option.id, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(option.label.length > 0 && option.label.length <= 40);
  }
  assert.equal(new Set([...RULE_MARKS, ...RULE_LIMITS].map((option) => option.id)).size, RULE_MARKS.length + RULE_LIMITS.length);
});
