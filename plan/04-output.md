# 4. The document we send back

**Zuriel owns this.**

**You own:** turning the updated standard into something a customer receives.
This is the last thing the demo shows, so it has to look finished.

## Deliver

- An endpoint that renders the current standard as a document.
- A format we can show on a screen and a customer could actually use.
- It reflects decisions immediately. Fix a flag, regenerate, see the fix.

## The interface you must honour

In: the current standard from owner 2. Out: a file or a page.

## What you can stub

Everyone. Hand-write a standard as JSON and render from it.

## First hour

Render a hardcoded standard into a page that looks like a real product sheet.
Getting it to look finished is the work; wiring it up is twenty minutes.

## Watch for

- **HTML before PDF.** PDF generation in a Worker will eat your day. A clean
  page that prints well is worth more than a fought-for PDF.
- **Say which version this is.** A document with no timestamp is not evidence of
  anything.
- **Show what changed.** Marking the fields a reviewer touched turns the output
  from a list into proof the pipeline did something.

## Done when

Changing a decision and regenerating visibly changes the document.
