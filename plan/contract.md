# The contract

**The contract is [`src/shared/contracts.ts`](../src/shared/contracts.ts), and
it is frozen.** It is reproduced in `architecture.md`; the file is the copy that
compiles, so the file wins. A owns it. Nobody changes it without saying so out
loud — a silent change breaks four workstreams at once.

This page holds what the type signatures cannot: the decisions behind them, and
the two questions still open.

## The shapes, and who hands what to whom

```
B ──ExtractedInvoice──> C ──LineReview[]──> D ──ReviewSession──> E
                        ^                   │
                   StandardProduct[]        └── resolution ──> C's write-back
```

- **`ExtractedInvoice`** — what B's extraction produces. C's only input from B.
- **`StandardProduct`** — a catalogue row. Lives in D1, cached in KV.
- **`LineReview`** — one invoice line, matched and flagged. C's output.
- **`ReviewSession`** — everything one document produced, held by the DO. What
  E renders and what D broadcasts.

Nothing else crosses a workstream boundary. Your internals are yours.

## Decisions the types do not carry

**`lineId` is positional and stable: `L0`, `L1`, …** in the order the lines
appeared on the document. It is the only handle D and E have on a line, so B
must not renumber on a re-extraction.

**Money is a `number`, in the invoice's `currency`.** No cents-as-integers, no
strings. At two hours, the rounding risk is smaller than the conversion-bug
risk. Compare prices with a tolerance, never with `===`.

**`unitPrice` mismatches use a 0.5% tolerance** — below that it is a rounding
artefact, not a disagreement. Every other field is an exact comparison after
normalising (lowercase, punctuation stripped, whitespace collapsed).

**`flags` carries agreement as well as disagreement.** A field that matches gets
a `FieldFlag` with `status: 'match'`. That is what lets E show a line as checked
rather than silent — a judge should see that seven fields passed and one did
not. A line is "needs a decision" when any flag is not `match`.

**`lineTotal` is an arithmetic check, not a re-pricing.** Compare
`quantity * unitPrice` against the stated `lineTotal`, using the document's own
numbers. If the price is also disputed, that disagreement belongs to the
`unitPrice` flag — re-pricing the line total as well double-counts one problem
and reads as two.

**`matchScore` is fixed per tier**, so E can show it without explaining it:
`exact` = 1.0, `alias` = 0.95, `semantic` = the actual similarity (floor 0.82),
`none` = 0. `confidence` on a `FieldFlag` is the confidence in *that comparison*
— 1 for a deterministic one, the match score for anything resting on a semantic
match.

**`reason` is written for a reviewer, not for a log.** It says what differs and
what it costs: *"Invoice bills S$72.90 against a list price of S$68.40 — 6.6%
over, S$54.00 across 12 CTN."* E prints it verbatim and never has to compose a
sentence. C writes them.

**`unmatched` is all-or-nothing.** If `matchMethod` is `none`, every flag on
that line is `unmatched`. There is nothing to compare against, so no field on it
can be a `match` or a `mismatch`.

**`finalValues` is only for the published document.** It is what the corrected
invoice prints. It never writes to the standard on its own — the write-back is
driven by `resolution`, not by this field.

## What each resolution does

The learning loop. Get this wrong and the demo has no payoff.

| `resolution` | Meaning | Standard | Published invoice |
|---|---|---|---|
| `accept_standard` | The document was wrong | untouched | `finalValues` gets the standard's value |
| `accept_document` | The standard was stale | `UPDATE`, `version` bumped, alias inserted, Vectorize upserted, audit row, KV purged | keeps the document's value |
| `edited` | Both were wrong; the operator typed a third value | same path as `accept_document`, with `actor` recorded | gets the typed value |

`pending` does nothing. A session can publish with pending lines; they simply
carry the document's values through.

## Two questions still open — settle them in the first ten minutes

**1. `taxCode` is a `FlaggedField`, but `ExtractedLine` has no `taxCode`.** So
there is nothing on the document to compare the standard's code against. Either
B extracts a per-line tax code, or the flag is always informational — the
standard's code, shown, never mismatching. The fixtures assume the second
(`documentValue: null`, `status: 'match'`). **A decides; C and E both depend on
it.** Do not change `ExtractedLine` to fix this without telling everyone.

**2. There is no WebSocket message contract.** D broadcasts and E listens, but
the envelope — message type, payload, how a resolution is sent — is not in
`contracts.ts`. E codes against `fixtures/session-a.json` until integration, so
this is not blocking until T+70, and it is guaranteed to bite at T+70.
**D and E: agree the envelope now, in three lines, and put it in this file.**

## Changing this

Through A, announced out loud, in the room. Not in a commit message nobody
reads.
