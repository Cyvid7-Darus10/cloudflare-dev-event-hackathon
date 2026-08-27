# C — Match, diff, and the write-back

**Michelle owns this.**

**You own:** `src/matching/`. Matching an invoice line to a catalogue SKU,
flagging every field difference, and the write-back that makes the standard
learn.

**This is the centre of the project.** Everything else is a mouth or a hand. The
write-back is the reason the demo has a payoff.

## Deliver

- `match(invoice, standard) → LineReview[]`. Pure functions, no network in the
  diff half.
- The write-back functions D calls on a resolution.
- A Vectorize seeding script for the catalogue.

## Matching — in order, first hit wins

1. `sku` matches `standard_products.sku` exactly → `exact`, score 1.0
2. Normalised `description` hits `standard_aliases.alias` → `alias`, score 0.95
3. Embed the description with `@cf/baai/bge-base-en-v1.5`, query Vectorize; top
   hit ≥ 0.82 → `semantic`, score = similarity
4. Otherwise → `none`, and every field on that line is `unmatched`

Normalising means lowercase, punctuation stripped, whitespace collapsed. Use the
same function in the matcher and in the alias writer, or tier 2 will miss the
aliases tier 3 just taught it.

## Diffing

- **`unitPrice`** — mismatch if it differs from `listPrice` by more than 0.5%.
  The `reason` spells out the delta and the money at stake across the quantity.
- **`uom`** — mismatch on any difference. This is where real money hides: a price
  per *case* billed per *unit*.
- **`description`** — mismatch if it is neither the canonical name nor a known
  alias. **This is the one whose acceptance teaches the system.**
- **`lineTotal`** — recompute `quantity * unitPrice` from the document's own
  numbers and flag arithmetic errors. Not a re-pricing; the price argument
  belongs to the `unitPrice` flag.
- **`taxCode`** — see the open question in `plan/contract.md`. A settles it.

Emit a flag for matching fields too, with `status: 'match'`. E needs to show
what passed, not just what failed.

## Write-back — get this right or there is no demo

- **`accept_standard`** → the document was wrong. **No change to the standard.**
  Write the corrected value into `finalValues` for the published invoice.
- **`accept_document`** → the standard was stale. `UPDATE standard_products`,
  bump `version`, insert the vendor's `description` into `standard_aliases`,
  upsert the embedding into Vectorize, insert an audit row, purge the KV
  snapshot.
- **`edited`** → the operator supplied a third value. Same path as
  `accept_document`, with `actor` recorded.

All five steps of the `accept_document` path, or the learning is partial and
invoice B still flags. The alias insert is the one people forget, and it is the
one the demo turns on.

## What you can stub

Everyone. `fixtures/invoice-a.json` and `fixtures/standard.json` are your
inputs, and `fixtures/session-a.json` is what your output should look like.
**You are never blocked.**

## First twenty minutes

The diff, against the two fixtures, as a pure function. No D1, no Vectorize, no
Worker. That function is the product.

## Watch for

- **Write the audit row in the same transaction as the update.** A standard that
  moved with no record of why is worse than one that did not move.
- **Purge the KV snapshot on every write.** Miss it and invoice B matches against
  a cached stale catalogue — the demo's payoff silently fails, and it will look
  like the learning did not work.
- **Nothing except a human resolution writes to the standard.** Not extraction,
  not the matcher, not a convenience path added at T+100.
- **Compare money with a tolerance, never with `===`.**

## Done when

`fixtures/invoice-a.json` against `fixtures/standard.json` reproduces
`fixtures/session-a.json`: six lines needing a decision, one stale price, one
UOM mismatch, one arithmetic error, one unknown product name, one alias hit, one
semantic hit, one unmatched line. Then accepting the document on the unknown
name makes `fixtures/invoice-b.json` match with zero flags.

**This is the one thing worth real unit tests.** Write them.
