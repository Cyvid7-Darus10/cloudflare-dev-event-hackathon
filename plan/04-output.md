# D. Session, API, and the published invoice

**Zuriel owns this.**

**You own:** the review session (a Durable Object per session), the HTTP and
WebSocket API, calling Michelle's write-back, and publishing a corrected
invoice PDF.

This used to be "render the standard as a product sheet". It is now: hold the
live review, then emit the *corrected invoice* — the original lines with
`finalValues` applied.

## Deliver

- `src/session/ReviewSession.ts` — one DO per session. Holds the
  `ReviewSession` object. Serialises edits. WebSocket Hibernation API so two
  reviewers see the same board.
- `GET /api/sessions/:id`
- `WS /api/sessions/:id/ws`
- Resolution handler: apply the flag action, call Michelle's write-back, broadcast.
- `POST /api/sessions/:id/publish` — corrected invoice as HTML → Browser
  Rendering → R2 → download URL.
- `GET /api/standard` and `GET /api/audit` (thin reads over D1; Siva can stub
  the SQL if the migration is late).

## The interface you must honour

In: `LineReview[]` from Michelle (Bryan's workflow seeds you).
Out: session JSON and WS events for Cyrus; write-back calls into Michelle;
a PDF (or HTML fallback) for the demo.

Do not reimplement matching or catalogue mutation. You hold state and you
call functions.

## What you can stub

Everyone. Seed the DO from `fixtures/session-a.json`. Render a hardcoded
corrected invoice as HTML from that fixture's `finalValues`.

## First stretch (T+10–70)

1. DO that loads the fixture, serves `GET`, accepts one resolution, echoes it
   on the WebSocket.
2. HTML for the corrected invoice that looks like a real invoice — vendor,
   number, lines with before/after on flagged fields, timestamp, session id.
   Getting it to look finished is the work; Browser Rendering is twenty
   minutes once HTML exists.

## Watch for

- **The DO is the session, not the catalogue.** Two reviewers racing is a
  session problem (you). Two reviewers updating the same SKU is a D1 write
  problem (Michelle's write-back). Do not put `standard_products` in DO
  storage.
- **Write-back before you broadcast.** If you tell the UI it landed and then
  the D1 write fails, Cyrus will show a lie and invoice B will not learn.
- **Browser Rendering needs Workers Paid.** If Siva cut it at T+0, serve the
  HTML with a print stylesheet and hit Cmd-P. Same narrative.
- **Say which version this is.** A PDF with no timestamp and no session id is
  not evidence the pipeline did anything. Mark the fields the reviewer
  touched.
- **Publish uses `finalValues`, not the catalogue dump.** The customer
  receives a corrected invoice, not our price list.

## Done when

- `GET /api/sessions/:id` returns the fixture session as `ready`.
- Resolving a flag persists, shows up on a second WS client, and (for
  `accept_document`) is visible in `GET /api/audit`.
- Publish returns a file (PDF or HTML) whose line prices match `finalValues`.
