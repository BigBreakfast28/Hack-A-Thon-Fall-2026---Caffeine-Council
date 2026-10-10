# Architecture: stateless drawing coach (Project Muse)

The child draws on a canvas. The app sends drawing statistics (and optionally one small snapshot) over a WebSocket to our server, the server checks the caller's access credential, asks Gemini for a short coaching reply, and sends it back. Nothing about the child or the drawing is kept by us.

```text
Browser / iPad  --wss-->  TLS proxy  --ws-->  server/ (Node, RAM only)  --HTTPS-->  Gemini API
 React state only                              verifies access, picks a
 history + credential                          pedagogy module, builds prompt
```

## Who owns what

- Cameron: canvas core front end (drawing surface, snapshot export, telemetry collection).
- K.O: systems integration and pitch (payment proof handling in memory only, demo script, compliance wording).
- Shubhang: backend (`server/`), pedagogy modules, access verification, compliance audit, Vultr deployment.

## What is here

- `server/pedagogy.js`: the pedagogy modules (original text, plus a neutral `general_encouragement` default).
- `server/evaluateMetrics.js`: the rule matrix and strict validation of canvas statistics.
- `server/muse.js`: the request pipeline (validate, verify access, choose module, build prompt, call Gemini).
- `server/access.js`: stateless access verification (see below).
- `server/server.js`: WebSocket server on `/ws`, plus `GET /api/health`. Origin check, 1 MB message cap, 20 messages a minute per connection, one request at a time.
- `server/mint-ticket.js`: prints a Magic Ticket from the server secret.
- `server/Dockerfile`, `server/docker-compose.yml`: read-only root filesystem, RAM-only `/tmp`, no volumes, no container logs. Not yet built or run (Docker is not installed on the machine used to write this).
- `src/hooks/useStatelessStream.ts`: client hook over WebSocket. History and credential live in React state. Used by the canvas and the Grown-ups screen in `src/App.tsx`.
- `src/lib/exportFrame.ts`: half-size, 70% JPEG snapshot flattened onto the paper color (used only when `VITE_MUSE_SEND_FRAMES=1`).
- `src/lib/canvasTelemetry.ts`: the drawing statistics the coach receives (see below).
- `audit-compliance.sh`: zero-data tripwire (`npm run audit:zero-data`).
- Tests: `npm run test:server` (fake AI client, real WebSocket, real ed25519 keys) and `npm run test:client` (drawing statistics and the client-to-server wire contract).
- The gallery no longer uses `localStorage`; saved art lives in memory with a "Wipe volatile memory" button. Fonts are self-hosted, so no request goes to Google Fonts.

## How the canvas talks to the coach

- While the child draws, `src/lib/canvasTelemetry.ts` keeps four numbers in a plain object (never in React state): `strokeCount`, `durationSeconds`, `shapeDiversityScore` and `primaryColors`. Stroke coordinates exist only until the stroke ends, then are classified and discarded.
- `durationSeconds` is active drawing time: pauses longer than 5 seconds do not count, so a child who walks away does not trigger the "long session" module.
- `shapeDiversityScore` is the normalized entropy of five stroke kinds (dot, line, loop, zigzag, curve), 0 until at least 5 strokes. `primaryColors` are the colors used in at least 10% of strokes. These are simple heuristics, not measurements of ability.
- Sunny is asked in two ways: the sparkle button in the tool dock, and automatically after a 4 second pause once there have been at least 10 new strokes since the last check-in.
- The reply appears as a dismissable note over the paper, so it is visible on any screen size, and Sunny's mood changes while she thinks.
- By default only the four numbers leave the device. Setting `VITE_MUSE_SEND_FRAMES=1` also sends a small JPEG snapshot.
- The ticket is entered by a grown-up on the Grown-ups screen, held in memory only, and cleared by "Wipe volatile memory". There is no screen for the wallet gate; that path needs a wallet adapter on the client.
- If coaching is locked or the server is unreachable, the child sees a friendly line and keeps drawing. The raw error is never shown.
- Checked so far: the tracker, the hook's message shape and the server's access gate are covered by tests, and the real server entry point was started and exercised over a WebSocket. The screens themselves have not yet been tried in a browser.

## Access verification (no accounts, nothing stored)

The client sends a `credential`; the server never trusts a client claim such as `tokenValid`.

