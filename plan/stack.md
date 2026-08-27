# What we use from Cloudflare

Rectify needs eleven services, each load-bearing. That is a change from the
earlier plan, which kept the standard inside a Durable Object and treated D1,
Workflows, Queues, KV, Vectorize, and AI Gateway as optional.

The Durable Object is now **one review session**, not the catalogue. The
catalogue lives in **D1** (plus a KV snapshot on the hot matching path, plus
Vectorize for names that hit no SKU and no alias).

Checked against `architecture.md`. If a binding is missing at T+0, Siva
triggers the fallback in [05-platform.md](05-platform.md) immediately.

## Core. We will use these.

| Product | Load-bearing role | Owner |
|---|---|---|
| **Workers** (+ static assets) | The API and the UI, one deploy. | Siva, Cyrus |
| **Workers AI** | `env.AI.toMarkdown()` parses the PDF. Llama extracts `ExtractedInvoice`. `bge-base-en-v1.5` embeds product names. | Bryan, Michelle |
| **AI Gateway** | Every AI call: caching, token logs, a live dashboard for the judges. | Siva, Bryan |
| **Workflows** | Ingest as durable steps. A failed extraction retries from that step. | Bryan |
| **Durable Objects** | One DO per review session. Flag state, serialised edits, WebSocket broadcast. | Zuriel |
| **D1** | Catalogue, aliases, version history, documents, sessions. | Siva (schema), Michelle (read/write) |
| **R2** | Original uploads and published PDFs. | Bryan, Zuriel |
| **KV** | Edge-cached snapshot of the published standard. Read on the matching path. | Michelle |
| **Vectorize** | Semantic match when name matches no SKU and no alias. | Michelle |
| **Queues** | Bulk upload: one Workflow instance per document. First thing on the drop ladder. | Bryan |
| **Browser Rendering** | Corrected invoice HTML → PDF. | Zuriel |

## Two things worth knowing before you start

### `env.AI.toMarkdown()` handles the parsing

Workers AI Markdown Conversion. Give it a PDF, DOCX, XLSX, or an image and it
returns Markdown. Do not write a PDF parser.

```js
const md = await env.AI.toMarkdown({ name: "invoice.pdf", blob });
```

**Bryan: start here.** Document to Markdown, then Markdown to `ExtractedInvoice`
in JSON mode, is two steps instead of one hard one. Route the LLM call through
AI Gateway.

### JSON mode gives conforming output

Hand the model the `ExtractedInvoice` schema. Validate with zod. On failure,
one repair retry, then stop. A confident wrong line is worse than a failed
parse.

Keep `?demo=1` wired to `fixtures/invoice-a.json` so the stage demo can skip
the LLM entirely.

### Browser Rendering generates the PDF

```jsonc
{ "compatibility_date": "2026-03-24", "browser": { "binding": "BROWSER" } }
```

Build the corrected invoice as HTML, then render. If the account is not on
Workers Paid, use the fallback: styled HTML plus a print stylesheet, Cmd-P in
the demo. Same story, no PDF file.

## Fallbacks, not optionals

These used to be "decide early, maybe skip". They are in the architecture. If
we are behind at T+70, cut from the bottom of the drop ladder in
`05-platform.md` — do not invent a different cut.

| Product | Fallback |
|---|---|
| **Queues** | Single-file upload only. |
| **Browser Rendering** | HTML + print stylesheet. |
| **Vectorize** | In-Worker cosine similarity over the ~40-row catalogue. Exact and alias tiers still carry the demo. |
| **KV** | Read D1 directly. |
| **Multi-user WebSocket** | DO still holds state; UI polls `GET /api/sessions/:id`. |

Never cut: upload → extract → flag → edit → **write-back to standard**.

Turnstile and Cloudflare Access stay out. Not for a two-hour demo.

## Bindings, roughly

Siva owns the real file. This is the shape.

```jsonc
{
  "compatibility_date": "2026-03-24",
  "compatibility_flags": ["nodejs_compat"],
  "ai": { "binding": "AI" },
  "browser": { "binding": "BROWSER" },
  "d1_databases": [
    { "binding": "DB", "database_name": "rectify" }
  ],
  "r2_buckets": [
    { "binding": "DOCS", "bucket_name": "rectify-docs" }
  ],
  "kv_namespaces": [
    { "binding": "STANDARD_KV" }
  ],
  "vectorize": [
    { "binding": "PRODUCTS", "index_name": "rectify-products" }
  ],
  "queues": {
    "producers": [{ "binding": "INGEST_QUEUE", "queue": "rectify-ingest" }],
    "consumers": [{ "queue": "rectify-ingest" }]
  },
  "workflows": [
    { "binding": "INGEST", "name": "ingest", "class_name": "IngestWorkflow" }
  ],
  "durable_objects": {
    "bindings": [{ "name": "ReviewSession", "class_name": "ReviewSession" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["ReviewSession"] }
  ],
  "assets": { "directory": "./ui/dist", "binding": "ASSETS" },
  "observability": { "enabled": true }
}
```

Wire the AI Gateway id on the Worker as well — every `env.AI` call should show
up there.

Every Durable Object class needs both a binding and a migration entry. Adding
a class later means a **new** tag. Never edit a shipped one.

The DO class is `ReviewSession`, not `Standard`. The catalogue is D1.
