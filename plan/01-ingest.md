# 1. Ingest and extract

**Bryan owns this.**

**You own:** getting a customer's document in, and turning it into JSON that
matches the contract.

## Deliver

- An endpoint that accepts a file upload and stores it in R2.
- Extraction with Workers AI: document in, array of product records out.
- The output conforms to the contract, or the request fails loudly. Never pass a
  half-parsed record downstream.

## The interface you must honour

You produce an array of product records exactly as `contract.md` defines them.
Owner 2 consumes it. Nothing else about your internals matters to anyone.

## What you can stub

The whole of owners 2, 3 and 4. Write your extracted JSON to a file and open it.
If it matches the contract, you are done regardless of what else exists.

## First hour

Skip the upload. Hardcode one document's text in a test, run it through Workers
AI, and get a conforming array out. Extraction is the risk. The upload is not.

## Watch for

- **The model will invent fields.** Validate the output against the contract with
  zod and reject what does not fit. A confident wrong record is worse than a
  failed parse.
- **A missing value is not an empty string.** If the document does not say,
  the field is absent and gets flagged. Do not let the model fill the gap.
- **Same document twice must not mean two runs.** Hash the file and reuse the
  previous extraction. Owner 2 needs this to keep flags stable.

## Done when

Two genuinely different customer documents produce conforming JSON, and a
document with a missing field produces a record with that field absent rather
than guessed.
