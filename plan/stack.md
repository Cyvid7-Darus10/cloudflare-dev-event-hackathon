# What we use from Cloudflare

Eleven services, and `architecture.md` states the load-bearing role of each. This
page is the build note: what changed from our first plan, what to reach for
first, and the three APIs worth knowing before you start.

## What changed, and why — read this if you read the old plan

**D1 is in, and it holds the standard.** Our first plan argued the opposite:
that a Durable Object should hold the standard, because a DO gives you a single
writer for free and D1 would mean writing the locking ourselves. That argument
was right about concurrency and wrong about the product.

The standard is now a **catalogue** — 40+ rows, aliases, version history, an
audit log — and it is queried across documents and across sessions. That is a
database, and a DO holding it would mean every read on the hot matching path
going through one object. The concurrency the DO was protecting turned out to be
per-session, not global: two reviewers race on *the same review*, not on the
whole catalogue.

So the split is:

- **D1** holds the standard, the aliases, the versions, the audit log.
- **A Durable Object per review session** holds the flag state, serialises edits
  within that session, and broadcasts over WebSocket.
- **KV** caches a snapshot of the published standard, so matching does not hit
  D1 on every line. Purged on write-back.

Each does the thing it is good at. Nobody re-litigates this at T+40.

## The three APIs that remove the hardest work

### `env.AI.toMarkdown()` — do not write a PDF parser

Workers AI has a Markdown Conversion service. Give it a PDF, DOCX, XLSX or an
image, get Markdown back.

```js
const md = await env.AI.toMarkdown({ name: "invoice.pdf", blob });
```

**B: start here.** Document → Markdown → JSON is two easy steps instead of one
hard one.

### JSON mode gives conforming output

Structured outputs through the OpenAI SDK's `response_format`. Hand it the
`ExtractedInvoice` schema and it returns that shape rather than prose.

```js
response_format: { type: "json_schema", schema: ExtractedInvoiceSchema }
```

Still validate what comes back, and repair once on failure. A schema constrains
the model; it does not make the model honest about a line that was not there.

### Browser Rendering makes the PDF

Callable straight from a Worker binding. No API token, no external request.

```js
const pdf = await env.BROWSER.quickAction("pdf", { html });
```

**D: this removes the reason to avoid PDF.** Build the corrected invoice as HTML,
then run it through this. `quickAction` needs `compatibility_date` of
`2026-03-24` or later.

## Bindings

A owns the real `wrangler.jsonc`. This is the shape it grows into.

```jsonc
{
  "compatibility_date": "2026-08-25",
  "compatibility_flags": ["nodejs_compat"],
  "ai": { "binding": "AI" },
  "browser": { "binding": "BROWSER" },
  "d1_databases": [{ "binding": "DB", "database_name": "rectify", "database_id": "…" }],
  "kv_namespaces": [{ "binding": "SNAPSHOT", "id": "…" }],
  "r2_buckets": [{ "binding": "DOCS", "bucket_name": "rectify-docs" }],
  "vectorize": [{ "binding": "CATALOGUE", "index_name": "rectify-catalogue" }],
  "queues": { "producers": [{ "binding": "INTAKE", "queue": "rectify-intake" }],
              "consumers": [{ "queue": "rectify-intake" }] },
  "durable_objects": { "bindings": [{ "name": "SESSION", "class_name": "ReviewSession" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ReviewSession"] }],
  "workflows": [{ "binding": "INGEST", "name": "ingest", "class_name": "IngestWorkflow" }],
  "assets": { "directory": "./public", "binding": "ASSETS", "run_worker_first": ["/api/*"] },
  "observability": { "enabled": true }
}
```

Every Durable Object class needs both a binding and a migration entry. Adding a
class later means a **new** tag — never edit a shipped one.

The AI Gateway id is not a binding; it goes in the `gateway` option on each AI
call, or in the account-level config. A wires it once so every call is logged.

## Paid-plan check — A, before anything else

**Browser Rendering and Vectorize both need Workers Paid.** Confirm at T+0, not
at T+95. If either is missing, trigger the fallback from the drop ladder in
`architecture.md` and tell everyone immediately:

- No Browser Rendering → styled HTML with a print stylesheet, Cmd-P in the demo.
- No Vectorize → Workers AI embeddings and cosine similarity computed in-Worker
  over 40 rows. Identical behaviour at this scale.

Neither fallback costs anything narratively. Discovering the need for one at
T+95 costs the demo.
