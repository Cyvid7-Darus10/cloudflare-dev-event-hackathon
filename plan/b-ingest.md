# B — Ingest and extraction

**Bryan owns this.**

**You own:** `src/ingest/`, `src/workflows/ingest.ts`. Getting a supplier's
invoice in, and turning it into an `ExtractedInvoice` that C can trust.

## Deliver

- `POST /api/documents` → R2 put → `documents` row → Workflow trigger.
- The Workflow, as durable steps: `toMarkdown` → LLM extraction →
  hand to C's matcher → seed the session DO.
- A Queue consumer for the bulk path, running the same Workflow per document.
- The demo invoice PDFs — invoice A, and invoice B from the same vendor with the
  same odd product naming.

## The interface you must honour

You produce an `ExtractedInvoice` exactly as `contracts.ts` defines it. C
consumes it. Nothing else about your internals matters to anyone.

## What you can stub

C, D and E entirely. Write your extracted JSON to a file and diff it against
`fixtures/invoice-a.json`. If it conforms, you are done regardless of what else
exists.

## First twenty minutes

Skip the upload. Hardcode one invoice's Markdown in a test, run it through
extraction, and get a conforming `ExtractedInvoice` out. **Extraction is the
risk. The upload is not.**

## Watch for

- **Malformed JSON from the model is the single most likely failure in the whole
  project.** Constrain with a schema, validate, and repair exactly once. Then
  stop — a second repair loop eats the clock.
- **Build the escape hatch at T+70, not at T+118.** Wire `?demo=1` to serve
  `fixtures/invoice-a.json` directly, bypassing the LLM. If extraction misbehaves
  on stage, the demo still runs.
- **The model will invent line items.** A line that was not on the document is
  worse than a line you failed to parse. Validate and reject rather than accept
  a confident hallucination.
- **A missing value is not zero and not an empty string.** `sku: null` when the
  line carries no SKU — that is what sends C to the alias and semantic tiers.
  Never let the model fill the gap with a plausible SKU.
- **`lineId` is positional and stable** — `L0`, `L1`, … in document order. D and
  E have no other handle on a line. Do not renumber on a re-extraction.
- **Keep `rawText`.** It is what a reviewer reads when they do not trust a flag,
  and it costs you nothing to carry.
- **Put every AI call through the AI Gateway.** It is a config line, and it gives
  A a dashboard to show a judge.

## Done when

Two genuinely different invoice PDFs produce conforming `ExtractedInvoice`s, a
line with no SKU comes out with `sku: null` rather than a guess, and `?demo=1`
returns the fixture without touching the model.
