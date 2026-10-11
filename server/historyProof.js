// Signed history. The server returns the conversation together with a proof, the client
// sends both back next time, and the server checks the proof before it trusts the history.
// Nothing is stored: the proof is an HMAC of the history and the time it was issued, made
// with a secret only the server knows. This stops a modified client from forging turns that
// look like the coach said them. It does not stop a valid history from being replayed until
// it expires, and it does not make a child's browser trustworthy.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const HISTORY_MAX_AGE_MS = 2 * 60 * 60 * 1000; // two hours
const FUTURE_SKEW_MS = 60 * 1000; // tolerate a slightly fast clock, nothing more
const VERSION = "HP1";

/**
 * @param {object} [options]
 * @param {string} [options.secret]  HISTORY_SECRET. Without one a random secret is made at
 *   start-up, so every history stops being valid when the server restarts (clients are told
 *   to start fresh). Set a real secret to survive restarts or to run more than one server.
 * @param {() => number} [options.now]
 */
export function createHistoryProofs({ secret = process.env.HISTORY_SECRET, now = () => Date.now() } = {}) {
  const key = secret ? Buffer.from(secret, "utf8") : randomBytes(32);

  const mac = (issuedAt, history) =>
    createHmac("sha256", key).update(`muse-history-v1.${issuedAt}.${JSON.stringify(history)}`).digest();

  return {
    /** `history` must be an array of { role, text }, in that key order, as parseHistory returns. */
    sign(history) {
      const issuedAt = now();
      return `${VERSION}.${issuedAt}.${mac(issuedAt, history).toString("hex")}`;
    },

    /** True only for an unmodified history signed by this server less than two hours ago. */
    verify(history, proof) {
      if (typeof proof !== "string" || proof.length > 200) return false;
      const parts = proof.split(".");
      if (parts.length !== 3 || parts[0] !== VERSION || !/^\d{1,16}$/.test(parts[1]) || !/^[0-9a-f]{64}$/.test(parts[2])) {
        return false;
      }
      const issuedAt = Number(parts[1]);
      const age = now() - issuedAt;
      if (age > HISTORY_MAX_AGE_MS || age < -FUTURE_SKEW_MS) return false;
      return timingSafeEqual(mac(issuedAt, history), Buffer.from(parts[2], "hex"));
    },
  };
}
