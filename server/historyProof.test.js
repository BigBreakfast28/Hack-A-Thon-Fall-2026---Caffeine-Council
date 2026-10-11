import test from "node:test";
import assert from "node:assert/strict";
import { HISTORY_MAX_AGE_MS, createHistoryProofs } from "./historyProof.js";

const history = [
  { role: "user", text: "Update: 40 strokes, 130 s." },
  { role: "model", text: "Lovely lines! What next?" },
];

test("a history signed by this server verifies", () => {
  const proofs = createHistoryProofs({ secret: "s3cret" });
  const proof = proofs.sign(history);
  assert.match(proof, /^HP1\.\d+\.[0-9a-f]{64}$/);
  assert.equal(proofs.verify(history, proof), true);
  assert.equal(proofs.verify([], proofs.sign([])), true);
});

test("any change to the history, or to the proof, breaks it", () => {
  const proofs = createHistoryProofs({ secret: "s3cret" });
  const proof = proofs.sign(history);
  assert.equal(proofs.verify([...history, { role: "model", text: "extra" }], proof), false);
  assert.equal(proofs.verify(history.slice(1), proof), false);
  assert.equal(proofs.verify([history[1], history[0]], proof), false);
  assert.equal(proofs.verify(history.map((turn) => ({ ...turn, role: "model" })), proof), false);
  assert.equal(proofs.verify(history.map((turn) => ({ ...turn, text: `${turn.text} ` })), proof), false);
  const [version, issuedAt, mac] = proof.split(".");
  assert.equal(proofs.verify(history, [version, Number(issuedAt) + 1, mac].join(".")), false); // a later time
  assert.equal(proofs.verify(history, [version, issuedAt, mac.replace(/.$/, mac.endsWith("0") ? "1" : "0")].join(".")), false);
});

test("a proof from another secret, or a malformed one, is refused", () => {
  const proofs = createHistoryProofs({ secret: "s3cret" });
  const other = createHistoryProofs({ secret: "other" });
  assert.equal(proofs.verify(history, other.sign(history)), false);
  for (const bad of [undefined, null, 5, {}, "", "HP1", "HP1.1.2", "HP2.1.abc", `HP1.1.${"g".repeat(64)}`, `HP1.x.${"a".repeat(64)}`, "a".repeat(500)]) {
    assert.equal(proofs.verify(history, bad), false, String(bad));
  }
});

test("a proof is good for two hours and not for a moment longer", () => {
  let now = 1_800_000_000_000;
  const proofs = createHistoryProofs({ secret: "s3cret", now: () => now });
  const proof = proofs.sign(history);
  now += HISTORY_MAX_AGE_MS;
  assert.equal(proofs.verify(history, proof), true);
  now += 1;
  assert.equal(proofs.verify(history, proof), false);
});

test("a proof dated in the future is refused beyond a small clock difference", () => {
  let now = 1_800_000_000_000;
  const proofs = createHistoryProofs({ secret: "s3cret", now: () => now });
  const proof = proofs.sign(history);
  now -= 30_000;
  assert.equal(proofs.verify(history, proof), true);
  now -= 60_000;
  assert.equal(proofs.verify(history, proof), false);
});

test("without a secret each server run makes its own, so an old history is refused after a restart", () => {
  const before = createHistoryProofs({ secret: undefined });
  const after = createHistoryProofs({ secret: undefined });
  assert.equal(before.verify(history, before.sign(history)), true);
  assert.equal(after.verify(history, before.sign(history)), false);
});
