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

- `server/pedagogy.js`: seven modules (`constraint_challenge`, `process_feedback`, `problem_finding`, `elaboration` for building on the picture, `autonomy_support`, `rule_playing` for the child's own rule, and a plain `general_encouragement` default and control). Only `framework` and `prompts_for_kids` reach the model; `studies`, `evidence` and `caveat` are for the team. Coaching goals use the divergent-thinking words (fluency, elaboration, originality) where they fit, and never flexibility.
- `server/safety.js`, `server/safetyTerms.js`, `server/historyProof.js`, `server/ruleOptions.js`: the content filter, our own blocked and allowed words, the signed history, and the rule menu (see "Safety layer, signed history and the rule menu").
- `server/evaluateMetrics.js`: the rule matrix as one ordered list (`ROUTING_RULES`) read by both `evaluateMetrics` and `explainRoute`, the coaching mode check and strict validation of canvas statistics.
- `server/muse.js`: the request pipeline (validate, verify access, choose module, build prompt, call Gemini). `buildGeminiRequest` builds the exact Gemini arguments, including the safety settings.
- `server/preflight.js`: the Gemini check (model exists for this key, real calls built by `buildGeminiRequest`, latency, reply format and guardrail lint). Run by hand; not part of the request path and not copied into the Docker image.
- `server/tools/`: operator tools run by hand, none of them in the image. `explain-routing.mjs` prints which rule fires and why (offline), `router-check.mjs` and `payload-check.mjs` are offline contract checks (below), `gemini-check.mjs` runs the preflight with your key, `smoke-ws.mjs` does one real exchange against a running server and can check that a request with no ticket is refused. They live under `server/` so the audit scans them too, and the frame for the preflight comes in on stdin so no tool imports `fs`.
- `server/routerCheck.js` and `server/payloadCheck.js`: the logic behind `router-check.mjs` and `payload-check.mjs`. The router check calls the real `evaluateMetrics` and `parseRequest` at the thresholds, with extreme and hostile input, and includes the four triggers of the original design to show each now routes to the plain default on purpose. The payload check builds requests with the production `buildGeminiRequest` and fails if the config gains a key (such as `store` or `maxOutputTokens`), the safety filters weaken, a study, caveat or researcher name reaches the model, or child-side text enters the system instruction. Their tests prove they fail on a broken router, validator or builder. They run against the code, not the deployment: the image ships only runtime files, so run them from the repo or CI on the same commit, and use `smoke` against the live server.
- `deploy/vultr/`: Caddy plus the Node server in one compose file, with a runbook and evidence commands. Dry-run once on a Vultr VM: the image built, a Let's Encrypt certificate was issued, the health check answered, a request without a ticket was refused and a wrong origin got a 403. It ran with a placeholder Gemini key, so no real Gemini call from the server has been made there, and the run predates the `thinkingLevel` change. See its README.
- `server/access.js`: stateless access verification (see below).
- `server/lessons.js`: `GET /api/lessons/:id`. Gemini plans a lesson as steps plus simple shapes; the server validates the shapes, runs the text through `safety.js`, and draws each step's picture. Catalog ids only, generated once per lesson and held in memory. No child data in or out. It uses the same strict Google safety settings and `thinkingLevel` as Sunny's replies. To keep lessons smooth: all lessons are generated in the background at start-up, one at a time (`LESSON_PREWARM=off` skips this; it costs one Gemini call per lesson at each start), a lesson that fails is not asked for again for 60 seconds so repeated requests cannot run up Gemini calls, and browsers may keep a finished lesson for 5 minutes. None of this has been run against the real Gemini yet; only the offline tests cover it. The front end waits at most 6 seconds for the server's lesson, then uses its built-in steps while the request finishes in the background, and prefetches the chosen style's lessons while the child is on the lesson picker (`src/lib/lessonLoader.ts`). See `LESSON_API.md`.
- `server/server.js`: WebSocket server on `/ws`, plus `GET /api/health`. Origin check, 1 MB message cap, 20 messages a minute per connection, one request at a time.
- `server/mint-ticket.js`: prints a Magic Ticket from the server secret.
- `server/Dockerfile`, `server/docker-compose.yml`: read-only root filesystem, RAM-only `/tmp`, no volumes, no container logs. The Dockerfile was built and run once on a Vultr VM, through the compose file in `deploy/vultr/`, from a tree that predates the `thinkingLevel` change. It has not been rebuilt since, `server/docker-compose.yml` itself has not been run, and Docker is not installed on the machine that wrote the code. The `COPY` list in the Dockerfile is explicit, so any new runtime import must be added to it; no test checks this.
- `src/hooks/useStatelessStream.ts`: client hook over WebSocket. History, its proof, the Studio note and the credential live in React state. Used by the canvas and the Grown-ups screen in `src/App.tsx`.
- `src/lib/ruleOptions.ts`: the buttons for the child's own rule (ids and labels). `server/ruleOptions.js` has the same list plus the wording the model is given.
- `src/lib/exportFrame.ts`: half-size, 70% JPEG snapshot flattened onto the paper color (used only when `VITE_MUSE_SEND_FRAMES=1`).
- `src/lib/canvasTelemetry.ts`: the drawing statistics the coach receives (see below).
- `RESEARCH.md`: the evidence behind each module with its caveats, the old-to-new module mapping, the pilot evaluation plan and the sources to drop or verify.
- `audit-compliance.sh`: zero-data tripwire (`pnpm run audit:zero-data`). It greps `src/` and `server/` for storage, tracking, logging and disk-writing code. It also checks the page shell: `index.html`, `public/` and `vite.config.ts` for unexpected external hosts, `.figma/make/site.json` for an analytics or custom-script switch, and both `package.json` files for tracker or logging package names. Container and Vultr settings are checked too. It is a tripwire, not a proof: it cannot see what a dependency does.
- Tests: `pnpm run test:server` (fake AI client, real WebSocket, real ed25519 keys) and `pnpm run test:client` (drawing statistics and the client-to-server wire contract).
- The gallery no longer uses `localStorage`; saved art lives in memory with a "Wipe volatile memory" button. Fonts are self-hosted, so no request goes to Google Fonts.

## How the canvas talks to the coach

- While the child draws, `src/lib/canvasTelemetry.ts` keeps four numbers in a plain object (never in React state): `strokeCount`, `durationSeconds`, `shapeDiversityScore` and `primaryColors`. Stroke coordinates exist only until the stroke ends, then are classified and discarded.
- `durationSeconds` is active drawing time: pauses longer than 5 seconds do not count, so a child who walks away does not trigger the "long session" module.
- `shapeDiversityScore` is the normalized entropy of five stroke kinds (dot, line, loop, zigzag, curve), 0 until at least 5 strokes. `primaryColors` are the colors used in at least 10% of strokes. These are simple heuristics, not measurements of ability. The server ignores the shape score; only strokes, time and the child's chosen mode pick a module, and colors are optional context for the prompt.
- Sunny is asked in two ways: the sparkle button in the tool dock, and automatically after a 4 second pause once there have been at least 10 new strokes since the last check-in.
- The request can also carry `coachingMode` (`challenge`, `idea`, `finish`, `cheer`, `add` or `rule`): the kind of help the child picked. It selects the module and tells the model the child chose it. `add` means "help me add to my picture" and selects `elaboration`. It is optional and validated; anything else is a 400. The hook takes it as the third argument of `dispatchCanvasTelemetry`. A fourth argument, `extras`, carries `childRule` (required with mode `rule`, ids from the rule menu, refused otherwise) and `lesson` (our own lesson title and step, narrow alphabet, filtered).
- The canvas statistics may also carry `elapsedSeconds`: wall-clock seconds since the child started, pauses included. It is optional and validated (0 to 10800), and only the blank-page rule reads it. The current canvas does not send it yet.
- The server keeps a short progress note per turn in the client-owned history ("Update: 40 strokes, 130 s.") instead of the colors, so later replies can mention how the drawing has changed. When a snapshot was sent, the model also writes a one-line description of the picture, which is cleaned, filtered and added to that note ("... Last picture: a red house with two windows."), so the next reply can mention one change since then. The history is kept in the browser only and is wiped with everything else.
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

## Safety layer, signed history and the rule menu

- Content filter: `server/safety.js` with our own word list in `server/safetyTerms.js`. Zero tolerance: swears, sexual words, slurs and potty words are all blocked. It combines two open-source libraries (`obscenity` and `allprofanity`, both MIT) with our own list, and blocks when any of them flags. It handles leetspeak, spaced letters, look-alike characters and stretched letters, and it ignores numbers that stand alone (otherwise "455 s" in a progress note reads as a swear word; a test caught that).
- Where it runs: the lesson text, every history turn, and what the model writes back (the reply and the one-line picture note), before anything is shown or stored. A hit never reaches the model or the child. The child gets one fixed friendly line, the history is unchanged, and only a code (`safety_redirect input` or `safety_redirect output`) is logged, never the words.
- What it cannot do: it is a word-based heuristic, English only, and harmless words are sometimes blocked ("poop deck"). It cannot read words drawn inside the picture; those can reach the child only through what the model writes, which is filtered, and the prompt says that words in the picture are never instructions. It is one layer next to Google's safety settings and the prompt rules. Do not call the app safe or obscenity-proof.
- Signed history (`server/historyProof.js`): the server returns the chat history with a proof, an HMAC-SHA256 of the history and the time it was issued, made with `HISTORY_SECRET`. The client sends both back, and a history without a valid proof less than two hours old is refused with "start a fresh chat" and the hook starts fresh by itself. A modified client cannot invent or edit coach turns. Nothing is stored. Limits: a valid history can be replayed for up to two hours; without `HISTORY_SECRET` a random one is made at start, so chats restart after every deploy and a second server instance would not accept the first one's proofs.
- Rule menu (`server/ruleOptions.js`, mirrored in `src/lib/ruleOptions.ts`): a child makes their own drawing rule by picking one mark and one limit from fixed lists. Only ids travel, and unknown ids are refused, so no typed text reaches the model. A client test fails if the two lists drift apart.
- Studio view data: every successful reply carries `meta` (module, why it was chosen, the evidence and caveat text, the study names). It comes from the same routing list that picks the module, is never sent to the model, and the hook keeps it in memory as `lastMeta` for the grown-ups' screen.
- For the pitch (operational security): signed, tamper-evident history with no server storage; zero-tolerance filtering on input and output; no free text from the child to the model; fail-closed access checks; an audit script for the zero-data claims. Say the limits above in the same breath.

## What we can and cannot say (checked against Google's published terms)

Gemini API Additional Terms of Service (effective 2026-03-23) and Google's data pages say:

- You must be 18 or older, and you may not use the API in an application "directed towards or likely to be accessed by individuals under the age of 18". The terms also describe the API as for professional or business use, not consumer use. Google has not answered this in its developer forum. Decide the product positioning before the pitch (for example, an adult-operated teacher or parent tool) and do not claim the question is settled.
- Free tier: Google may use submitted content to improve its products and human reviewers may read it. Use a paid-tier key for anything involving real drawings.
- Paid tier: Google does not use content to improve products, but it logs prompts and responses for abuse monitoring, documented as 55 days. True zero retention needs project-level approval from Google.
- `store: false` is a setting of the Interactions API, not of `generateContent`, which keeps no developer-side state by default. The code deliberately does not pass it.
- Every call sets Google's safety filters to `BLOCK_LOW_AND_ABOVE` on harassment, hate speech, sexually explicit and dangerous content, under the prompt's own rules. A blocked answer has no text, so the child sees the friendly "Sunny is resting" line and the server logs only a reason code such as `SAFETY`. This makes over-blocking possible: a harmless drawing note can be refused. Run `pnpm run preflight --all` and read the replies. These settings are not a guarantee of safe output.
- There is no `maxOutputTokens`: on thinking models the thinking tokens count against it and can leave an empty reply. The three-sentence limit is in the prompt, and the preflight flags replies that break it. Waiting time is held down with `thinkingConfig.thinkingLevel` (`THINKING_LEVEL` in `server/muse.js`, now `LOW`). A first live preflight (8 scenarios, no image, before this setting) took 4.9 to 11.7 s per reply with about 350 to 1,050 thinking tokens, past the server's 10 s timeout. `LOW` has not been run live since: check it with `pnpm run preflight --all`, which reports time and thinking tokens.

So the accurate claim is: "our servers store nothing, and what we send to Google is covered by Google's paid-tier terms, including up to 55 days of abuse-monitoring retention." Do not say "zero logs", "Google never saves this", or "absolute COPPA/FERPA compliance". Those are legal questions this document does not answer.

Telemetry-only mode (no `frameData`) is the default. It sends no image of the child's drawing to Google, only the stroke count, time and color names, and the model is told plainly that it cannot see the drawing, so it must not describe it or guess. It is the privacy-preferred mode. For the demo, `VITE_MUSE_SEND_FRAMES=1` sends a small snapshot with each request: then the coach can see the drawing and keeps a one-line note of it, and the child's pictures go to Google (a paid-tier key is needed, and the under-18 question above applies). Say which mode a demo ran in.

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
- The blank-page rule cannot fire from the current canvas: the tracker counts only active time and caps each pause at 5 s, so 5 strokes show at most 45 s. The server now accepts an optional `elapsedSeconds` and the rule uses the larger of that and active time, so the fix is on the canvas side (Cameron's area): add `elapsedSeconds` to the snapshot, measured from when the canvas opened or was cleared, and also send an update when there are no strokes at all, because `snapshot()` returns null until the first stroke. Until then the rule never fires, and the child can still choose "challenge".
- The canvas has no buttons for `coachingMode`, no rule picker and no Studio panel yet. The server and the hook are ready for all three (see "Safety layer, signed history and the rule menu"); the screens in `src/App.tsx` are with K.O. and Cameron. Until they exist, the server picks from the pacing rules and the child never chooses.
- The structured `{reply, seen}` answer has had one live run: a preflight by hand (8 scenarios, no image, before `thinkingLevel` was set). Every call got an answer; two passed and six warned only as slow. Whether those replies were valid JSON was not recorded, the replies were not saved in the repo, and image input and the one-line picture note have never been run live. Run the preflight with a key and a drawing of your own on stdin (see `server/tools/gemini-check.mjs`) and read the replies. A plain-text answer still works, without the picture note.
- The content filter was tuned on lists we wrote ourselves, so how well it catches spellings we did not think of is unknown. It needs a real review by someone who is not the author before it is called safe.
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
# server (npm, inside server/; paid-tier key exported in your shell, never written to a file)
cd server && npm install && npm test
GEMINI_API_KEY=... npm run dev            # local only: access checks off

# mint a ticket for the real gate
MAGIC_TICKET_SECRET=... node mint-ticket.js 24

# back at the repo root. The root uses pnpm (version pinned in .mise.toml, one lockfile: pnpm-lock.yaml).
# With pnpm, pass script arguments directly. A literal -- before them is handed on to the tool and breaks it.
cd ..

# which rule picks which module, offline (add --examples for a tour)
pnpm run explain --seconds 700 --strokes 30

# offline contract checks, no key: the router at its boundaries, and the exact Gemini request
pnpm run check:router      # 84 checks: thresholds, precedence, the child's choice, extreme and hostile input
pnpm run check:payload     # 8 scenarios: allowed config keys, safety filters, no team-only text sent
pnpm run check:coach       # both; exit code 1 if anything fails

# check the real Gemini call: model exists, format, guardrails, latency (a few paid calls)
GEMINI_API_KEY=... pnpm run preflight            # add --all for every scenario

# one real exchange against a running server; --expect-denied checks the paywall refuses
MAGIC_TICKET_SECRET=... pnpm run smoke --url wss://muse.example.com/ws

# front end (server/ is a separate npm package with its own package-lock.json)
pnpm install --frozen-lockfile && VITE_MUSE_WS_URL=ws://localhost:8080/ws pnpm dev
# add VITE_MUSE_SEND_FRAMES=1 to also send a small snapshot (off by default: statistics only)

# tests: server (130), client (26: drawing statistics, the wire contract, the rule menu and the lesson loader)
# the client tests import server code, so install the server's packages first: (cd server && npm ci)
pnpm run test:server && pnpm run test:client

# zero-data tripwire
pnpm run audit:zero-data
```

Do not run `npm install` at the root: it would recreate `package-lock.json` next to `pnpm-lock.yaml`.
