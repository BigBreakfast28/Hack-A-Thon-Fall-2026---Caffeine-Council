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

- `server/pedagogy.js`: five modules (`constraint_challenge`, `process_feedback`, `problem_finding`, `autonomy_support`, and a plain `general_encouragement` default and control). Only `framework` and `prompts_for_kids` reach the model; `studies`, `evidence` and `caveat` are for the team.
- `server/evaluateMetrics.js`: the rule matrix, the coaching mode check and strict validation of canvas statistics.
- `server/muse.js`: the request pipeline (validate, verify access, choose module, build prompt, call Gemini).
- `server/access.js`: stateless access verification (see below).
- `server/server.js`: WebSocket server on `/ws`, plus `GET /api/health`. Origin check, 1 MB message cap, 20 messages a minute per connection, one request at a time.
- `server/mint-ticket.js`: prints a Magic Ticket from the server secret.
- `server/Dockerfile`, `server/docker-compose.yml`: read-only root filesystem, RAM-only `/tmp`, no volumes, no container logs. Not yet built or run (Docker is not installed on the machine used to write this).
- `src/hooks/useStatelessStream.ts`: client hook over WebSocket. History and credential live in React state. Used by the canvas and the Grown-ups screen in `src/App.tsx`.
- `src/lib/exportFrame.ts`: half-size, 70% JPEG snapshot flattened onto the paper color (used only when `VITE_MUSE_SEND_FRAMES=1`).
- `src/lib/canvasTelemetry.ts`: the drawing statistics the coach receives (see below).
- `RESEARCH.md`: the evidence behind each module with its caveats, the old-to-new module mapping, the pilot evaluation plan and the sources to drop or verify.
- `audit-compliance.sh`: zero-data tripwire (`pnpm run audit:zero-data`).
- Tests: `pnpm run test:server` (fake AI client, real WebSocket, real ed25519 keys) and `pnpm run test:client` (drawing statistics and the client-to-server wire contract).
- The gallery no longer uses `localStorage`; saved art lives in memory with a "Wipe volatile memory" button. Fonts are self-hosted, so no request goes to Google Fonts.

## How the canvas talks to the coach

- While the child draws, `src/lib/canvasTelemetry.ts` keeps four numbers in a plain object (never in React state): `strokeCount`, `durationSeconds`, `shapeDiversityScore` and `primaryColors`. Stroke coordinates exist only until the stroke ends, then are classified and discarded.
- `durationSeconds` is active drawing time: pauses longer than 5 seconds do not count, so a child who walks away does not trigger the "long session" module.
- `shapeDiversityScore` is the normalized entropy of five stroke kinds (dot, line, loop, zigzag, curve), 0 until at least 5 strokes. `primaryColors` are the colors used in at least 10% of strokes. These are simple heuristics, not measurements of ability. The server ignores the shape score; only strokes, time and the child's chosen mode pick a module, and colors are optional context for the prompt.
- Sunny is asked in two ways: the sparkle button in the tool dock, and automatically after a 4 second pause once there have been at least 10 new strokes since the last check-in.
- The request can also carry `coachingMode` (`challenge`, `idea`, `finish` or `cheer`): the kind of help the child picked. It selects the module and tells the model the child chose it. It is optional and validated; anything else is a 400. The hook takes it as the third argument of `dispatchCanvasTelemetry`.
- The server keeps a short progress note per turn in the client-owned history ("Update: 40 strokes, 130 s.") instead of the colors, so later replies can mention how the drawing has changed.
- The reply appears as a note over the paper that ignores touches (so it never blocks drawing) and fades after 12 seconds. It is visible on any screen size, and Sunny's mood changes while she thinks.
- By default only the four numbers leave the device. Setting `VITE_MUSE_SEND_FRAMES=1` also sends a small JPEG snapshot.
- The ticket is entered by a grown-up on the Grown-ups screen, held in memory only, and cleared by "Wipe volatile memory". There is no screen for the wallet gate; that path needs a wallet adapter on the client.
- If coaching is locked or the server is unreachable, the child sees a friendly line and keeps drawing. The raw error is never shown.
- Checked so far: the tracker, the hook's message shape and the server's access gate are covered by tests. The real server was started and used over a WebSocket, and the canvas was driven in Chrome with an iPad Pro viewport and touch input: locked message, ticket entry, automatic check-in, reply at portrait width, wipe, no browser storage, no third-party requests, no snapshot sent. The server used a labelled mock model, not Gemini, in that run. See "Testing for iOS" for what that does not prove.

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

Telemetry-only mode (no `frameData`) sends no image of the child's drawing to Google, only the stroke count, time and color names. It is the privacy-preferred demo mode; the model then coaches from numbers, not from the picture.

