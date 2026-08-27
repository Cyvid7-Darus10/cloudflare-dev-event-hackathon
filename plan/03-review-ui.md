# E. The review screen

**Cyrus owns this.**

**You own:** the screen where a person triages flags. This is what gets
demoed, so it carries the story. Spend the polish budget on the **flag board**.
It is the only screen a judge will actually look at.

Keep the existing Vite app in `ui/`. Do not start a `public/` second frontend.
The old `ui/src/types.ts` and `ui/src/fixture.ts` describe catalogue
reconciliation — replace them with the frozen `ReviewSession` types and
`fixtures/session-a.json`.

## Deliver

Screens, in demo order:

1. Upload / drop zone for an invoice PDF (`POST /api/documents`).
2. Live extraction status (`extracting` → `ready`).
3. **The flag board** — invoice line on the left, standard on the right,
   flags coloured. Per flag: accept standard / accept document / edit.
4. Publish → PDF download.
5. A small **Standard** tab: current catalogue plus version history, so the
   learning is visible.

Wire to `fixtures/session-a.json` from minute 0. Swap to
`WS /api/sessions/:id/ws` at integration. Poll `GET /api/sessions/:id` if
WebSockets get cut.

Two browser windows on the same session: an accept in one appears in the
other. That is the DO story made visible.

## The interface you must honour

In: a `ReviewSession`. Out: flag resolutions that Zuriel applies and Michelle
writes back. Do not invent a second flag shape — see `contract.md` for how
per-flag clicks map onto `LineReview.resolution` and `finalValues`.

Actions are `accept_standard` / `accept_document` / `edited`, not the old
`accepted` / `rejected` / `edited`.

## What you can stub

Everyone. `fixtures/session-a.json` is a fully-flagged session. Build the
whole board against it.

## First stretch (T+10–70)

The flag board, from the fixture. No connection, no upload. Make one mismatch
readable at a glance — document value, standard value, money at stake, three
actions — and the rest follows.

## Watch for

- **Show both values, and the reason.** A flag that says "mismatch" without
  the two numbers and the delta makes a reviewer open the PDF, and the tool
  has failed.
- **A decision must be undoable before it commits**, or make committing
  explicit. Reviewers misclick. Write-back is what teaches the catalogue;
  a misclick that inserts a bad alias poisons invoice B.
- **Show the count.** Pending vs resolved. Forty flags with no progress reads
  as endless.
- **Do not block the board on the model.** If extraction is slow, show
  `extracting` and then the flags you have. `?demo=1` is Bryan's escape hatch;
  use it in the demo if the LLM hangs.
- **The Standard tab is not optional polish.** Without version history, the
  learning loop is a claim rather than a thing the judge can see.

## Done when

Someone who has not seen the project can open the board, understand one flag,
resolve it without being told how, switch to Standard, and see that the
version moved.
