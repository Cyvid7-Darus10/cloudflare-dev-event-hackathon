# 3. The review screen

**Siva owns this.**

**You own:** the screen where a person triages flags. This is what gets demoed,
so it carries the story.

## Deliver

- A list of flags: field, what the customer sent, what the standard says.
- Three actions per flag: accept the customer's value, keep the standard, or
  type a correction.
- Matching fields visible but quiet, so a reviewer can see what passed without
  reading it.
- The standard updates live as decisions land.

## The interface you must honour

In: flags from owner 2. Out: decisions back to owner 2.

## What you can stub

Everyone. Put twenty hand-written flags in a JSON file and build the whole screen
against it. Swap the fixture for the live connection when owner 2 is ready.

## First hour

The flag list, from a fixture. No connection, no upload. Make one flag readable
at a glance and the rest follows.

## Watch for

- **Show both values.** A flag that says "mismatch" without showing what the
  customer sent makes a reviewer open the original document, and the tool has
  failed.
- **A decision must be undoable before it commits**, or make committing explicit.
  Reviewers misclick.
- **Show the count.** Forty flags with no sense of progress reads as endless.
- **Do not block the screen on the model.** If extraction is slow, show the
  flags you have.

## Done when

Someone who has not seen the project can open the screen, understand one flag,
and resolve it without being told how.
