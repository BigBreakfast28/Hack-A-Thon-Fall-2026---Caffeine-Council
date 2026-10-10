// Stateless access verification. Every check is computed from the credential itself,
// the server secret and the clock. Nothing is stored, no account exists, nothing is
// logged, and the client is never trusted to say "I paid": it has to prove it.
//
//   Path A (traditional): a "Magic Ticket" (HMAC-signed, expiring code), or a StoreKit
//                         transaction checked by an injected verifier.
//   Path B (decentralized): an ed25519 wallet signature over a fresh timestamp, plus a
//                         balance check through a Solana JSON-RPC node.
//
// Known limit of any stateless design: a valid credential can be replayed until it
// expires (tickets) or until the 60 second window closes (wallet signatures). Stopping
// replays outright would need a server-side record of used credentials.
import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

const TICKET_PREFIX = "MT1";
const WALLET_MESSAGE_PREFIX = "muse-access:";
const WALLET_WINDOW_MS = 60_000;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
// DER prefix that wraps a raw 32-byte ed25519 public key into a SubjectPublicKeyInfo.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const ok = () => ({ ok: true });
const fail = (reason) => ({ ok: false, reason });

/** Creates a ticket that stops working at `expiresAtSec` (unix seconds). Used by mint-ticket.js. */
export function mintMagicTicket({ secret, expiresAtSec }) {
  const body = `${TICKET_PREFIX}.${expiresAtSec}`;
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyMagicTicket(value, { secret, nowMs }) {
  if (!secret) return fail("not_configured");
  if (typeof value !== "string" || value.length > 200) return fail("malformed");
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== TICKET_PREFIX || !/^\d{1,12}$/.test(parts[1])) {
    return fail("malformed");
  }
  const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return fail("bad_signature");
  if (Number(parts[1]) * 1000 <= nowMs) return fail("expired");
  return ok();
}

/** Bitcoin-alphabet base58, as used for Solana addresses. Returns a Buffer or null. */
export function decodeBase58(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > 100) return null;
  const bytes = [0];
  for (const char of text) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) return null;
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; text[k] === "1" && k < text.length - 1; k++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

/** Asks a Solana JSON-RPC node for an address balance in lamports. The address is sent to that node. */
export function createSolanaBalanceFetcher({ rpcUrl, fetchImpl = fetch, timeoutMs = 5000 }) {
  return async (address) => {
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error("rpc_status");
    const body = await response.json();
    const lamports = body?.result?.value;
    if (!Number.isFinite(lamports)) throw new Error("rpc_shape");
    return lamports;
  };
}

/**
 * The client signs the exact text `muse-access:<timestamp in ms>` with its wallet key and
 * sends { address, nonce: "<timestamp>", signature: "<base64>" }.
 */
export async function verifyWallet(credential, { nowMs, minLamports, fetchBalance }) {
  const { address, nonce, signature } = credential;

  const keyBytes = decodeBase58(address);
  if (!keyBytes || keyBytes.length !== 32) return fail("bad_address");
  if (typeof nonce !== "string" || !/^\d{10,16}$/.test(nonce)) return fail("bad_nonce");
  if (Math.abs(nowMs - Number(nonce)) > WALLET_WINDOW_MS) return fail("stale_nonce");
  if (typeof signature !== "string" || signature.length > 200) return fail("bad_signature");
  const signatureBytes = Buffer.from(signature, "base64");
  if (signatureBytes.length !== 64) return fail("bad_signature");

  let valid = false;
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, keyBytes]),
      format: "der",
      type: "spki",
    });
    valid = verify(null, Buffer.from(`${WALLET_MESSAGE_PREFIX}${nonce}`), publicKey, signatureBytes);
  } catch {
    valid = false;
  }
  if (!valid) return fail("bad_signature");

  if (!fetchBalance) return fail("rpc_not_configured");
  let lamports;
  try {
    lamports = await fetchBalance(address);
  } catch {
    return fail("rpc_error");
  }
  if (!Number.isFinite(lamports) || lamports < minLamports) return fail("insufficient_balance");
  return ok();
}

/**
 * Builds the single `verifyAccess(credential)` function the server calls before every model request.
 * `mode: "open"` skips checks for local development only; server.js refuses it in production.
 */
export function createAccessVerifier({
  mode = "required",
  ticketSecret,
  minLamports = 1,
  fetchBalance,
  storeKitVerifier,
  now = Date.now,
} = {}) {
  return async function verifyAccess(credential) {
    if (mode === "open") return ok();
    if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
      return fail("missing_credential");
    }
    switch (credential.type) {
      case "magic_ticket":
        return verifyMagicTicket(credential.value, { secret: ticketSecret, nowMs: now() });
      case "wallet":
        return verifyWallet(credential, { nowMs: now(), minLamports, fetchBalance });
      case "storekit": {
        if (!storeKitVerifier) return fail("not_configured");
        try {
          return (await storeKitVerifier(credential.value)) ? ok() : fail("rejected");
        } catch {
          return fail("verifier_error");
        }
      }
      default:
        return fail("unknown_type");
    }
  };
}
