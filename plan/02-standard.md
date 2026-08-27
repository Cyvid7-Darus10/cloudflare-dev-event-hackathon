# 2. The standard and the diff

**Michelle owns this.**

**You own:** the canonical product data, the comparison that produces flags, and
applying a reviewer's decision.

This is the centre of the project. Everything else is a mouth or a hand.

## Deliver

- A Durable Object holding the standard. One instance, named, so two reviewers
  cannot overwrite each other.
- A diff: given extracted records and the standard, return flags per the contract.
- Apply a decision: accepted and edited values change the standard, rejected
  ones do not.
- An audit row per decision: which field, which value won, when.

## The interface you must honour

In: an array of product records from owner 1.
Out: an array of flags for owner 3, and the current standard for owner 4.

## What you can stub

Owner 1 entirely. Hand-write the input array and diff against it.

## First hour

The diff, against two hardcoded arrays. No Durable Object yet, just a function
that takes two shapes and returns flags. That function is the product.

## Watch for

- **Write the audit row before you answer.** A Durable Object hibernates. If it
  acknowledges a decision and then sleeps before persisting, the standard moved
  and nothing recorded why.
- **A field the standard has never seen is not a mismatch.** Decide what a new
  field means and flag it as its own kind, or reviewers will drown.
- **Reprocessing the same document must not duplicate flags.** Key them by
  document plus field.
- **Do not let anything except an accepted decision write to the standard.** Not
  extraction, not the model, not a convenience path added at 4pm.

## Done when

Two arrays produce correct flags, accepting one changes the standard, rejecting
one does not, and both leave an audit row.