- Magic Ticket: `MT1.<expiry>.<HMAC>` signed with `MAGIC_TICKET_SECRET`. Valid until its expiry.
- StoreKit: fails closed until a verifier is injected. Apple receipt or transaction verification is not implemented here.
- Wallet (Solana): the client signs `muse-access:<timestamp ms>` with its ed25519 key and sends address, timestamp and signature. The server checks the signature, a 60 second freshness window, and the balance through `SOLANA_RPC_URL` (`WALLET_MIN_LAMPORTS`). The wallet address is sent to that RPC node.
- Limit: a valid credential can be replayed until it expires, because stopping replays would need a server-side record. Say this plainly if asked.
- `ACCESS_MODE=open` is for local development only and is ignored when `NODE_ENV=production`.

## What we can and cannot say (checked against Google's published terms)

Gemini API Additional Terms of Service (effective 2026-03-23) and Google's data pages say:

- You must be 18 or older, and you may not use the API in an application "directed towards or likely to be accessed by individuals under the age of 18". The terms also describe the API as for professional or business use, not consumer use. Google has not answered this in its developer forum. Decide the product positioning before the pitch (for example, an adult-operated teacher or parent tool) and do not claim the question is settled.
- Free tier: Google may use submitted content to improve its products and human reviewers may read it. Use a paid-tier key for anything involving real drawings.
- Paid tier: Google does not use content to improve products, but it logs prompts and responses for abuse monitoring, documented as 55 days. True zero retention needs project-level approval from Google.
- `store: false` is a setting of the Interactions API, not of `generateContent`, which keeps no developer-side state by default. The code deliberately does not pass it.

So the accurate claim is: "our servers store nothing, and what we send to Google is covered by Google's paid-tier terms, including up to 55 days of abuse-monitoring retention." Do not say "zero logs", "Google never saves this", or "absolute COPPA/FERPA compliance". Those are legal questions this document does not answer.

Telemetry-only mode (no `frameData`) sends no image of the child's drawing to Google, only strokes, speed and color names. It is the privacy-preferred demo mode; the model then coaches from numbers, not from the picture.

## Where the code differs from the original design notes, and why

- `tokenValid` from the client is gone. It let anyone skip the paywall by sending `true`. Access is now verified on the server.
- `store: false` was removed from the Gemini call (see above).
- The rule matrix now includes the limited-palette rule (`primaryColors.length <= 2` and `strokeCount > 30`). The original fell back to "resourceful problem solving" for every session that matched nothing, so children with ordinary palettes would have been coached about limited palettes. Unmatched sessions now get `general_encouragement`.
- `primaryColors` must be hex codes or plain color names. Free text there would be a way to put instructions into the prompt.
- The system prompt is the safety guardrails, then the module's `framework` and `prompts_for_kids`. The `studies` list is not sent to the model, and the phrase "designed for under-resourced children" is gone: the app does not know any child's circumstances, and the guardrails forbid guessing them.
- `frameData` (the snapshot) is optional.
- The model name comes from `GEMINI_MODEL` (default `gemini-3.8-flash`); the original had `gemini-2.5-flash`.
- Transport is `ws` with `noServer` upgrade handling so the origin and path can be checked; TLS is terminated in front of the process.

## Open points for the pedagogy owner

These are wording and claims, not bugs, so they are left for the owner to decide:

- The prompts say to praise a limited palette or a mistake as an "elite design constraint" and to frame resourcefulness as a "superpower". For a child who really does have few supplies, that can read as "be glad you have less". Consider framing it as "you made something great with what you had" without the status language.
- Mullainathan & Shafir (2013) argues scarcity burdens attention; it does not show that limits build resourcefulness. Hart & Risley (1995) is widely contested. Both are risky to cite as support in a pitch.
- "Target mobility skills" are not measured by stroke counts or timing. Present them as the coaching goals, not as outcomes the app detects.

## Open decisions

- Web or native: this repo is a Vite web app with a 2D canvas. Moving to React Native with Skia and Reanimated would be a rewrite.
- Hosting: Vultr Cloud Compute or Kubernetes (VKE) running the container behind a TLS proxy. No Vultr "serverless edge" product has been verified.
- Under-18 positioning: see above.

## Run

```bash
# server (paid-tier key exported in your shell, never written to a file)
cd server && npm install && npm test
GEMINI_API_KEY=... npm run dev            # local only: access checks off

# mint a ticket for the real gate
MAGIC_TICKET_SECRET=... node mint-ticket.js 24

# front end
npm install && VITE_MUSE_WS_URL=ws://localhost:8080/ws npm run dev
# add VITE_MUSE_SEND_FRAMES=1 to also send a small snapshot (off by default: statistics only)

# tests: server (35), client (12: drawing statistics and the wire contract)
npm run test:server && npm run test:client

# zero-data tripwire
npm run audit:zero-data
```