## Where the code differs from the original design notes, and why

- `tokenValid` from the client is gone. It let anyone skip the paywall by sending `true`. Access is now verified on the server.
- `store: false` was removed from the Gemini call (see above).
- The rule matrix and modules were rewritten against the research (`RESEARCH.md`). The original rules keyed on speed, color count and stroke counts to infer grit, agency or spatial ability, which drawing statistics do not measure. Now: the child's chosen mode wins; more than 600 s of active drawing gets `process_feedback` (specific feedback and a break offer); at most 5 strokes after 45 s gets `constraint_challenge`; everything else gets `general_encouragement`. `shapeDiversityScore` is still accepted but ignored. The old module keys are gone (mapping in `RESEARCH.md`), and `target_mobility_skills` became `coaching_goals`.
- `primaryColors` must be hex codes or plain color names. Free text there would be a way to put instructions into the prompt.
- The system prompt is the safety guardrails, then the module's `framework` and `prompts_for_kids`. The `studies` list is not sent to the model, and the phrase "designed for under-resourced children" is gone: the app does not know any child's circumstances, and the guardrails forbid guessing them.
- `frameData` (the snapshot) is optional.
- The model name comes from `GEMINI_MODEL` (default `gemini-3.8-flash`); the original had `gemini-2.5-flash`.
- Transport is `ws` with `noServer` upgrade handling so the origin and path can be checked; TLS is terminated in front of the process.

## Open points for the pedagogy owner

The modules and rules were revised against the research in `RESEARCH.md`. Still open:

- The thresholds (600 s, 5 strokes, 45 s) are untuned placeholders. Tune them in a pilot.
- The blank-page rule cannot fire from the current canvas: the tracker counts only active time and caps each pause at 5 s, so 5 strokes show at most 45 s. Either send elapsed time as well or rely on the child choosing "challenge".
- The canvas has no buttons for `coachingMode` yet (Cameron's area). Until it does, the server picks from the pacing rules and the child never chooses.
- Present the `coaching_goals` as what the coach aims at, not as outcomes the app detects. Drawing statistics do not measure grit, agency or ability.
- Do not claim Sunny improves creativity. The pilot plan in `RESEARCH.md` is how to find out.
- Mullainathan & Shafir (2013), Hart & Risley (1995) and Mischel (1989) should not be cited as support in a pitch.

## Open decisions

- Web or native: this repo is a Vite web app with a 2D canvas. Moving to React Native with Skia and Reanimated would be a rewrite.
- Hosting: Vultr Cloud Compute or Kubernetes (VKE) running the container behind a TLS proxy. No Vultr "serverless edge" product has been verified.
- Under-18 positioning: see above.

## Testing for iOS

The target is iOS. So far the screens have been walked through only in desktop Chrome set up as an iPad Pro (iPad viewport, real touch input, iPad user agent). That is Chrome's engine, not Safari's, so it does not prove the app works on iOS.

- The iOS Simulator is not installed on the machine used so far (only the Command Line Tools are). Installing Xcode gives Mobile Safari in a simulator, which is the next test. A real iPad is better still.
- Safari points to check: finger and Apple Pencil drawing on the canvas, the color picker, the sparkle button and the ticket field, and what happens when the app goes to the background (the WebSocket closes; the hook reconnects on the next request).
- A page served over HTTPS must use `wss://`; Safari blocks `ws://` from an HTTPS page.
- If the product ships as a native iOS app instead of a web page, the StoreKit gate, Skia and Reanimated apply and this web canvas is the prototype. That decision is still open.

## Run

```bash
# server (paid-tier key exported in your shell, never written to a file)
cd server && npm install && npm test
GEMINI_API_KEY=... npm run dev            # local only: access checks off

# mint a ticket for the real gate
MAGIC_TICKET_SECRET=... node mint-ticket.js 24

# front end: the root uses pnpm (version pinned in .mise.toml, one lockfile: pnpm-lock.yaml).
# server/ is a separate npm package with its own package-lock.json.
pnpm install --frozen-lockfile && VITE_MUSE_WS_URL=ws://localhost:8080/ws pnpm dev
# add VITE_MUSE_SEND_FRAMES=1 to also send a small snapshot (off by default: statistics only)

# tests: server (42), client (13: drawing statistics and the wire contract)
# the client tests import server code, so install the server's packages first: (cd server && npm ci)
pnpm run test:server && pnpm run test:client

# zero-data tripwire
pnpm run audit:zero-data
```

Do not run `npm install` at the root: it would recreate `package-lock.json` next to `pnpm-lock.yaml`.
