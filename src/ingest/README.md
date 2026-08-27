# Workstream B — Ingest and extract

**Bryan.** Supplier invoice in, `ExtractedInvoice` out.

```bash
npm install
npm test          # 49 tests, inside workerd
npm run typecheck
npx wrangler dev  # needs CLOUDFLARE_API_TOKEN: the AI binding is remote even locally
```

## What is here

| File | Does |
|---|---|
| `hash.ts` | `docId` = SHA-256 of the uploaded bytes, and the R2 key |
| `schema.ts` | The contract as zod, and the gate that rejects what does not fit |
| `extract.ts` | `toMarkdown` → JSON-mode extraction, with one repair retry |
| `upload.ts` | `POST /api/documents` — R2 put, `documents` row, Workflow start |
| `../workflows/ingest.ts` | The durable steps, and `runIngest` which holds the ordering |

`src/index.ts` and `wrangler.jsonc` are Siva's; this workstream adds one route
and the `AI` / `DOCS` / `DB` / `INGEST` bindings to them.

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
