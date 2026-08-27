# B. Ingest and extract

**Bryan owns this.**

**You own:** getting a supplier invoice in, storing the original, and turning
it into an `ExtractedInvoice` that matches the contract.

This is no longer "array of product records from a catalogue PDF". It is one
invoice, with header fields and line items.

## Deliver

- `POST /api/documents` — multipart upload, put the bytes in R2, insert a
  `documents` row, start the ingest Workflow, return `{ sessionId }`.
- Workflow steps, in order:
  1. `env.AI.toMarkdown()` on the R2 object
  2. LLM extraction into `ExtractedInvoice` (JSON mode, schema-constrained;
     validate; one repair retry on failure)
  3. Hand the invoice to Michelle's matcher
  4. Seed Zuriel's ReviewSession DO
- Queue consumer for bulk: one Workflow instance per document. First item on
  the drop ladder — skip if behind.
- The demo PDFs: `fixtures/invoice-a.pdf` and `invoice-b.pdf`. Same vendor,
  same odd product naming on B, so the learning moment works.
- `?demo=1` on the upload endpoint seeds from `fixtures/invoice-a.json` and
  skips the LLM. Build this by T+70, not at T+118.

## The interface you must honour

You produce an `ExtractedInvoice` exactly as `contract.md` defines it.
Michelle consumes it. Nothing else about your internals matters to anyone.

## What you can stub

The whole of Michelle, Zuriel and Cyrus. Write extracted JSON next to the
fixture and diff it. If it matches the contract, you are done regardless of
what else exists.

## First stretch (T+10–70)

Skip the upload. Hardcode one invoice's markdown (or the fixture) and get a
conforming `ExtractedInvoice` out through Workers AI via AI Gateway.
Extraction is the risk. The R2 put is not.

## Watch for

- **Malformed JSON is the most likely failure in the whole project.**
  Constrain the schema, validate with zod, one repair retry, then fail the
  step so Workflows can resume it. Never pass a half-parsed invoice downstream.
- **The model will invent SKUs and totals.** If the PDF does not say, `sku` is
  `null`. Do not let the model fill the gap. Recompute nothing here — Michelle
  flags arithmetic errors.
- **Route every AI call through AI Gateway.** Caching and a token dashboard
  are the point, not a nice-to-have.
- **`invoice-b.pdf` must be extractable the same way as A.** If B's layout is
  a special case, the learning demo dies.

## Done when

Two genuinely different invoice PDFs produce a conforming `ExtractedInvoice`,
and `?demo=1` returns a `sessionId` without calling the LLM.
