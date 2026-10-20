# Realtime Voice Session Handoff

Run voice calls that last longer than a single realtime session. This template simulates a sales training call. It hands the conversation to a fresh [AI Gateway](https://vercel.com/ai-gateway) realtime session between turns, keeps one speaker-labelled transcript across sessions, and grades the call when it ends.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-fieldeng%2Frealtime-session-handoff&project-name=realtime-session-handoff&repository-name=realtime-session-handoff&demo-title=Realtime+Voice+Session+Handoff&demo-description=Run+voice+calls+longer+than+a+single+realtime+session+on+AI+Gateway.)

## Features

- **Long calls on realtime voice.** Sessions are chained at a quiet moment between turns, so the caller hears one continuous conversation.
- **Continuity across sessions.** Each new session gets the persona, a rolling summary, and the latest turns word for word, and keeps the same voice.
- **One transcript.** Speaker labels come from the realtime session itself, so you don't need a diarization step.
- **Grading when the call ends.** The transcript is sent to a grader that scores it against a rubric with structured output. Every judgment cites transcript turns, and the evidence is checked in code.
- **Built on** Next.js, the [AI SDK](https://ai-sdk.dev) realtime API, and AI Gateway, with Geist for the UI.

## Why sessions need a handoff

AI Gateway ends each realtime session at a fixed limit, closing with code 1001 about 13 minutes in. A training call, support call or interview can run longer. Reconnecting on its own doesn't help, because a new session starts with no memory and the caller hears a reset. This template makes the switch at a natural pause and carries the conversation over.

```
session #1 ──────────────────────────────┐
                 soft threshold          │ quiet moment
                 │ summarize + pre-warm  │ ▼
session #2       └──── connected, mic off ┴── mic on ─────────────── ...
```

1. **Watch the clock.** Each session's age is measured from when it connected.
2. **Prepare at the soft threshold.** Fold the transcript into a rolling summary, then connect the next session with carryover instructions and the microphone off.
3. **Switch at a quiet moment.** Wait until the AI has finished speaking, the caller isn't talking, and the line has been quiet for 800 ms. Then move the microphone over and close the old session.
4. **Force it at the hard threshold.** If nobody pauses, switch anyway and let the new session pick the thread back up. A clipped sentence beats being cut off by the server.
5. **Recover.** If a session closes unexpectedly, promote the warm session or reconnect from the same carryover.

When the call ends, the transcript is POSTed to `/api/score`. The page shows the payload and the scorecard that comes back.

## Project structure

| File | What it does |
|---|---|
| `lib/handoff/call-controller.ts` | The state machine: sessions, timing, mic handover, recovery, sending the transcript to grading |
| `lib/handoff/turn-gate.ts` | Pure decision: wait, prepare, or switch |
| `lib/handoff/carryover.ts` | Builds the next session's instructions |
| `lib/handoff/transcript.ts` | One transcript across sessions |
| `lib/handoff/realtime-session.ts` | A thin AI SDK session wrapper. `useRealtime` gives one session per hook, and a handoff needs two at once |
| `lib/handoff/persona.ts` | The simulated customer. Swap in your own scenario |
| `lib/scoring/rubric.ts` | Rubric, output schema and grader instructions (illustrative) |
| `lib/scoring/score.ts` | Evidence validation and the final result |
| `app/api/realtime/token/route.ts` | Mints a short-lived client secret per session |
| `app/api/handoff/summary/route.ts` | The rolling summary used for carryover |
| `app/api/score/route.ts` | Grades the finished call |

## Running locally

```bash
pnpm install
cp .env.example .env.local   # add AI_GATEWAY_API_KEY
pnpm dev
```

Open http://localhost:3000, start a call, and talk. With the default timing (`HANDOFF_SOFT_SECONDS=90`, `HANDOFF_HARD_SECONDS=150`) the first handoff happens after about 90 seconds, or press **Hand off at next pause**. For real calls, use `660` / `740`.

When deployed on Vercel, AI Gateway authenticates with OIDC, so no API key is needed. See `.env.example` for model and timing settings.

```bash
pnpm test        # turn gate, carryover, transcript, token route, scoring
pnpm typecheck
```

## Caveats

- **Refreshing instructions at switch time.** Turns spoken while the next session was warming up are added with a second `session-update`. That works for OpenAI realtime models. Gemini Live closes the session with code 1008 if it gets a second `session-update`, so the app skips the refresh for `google/` models.
- **The handoff is near-seamless, not perfect.** The new session has the conversation as text, not audio, so delivery can shift slightly, and a forced mid-turn switch can be heard.
- **A connection can still drop during platform maintenance.** The recovery path covers that by reconnecting from the carryover.
- **The rubric is an example.** Replace it with your own criteria, and have your compliance team own any compliance gates.
- **`EXTENDED_TIME` stays off by default.** It opts in to longer sessions through an undocumented AI Gateway test feature with no stability guarantees.
