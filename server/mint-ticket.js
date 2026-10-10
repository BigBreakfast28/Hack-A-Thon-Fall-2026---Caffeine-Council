// Usage: MAGIC_TICKET_SECRET=... node mint-ticket.js [hours]
// Prints one ticket that works for `hours` (default 24). Run it on your own machine;
// this file is not copied into the container image.
import { mintMagicTicket } from "./access.js";

const secret = process.env.MAGIC_TICKET_SECRET;
if (!secret) {
  console.error("MAGIC_TICKET_SECRET is not set. Export it in your shell first.");
  process.exit(1);
}
const hours = Number(process.argv[2] ?? 24);
if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
  console.error("hours must be a number from 0 to 720");
  process.exit(1);
}
const expiresAtSec = Math.floor(Date.now() / 1000 + hours * 3600);
console.log(mintMagicTicket({ secret, expiresAtSec }));
