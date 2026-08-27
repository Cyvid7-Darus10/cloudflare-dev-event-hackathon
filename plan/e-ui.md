# E — The flag board

**Cyrus owns this.**

**You own:** `public/`. The screen where a person triages flags. This is what
gets demoed, so it carries the story.

**Spend the polish budget here.** It is the only screen a judge will actually
look at.

## Deliver

- Upload / drop zone → live extraction status → **the flag board** → publish →
  PDF download.
- The board: the invoice line on the left, the standard on the right, flags
  coloured by status, and three actions per flag — accept the standard, accept
  the document, or edit.
- A **Standard** tab showing version history, so the learning is visible. This
  is the tab that proves the payoff.
- Live updates as other reviewers resolve flags.

## The interface you must honour

In: a `ReviewSession` from D. Out: a resolution per line.

## What you can stub

Everyone. `fixtures/session-a.json` served statically from minute zero. Swap to
the real WebSocket at integration.

**Copy the fixture from `fixtures/`, do not fork it.** A private copy that
drifts means you demo a screen built for data that no longer exists.

## First twenty minutes

The flag board, from the fixture. No upload, no socket. Make one flag readable
at a glance and the rest follows.

## Agree the WebSocket envelope with D, now

Three lines: what a resolution looks like going up, what an update looks like
coming down. Not blocking until T+70, guaranteed to bite at T+70. See
`plan/contract.md`.

## Watch for

- **Show both values, always.** A flag that says "mismatch" without showing what
  the supplier billed and what the standard holds sends a reviewer back to the
  PDF, and the tool has failed.
- **Print C's `reason` verbatim.** It already says what differs and what it
  costs. Do not compose your own sentence from the values.
- **Show what passed, quietly.** `status: 'match'` flags are in the data so a
  reviewer can see the line was checked. Quiet, not absent.
- **Make the money visible.** The UOM mismatch is worth S$1,200 on the demo
  invoice. If the board does not say so, the judge does not feel it.
- **Show the count and the progress.** Twelve flags with no sense of how many
  are left reads as endless.
- **A decision must be undoable before it commits**, or make committing
  explicit. Reviewers misclick, and this one writes to the standard.
- **Do not block the screen on the model.** If extraction is slow, show the
  status and then the flags you have.
- **No build step if that is faster.** Plain HTML plus
  `<script type="module">` is fine and removes a whole class of risk.

## Done when

Someone who has not seen the project can open the board, understand one flag,
and resolve it without being told how — and the Standard tab shows their change
in the version history.
