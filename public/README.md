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

With `?session=<id>` the page reads the live session from `GET
/api/sessions/:id` and follows it over D's WebSocket. Without one it shows the
sample fixture with the upload strip on top.

## The first part of the page: upload → extraction → board

The strip at the top of the sample board is a drop zone (drag a file onto it,
browse, or press *Use the demo invoice*). Files are checked client-side against
the same limits as `src/platform/safety.ts` — 10 MB, PDF/image/DOCX/XLSX — so a
wrong file costs a sentence, not a round trip.

`POST /api/documents` answers 202 with a `sessionId` before extraction has run,
and `GET /api/sessions/:id` answers 404 until the Workflow seeds the session.
So the page navigates to `?session=<id>` and shows an extraction-status screen
that polls every 2 seconds and opens the board the moment the session lands.
The steps after "uploaded" are shown as one piece of work in progress, not as
checkmarks — the Workflow reports nothing until it finishes, and the screen
does not pretend otherwise. The uploaded filename survives the navigation via
sessionStorage, best-effort.

One CSP consequence to know when editing: `style-src` has no `unsafe-inline`,
so a `style="…"` attribute in rendered markup is silently dropped. Widths and
guide positions land through the CSSOM (`el.style.x = …`) instead.

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

- The Standard tab derives its rows from this page's decisions rather than
  `GET /api/audit`.
- The extraction screen cannot tell a failed Workflow from a slow one — the
  session API only answers 404 or the session. After a couple of minutes it
  says so and offers a restart, but a status endpoint would say it sooner.
