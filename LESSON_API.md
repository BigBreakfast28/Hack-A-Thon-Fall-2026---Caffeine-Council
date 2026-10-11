# Connecting lessons to the server

**Status:** the server generates lessons with Gemini (`server/lessons.js`). Gemini plans the steps and sends a few simple shapes per step; the server checks every shape and draws each step's picture itself (earlier steps in gray, the new part in coral). Every word passes the same child-safety check as Sunny's replies, and step titles must fit the coach's lesson alphabet. Each lesson is generated once and kept in memory until the server restarts. Only the lesson ids listed in `server/lessons.js` are accepted, and no child data is part of the request.

The front end finds the lesson server automatically from `VITE_MUSE_WS_URL` (`wss://host/ws` becomes `https://host`). Set `VITE_API_URL` only if lessons live on a different server.

The app no longer hardcodes lesson steps. All lesson content lives in `src/lessons.ts`.

## How it works

When a kid opens a lesson, the app calls `getLessonSteps(lesson)`:

1. If a lesson server is set (`VITE_API_URL`, or the same server as the coach), it asks for that lesson's steps. It waits at most 6 seconds.
2. If there is no server, or it is slower than that, fails, or sends the wrong shape, the child gets the starter steps in `src/lessons.ts` straight away.
3. A slow request is not cancelled. It finishes in the background and is kept in memory, so the next time that lesson opens, the server's steps are already there. A failed request is not kept, so it is tried again.
4. When the child picks an art style, the app starts loading that style's lessons at once, while the child chooses, so they usually open instantly.

So the demo always works, even while the server is down, and a child never stares at a loading screen for long.

On the server side, every lesson is generated in the background when the server starts (set `LESSON_PREWARM=off` to skip that), so the first child usually finds them ready. A lesson that fails is left alone for 60 seconds before the next attempt. The first real run of all this against Gemini has not happened yet: only offline tests cover it.

## Turning the server on

Create a file named `.env` in the project folder (Git already ignores it):

```
VITE_API_URL=http://your-vultr-server:8000
```

Restart the dev server (or rebuild) after changing it.

**Never put the Gemini or ElevenLabs keys in this file or anywhere in the React code.** Anything in the front end can be seen by anyone who opens the app. The keys belong only on the server.

## What the app asks for

```
GET {VITE_API_URL}/api/lessons/{lessonId}?style={styleId}
```

- `lessonId`: for example `cozy-room`, `little-train`, `bamboo-stalk` (full list in `src/lessons.ts`)
- `styleId`: `realism`, `sumi-e`, or `graphic-novel`

## What the server must send back

```json
{
  "steps": [
    {
      "title": "Let's find the room",
      "copy": "Start with one big, soft rectangle.",
      "demo": "One big rectangle makes the room.",
      "imageUrl": "https://.../step1.png"
    }
  ]
}
```

| Field | Required | What it is |
|---|---|---|
| `title` | yes | Short heading for the step |
| `copy` | yes | The instruction the kid reads (and Sunny says out loud) |
| `demo` | yes | One-line caption under the picture |
| `imageUrl` | no | Picture for this step. A normal link or a `data:image/png;base64,...` string both work. If missing, the lesson's icon is shown. |

Any number of steps works; the app counts them.

The server must allow the app's address to call it (CORS). For a hackathon, allowing all origins is fine.

## Adding a new lesson

Add a line to the `lessons` list in `src/lessons.ts`. It shows up under its style automatically. Starter steps for it are optional.
