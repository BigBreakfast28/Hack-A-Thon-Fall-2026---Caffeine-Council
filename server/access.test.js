import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  createAccessVerifier,
  createSolanaBalanceFetcher,
  decodeBase58,
  mintMagicTicket,
  verifyMagicTicket,
} from "./access.js";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(buffer) {
  const digits = [0];
  for (const byte of buffer) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (let k = 0; buffer[k] === 0 && k < buffer.length - 1; k++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

const NOW = 1_800_000_000_000; // fixed clock in ms
const SECRET = "test-secret-not-real";
const ticket = (expiresAtSec) => mintMagicTicket({ secret: SECRET, expiresAtSec });

function wallet(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const address = encodeBase58(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  const nonce = String(overrides.nonce ?? NOW);
  const signature =
    overrides.signature ?? sign(null, Buffer.from(`muse-access:${nonce}`), privateKey).toString("base64");
  return { type: "wallet", address, nonce, signature };
}

test("base58 decoding handles known vectors and Solana's all-zero address", () => {
  assert.equal(decodeBase58("2NEpo7TZRRrLZSi2U").toString("utf8"), "Hello World!");
  const zero = decodeBase58("1".repeat(32));
  assert.equal(zero.length, 32);
  assert.ok(zero.every((byte) => byte === 0));
  assert.equal(decodeBase58("0OIl"), null);
  assert.equal(decodeBase58(""), null);
  const random = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256));
  assert.deepEqual(decodeBase58(encodeBase58(random)), random);
});

test("magic ticket: valid, expired, tampered, malformed, and no secret", () => {
  const good = ticket(NOW / 1000 + 3600);
  assert.equal(verifyMagicTicket(good, { secret: SECRET, nowMs: NOW }).ok, true);
  assert.equal(verifyMagicTicket(ticket(NOW / 1000 - 1), { secret: SECRET, nowMs: NOW }).reason, "expired");
  const [prefix, , signature] = good.split(".");
  const extended = `${prefix}.${NOW / 1000 + 999999}.${signature}`;
  assert.equal(verifyMagicTicket(extended, { secret: SECRET, nowMs: NOW }).reason, "bad_signature");
  assert.equal(verifyMagicTicket(good, { secret: "other-secret", nowMs: NOW }).reason, "bad_signature");
  assert.equal(verifyMagicTicket("nonsense", { secret: SECRET, nowMs: NOW }).reason, "malformed");
  assert.equal(verifyMagicTicket(undefined, { secret: SECRET, nowMs: NOW }).reason, "malformed");
  assert.equal(verifyMagicTicket(good, { secret: undefined, nowMs: NOW }).reason, "not_configured");
});

test("wallet: valid signature with enough balance passes, and only the address is sent to the RPC", async () => {
  const seen = [];
  const verify = createAccessVerifier({
    now: () => NOW,
    minLamports: 1000,
    fetchBalance: async (address) => (seen.push(address), 5000),
  });
  const credential = wallet();
  assert.equal((await verify(credential)).ok, true);
  assert.deepEqual(seen, [credential.address]);
});

test("wallet: stale nonce, wrong key, bad signature, low balance and RPC failure all fail", async () => {
  const verify = (fetchBalance, minLamports = 1000) => createAccessVerifier({ now: () => NOW, minLamports, fetchBalance });
  const rich = async () => 5000;

  assert.equal((await verify(rich)(wallet({ nonce: NOW - 61_000 }))).reason, "stale_nonce");
  assert.equal((await verify(rich)(wallet({ nonce: NOW + 61_000 }))).reason, "stale_nonce");

  const other = wallet();
  const stolen = { ...wallet(), signature: other.signature };
  assert.equal((await verify(rich)(stolen)).reason, "bad_signature");
  assert.equal((await verify(rich)(wallet({ signature: Buffer.alloc(64).toString("base64") }))).reason, "bad_signature");
  assert.equal((await verify(rich)({ ...wallet(), address: "not-an-address" })).reason, "bad_address");

  assert.equal((await verify(async () => 10)(wallet())).reason, "insufficient_balance");
  assert.equal((await verify(async () => { throw new Error("down"); })(wallet())).reason, "rpc_error");
  assert.equal((await verify(undefined)(wallet())).reason, "rpc_not_configured");
});

test("wallet balance fetcher asks Solana for getBalance and rejects bad answers", async () => {
  let request;
  const fetchOk = async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ result: { value: 42 } }) };
  };
  const fetcher = createSolanaBalanceFetcher({ rpcUrl: "https://rpc.example", fetchImpl: fetchOk });
  assert.equal(await fetcher("Addr111"), 42);
  assert.equal(request.url, "https://rpc.example");
  assert.equal(request.body.method, "getBalance");
  assert.deepEqual(request.body.params, ["Addr111"]);

  const bad = createSolanaBalanceFetcher({
    rpcUrl: "https://rpc.example",
    fetchImpl: async () => ({ ok: true, json: async () => ({ error: "x" }) }),
  });
  await assert.rejects(() => bad("Addr111"));
});

test("storekit fails closed unless a verifier is injected", async () => {
  const credential = { type: "storekit", value: "receipt" };
  assert.equal((await createAccessVerifier({})(credential)).reason, "not_configured");
  assert.equal((await createAccessVerifier({ storeKitVerifier: async () => true })(credential)).ok, true);
  assert.equal((await createAccessVerifier({ storeKitVerifier: async () => false })(credential)).ok, false);
  const throws = createAccessVerifier({ storeKitVerifier: async () => { throw new Error("x"); } });
  assert.equal((await throws(credential)).reason, "verifier_error");
});

test("missing, unknown and client-asserted credentials are refused", async () => {
  const verify = createAccessVerifier({ ticketSecret: SECRET, now: () => NOW });
  assert.equal((await verify(undefined)).reason, "missing_credential");
  assert.equal((await verify("yes")).reason, "missing_credential");
  assert.equal((await verify({ type: "vip" })).reason, "unknown_type");
  assert.equal((await verify({ tokenValid: true })).ok, false);
  assert.equal((await verify({ type: "magic_ticket", value: ticket(NOW / 1000 + 60) })).ok, true);
});

test("open mode lets everything through (the server only allows it outside production)", async () => {
  assert.equal((await createAccessVerifier({ mode: "open" })(undefined)).ok, true);
});
