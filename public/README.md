# Flag board — workstream E

Owner: Cyrus. Files: `public/`.

**No build step.** Plain HTML plus an ES module. Person A points the assets
directory at `public/` and that is the whole integration. Nothing to run before
a deploy, so a deploy can never ship a stale bundle.

```bash
cd public && python3 -m http.server 5181
# http://127.0.0.1:5181/index.html
```

## What it reads

A `ReviewSession` per `architecture.md`. Right now from
`public/fixtures/session-a.json`, a stand-in for Person A's
`fixtures/session-a.json`. Six lines covering every case the matcher can
produce: exact, alias, semantic, and no match, plus a stale price, a
unit-of-measure difference, and an arithmetic error.

To go live, replace `loadSession()` in `app.js` with D's WebSocket and send
resolutions back. Nothing else changes.

## Decisions worth keeping

**Money is on the summary bar.** "Overcharged by $84.00 if the standard is
right" is the sentence a reviewer is actually deciding about. A price difference
on 24 units is not the same decision as the same difference on one.

**Fields that agree are folded away.** Present, countable, one click from
readable. Left inline they outnumber the decisions and the board stops looking
like a list of things to do.

**Values are mono.** `12.5 cm` and `12.5cm` differ by one character. In a
proportional face a reviewer cannot tell which and has to open the original.

**`reason` is shown for every difference.** It is the only thing on screen that
explains *why* the machine raised this, and it is where the unit-of-measure trap
gets spelled out in money.

**Nothing commits until publish.** Every line has an undo and the publish button
stays disabled while anything is pending.

## Contract notes for Person A

Three things this screen ran into. Detail in the review.

1. **`accept_standard` is meaningless when `matchMethod` is `none`.** There is no
   standard row to accept. Both accept buttons are disabled on those lines and
   the UI offers *Assign a SKU* instead.
2. **An unmatched line cannot teach the standard** through `resolution` alone.
   The only route is `edited` carrying `finalValues.sku`, and the write-back
   spec does not mention creating an alias from an assigned SKU. Without that,
   the case that most needs learning never does.
3. **Resolution is per line, flags are per field.** A line with a price
   difference and a unit-of-measure difference resolves as one decision.
   Wanting the invoice's price but the standard's UOM means using `edited`.

## Not done

- No WebSocket. Decisions live in the page.
- Publish is inert; it needs D's endpoint.
- No upload screen. B owns ingest; this starts from a ready session.
- The Standard tab derives its rows from this page's decisions rather than
  `GET /api/audit`.
