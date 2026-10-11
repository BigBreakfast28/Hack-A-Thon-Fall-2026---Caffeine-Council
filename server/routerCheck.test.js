import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMetrics } from "./evaluateMetrics.js";
import { runRouterChecks } from "./routerCheck.js";

const failures = (report) => report.results.filter((result) => result.status === "fail");
const failedGroups = (report) => new Set(failures(report).map((result) => result.group));

test("the real router passes every check", () => {
  const report = runRouterChecks();
  assert.deepEqual(failures(report), []);
  assert.equal(report.ok, true);
  assert.ok(report.results.length >= 60, String(report.results.length));
});

test("every group is covered and the thresholds are reported", () => {
  const report = runRouterChecks();
  const groups = new Set(report.results.map((result) => result.group));
  for (const group of ["long session", "blank page", "order", "child's choice", "ignored signals", "extremes", "rejected input", "accepted edges", "invariants"]) {
    assert.ok(groups.has(group), group);
  }
  assert.deepEqual(report.thresholds, { longSessionSeconds: 600, blankPageMaxStrokes: 5, blankPageAfterSeconds: 45 });
});

test("a router that always gives the default fails the pacing and choice checks", () => {
  const groups = failedGroups(runRouterChecks({ evaluate: () => "general_encouragement" }));
  for (const group of ["long session", "blank page", "order", "child's choice", "invariants"]) assert.ok(groups.has(group), group);
  assert.equal(groups.has("ignored signals"), false);
});

test("a router that ignores the child's choice fails the choice checks and nothing about pacing", () => {
  const report = runRouterChecks({ evaluate: (metrics) => evaluateMetrics(metrics) });
  const groups = failedGroups(report);
  assert.ok(groups.has("child's choice"));
  for (const group of groups) assert.ok(["child's choice", "invariants"].includes(group), group);
  assert.equal(groups.has("long session"), false);
  assert.equal(groups.has("blank page"), false);
});

test("a router that treats drawing speed as a signal fails the ignored-signals checks", () => {
  const fast = (metrics, mode) => (metrics.strokeCount / (metrics.durationSeconds || 1) > 3 ? "process_feedback" : evaluateMetrics(metrics, mode));
  const report = runRouterChecks({ evaluate: fast });
  assert.ok(failedGroups(report).has("ignored signals"));
  assert.match(failures(report).find((result) => result.group === "ignored signals").detail, /expected general_encouragement/);
});

test("a router that reads shape or palette fails the ignored-signals checks", () => {
  const byShape = (metrics, mode) => (metrics.shapeDiversityScore > 0.75 ? "problem_finding" : evaluateMetrics(metrics, mode));
  assert.ok(failedGroups(runRouterChecks({ evaluate: byShape })).has("ignored signals"));
  const byPalette = (metrics, mode) => (metrics.primaryColors.length <= 2 && metrics.strokeCount > 30 ? "constraint_challenge" : evaluateMetrics(metrics, mode));
  assert.ok(failedGroups(runRouterChecks({ evaluate: byPalette })).has("ignored signals"));
});

test("a router that moves a threshold by one fails the boundary checks", () => {
  const tooEarly = (metrics, mode) => (!mode && metrics.durationSeconds > 599 ? "process_feedback" : evaluateMetrics(metrics, mode));
  assert.ok(failedGroups(runRouterChecks({ evaluate: tooEarly })).has("long session"));
  const blankTooSoon = (metrics, mode) => (!mode && metrics.strokeCount <= 5 && metrics.durationSeconds > 44 ? "constraint_challenge" : evaluateMetrics(metrics, mode));
  assert.ok(failedGroups(runRouterChecks({ evaluate: blankTooSoon })).has("blank page"));
});

test("a validator that accepts everything fails the rejected-input checks", () => {
  const report = runRouterChecks({ parse: () => ({ ok: true }) });
  const groups = failedGroups(report);
  assert.ok(groups.has("rejected input"));
  assert.equal(groups.has("accepted edges"), false);
  assert.ok(failures(report).some((result) => /prompt injection/.test(result.name)));
});

test("a validator that rejects everything fails the accepted-edges checks", () => {
  const groups = failedGroups(runRouterChecks({ parse: () => ({ ok: false, error: "no" }) }));
  assert.ok(groups.has("accepted edges"));
  assert.ok(groups.has("rejected input")); // even the base payload is refused
});
