# D — Session DO, API, and publish

**Zuriel owns this.**

**You own:** `src/session/ReviewSession.ts`, `src/api/`. The live review session,
the API around it, and the corrected invoice that comes out the end.

## Deliver

- The `ReviewSession` Durable Object — one per review, using the **WebSocket
  Hibernation API**. Holds flag state, serialises edits, broadcasts to everyone
  watching.
- `GET /api/sessions/:id` and `WS /api/sessions/:id/ws`.
- The resolution handler, calling C's write-back.
- `POST /api/sessions/:id/publish` → corrected HTML → Browser Rendering → R2 →
  download.
- `GET /api/standard` and `GET /api/audit`.

## The interface you must honour

In: `LineReview[]` from C, seeded by B. Out: a `ReviewSession` over HTTP and
WebSocket for E, and a resolution handed to C's write-back.

## What you can stub

Everyone. `fixtures/session-a.json` is a complete session — load it into the DO
and serve it. C's write-back can be a function that logs and returns.

## First twenty minutes

The DO holding `fixtures/session-a.json`, served over `GET /api/sessions/:id`.
Then the WebSocket. Then publish.

## Agree the WebSocket envelope with E, now

`contracts.ts` does not define the message shape, and this is the one gap in the
contract. Three lines, agreed in the first ten minutes, written into
`plan/contract.md`: what a resolution looks like going up, what an update looks
like coming down. It does not block either of you until T+70 and it is
guaranteed to bite at T+70.

## Watch for

- **Use the WebSocket Hibernation API, not a held connection.** A DO with an
  open socket that never hibernates is a DO that bills and eventually drops.
- **Persist before you acknowledge.** A DO hibernates. If it confirms a
  resolution and sleeps before the write lands, the standard moved and nothing
  recorded why.
- **A resolution is idempotent.** Two reviewers clicking accept on the same flag
  must not write the standard twice or bump `version` twice.
- **Broadcast after the write-back, not before.** The other browser should see
  the state that actually persisted.
- **HTML before PDF.** Get the corrected invoice looking finished as a page
  first. Browser Rendering is one call once the HTML is right, and it is the
  fallback if the binding is not available.
- **Show what changed.** Marking the lines a reviewer touched turns the output
  from a list into proof the pipeline did something.
- **Say which version this is.** A document with no timestamp is not evidence of
  anything.

## Done when

Two browser windows on the same session show each other's accepts live, a
resolution leaves an audit row visible at `GET /api/audit`, and publishing drops
a corrected PDF in R2 that downloads.
