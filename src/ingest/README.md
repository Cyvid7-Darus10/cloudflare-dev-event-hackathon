# Workstream B — Ingest and extract

**Bryan.** Supplier invoice in, `ExtractedInvoice` out, run by an agent.

```bash
npm install
npm test          # 74 tests, inside workerd
npm run typecheck
npx wrangler dev  # needs CLOUDFLARE_API_TOKEN: the AI binding is remote even locally
```

## The shape of it

`POST /api/documents` puts the bytes in R2, records a `documents` row, and
starts an **ingesting agent** — one Durable Object per document, named by the
session id. The upload answers with a `sessionId` immediately; the agent does
the slow part and publishes its progress while it works.

```
POST /api/documents ──> R2 + documents row ──> IngestAgent (one per document)
                                                  │  status: extracting
                                                  │  1. toMarkdown        (retried)
                                                  │  2. extract           (retried, JSON mode)
                                                  │  3. match             ← Michelle's seam
                                                  │  4. seed ReviewSession   Zuriel's DO
                                                  ▼  status: ready | failed
                                          GET /agents/ingest-agent/:sessionId
                                          WS  (state sync, live board)
```

| File | Does |
|---|---|
| `agent.ts` | The agent: state, transitions, retries, and the bindings it runs on |
| `pipeline.ts` | `runIngest` — what happens to a document, in order |
| `extract.ts` | `toMarkdown` → JSON-mode extraction, one repair retry |
| `schema.ts` | The contract as zod, and the gate that rejects what does not fit |
| `upload.ts` | `POST /api/documents` — R2 put, `documents` row, agent start |
| `hash.ts` | `docId` = SHA-256 of the uploaded bytes, and the R2 key |

## Why an agent and not a Workflow

The state is the product. The board opens before extraction finishes and reads
the agent to tell a slow model from a dead one, rather than polling something
else.

The trade is durability: a Workflow resumes a failed step after an eviction,
and an agent does not. `withRetry` keeps the behaviour that matters for a
two-minute demo — three attempts with exponential backoff on each model call —
but a mid-run eviction starts over rather than resuming.

## Three decisions worth keeping

**The JSON Schema handed to the model is generated from the zod schema**
(`z.toJSONSchema`). One definition, so the constraint on the model and the
check on its answer cannot drift apart.

**Our `docId` overwrites the model's.** It is the hash of the bytes we stored,
and everything downstream keys on it. The model's is never trusted.

**Failure is loud.** Extraction gets exactly one repair retry — the second
failure throws, so the Workflow step fails and resumes from there rather than
from the upload. A confident wrong line is worse than a failed parse.

## The escape hatch

`POST /api/documents?demo=1` seeds from Siva's `fixtures/invoice-a.json` and
never touches the model. Verified locally against an earlier fixture: it runs
the full Workflow and leaves the document `ready` with the vendor recorded.
Re-run it against the canonical fixture once the D1 migration exists.

## Where the model runs

Extraction goes over REST to the account's `/ai/run` endpoint with
`cf-aig-gateway-id: hackathon`, so every call lands in the AI Gateway. The
token is the `HACKATHON_AI_TOKEN` Worker var. `toMarkdown` uses the `AI`
binding.

Model: `@cf/zai-org/glm-5.3-flash`. **Confirm it through the gateway before the
demo** — model ids drift, and a dead one fails with nothing useful in the body.

## Not done yet

- **Not verified over the wire.** No `wrangler login` on this machine, so the
  real model has never been called. Everything below the model is proven; the
  model call itself is not. Do this first.
- `match()` and `seedSession()` in `../workflows/ingest.ts` are seams. Every
  line comes back unmatched until Michelle and Zuriel land — a truthful empty
  state, not a fake one.
- No Queue consumer for bulk. First item on the drop ladder.
- `fixtures/invoice-a.pdf` / `invoice-b.pdf` do not exist. Only the JSON does,
  so the PDF path has never run on a real document.
- No D1 migration yet (Siva's). `documents` has to exist before a non-demo
  upload can record a row.
