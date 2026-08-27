# What we use from Cloudflare

Checked against the docs on 27 August 2026, not from memory. Two of these are
recent enough to change how we build.

## Core. We will definitely use these.

| Product | What it does for us | Owner |
|---|---|---|
| **Workers** | The whole app. One deployment, one URL. | Siva |
| **Workers AI** | Reads the customer's document, extracts product records, compares fields. | Bryan |
| **Durable Objects** | Holds the standard. One instance, so two reviewers cannot overwrite each other. | Michelle |
| **DO SQLite** | The audit trail. Which field, which value won, who accepted it, when. | Michelle |
| **R2** | Documents in and documents out. | Bryan, Zuriel |
| **Workers Assets** | Serves the review UI. | Cyrus |

## Two things worth knowing before you start

### `env.AI.toMarkdown()` handles the parsing

Workers AI has a Markdown Conversion service. Give it a PDF, HTML, or an image
and it returns Markdown. Do not write a PDF parser.

```js
const md = await env.AI.toMarkdown({ name: "po.pdf", blob });
```

It takes `conversionOptions`, including a CSS selector for HTML and whether to
drop PDF metadata. **Bryan: start here.** Document to Markdown, then Markdown to
JSON, is two easy steps instead of one hard one.

### JSON mode gives conforming output

Workers AI supports structured outputs through the OpenAI SDK's
`response_format`. Hand it the product-record schema and it returns that shape
rather than prose you have to parse.

```js
response_format: { type: "json_schema", schema: ProductRecordSchema }
```

Still validate what comes back with zod. A schema constrains the model; it does
not make the model honest about a field that was not in the document.

### Browser Run generates the PDF

Callable straight from a Worker binding. No API token, no external request.

```jsonc
{ "compatibility_date": "2026-03-24", "browser": { "binding": "BROWSER" } }
```

```js
const pdf = await env.BROWSER.quickAction("pdf", { html });
```

**Zuriel: this removes the reason to avoid PDF.** Build the document as HTML,
then run it through this. Note the compatibility date requirement; `quickAction`
needs `2026-03-24` or later.

## Optional. Decide early, do not drift into them.

| Product | Would give us | Verdict |
|---|---|---|
| **AI Gateway** | Caching, logs and cost visibility on every model call | Worth it if extraction gets called repeatedly on the same document. Ten minutes to add. |
| **Vectorize** | Matching a customer's field names to ours when the wording differs | Genuinely the right tool for "Item Description" versus "Product Name". Also a day's work. Stretch only. |
| **Workflows** | Durable multi-step processing for large documents | Only if a document takes long enough to need resuming. Probably not today. |
| **Queues** | Processing uploads in the background | Same. Only if extraction is too slow to do inline. |
| **Turnstile** | Bot protection on the upload | Not for a demo. |
| **Cloudflare Access** | Real employee sign-in in front of the app | The right answer for production. For today, a shared secret is enough. |

## D1: probably not, and here is why

D1 is a SQL database, and the instinct is to put the standard in it. Do not.

The standard is **shared state that several people edit at once**. That is the
one problem a Durable Object solves and a database does not: the DO gives us a
single writer for free, so two reviewers accepting different values for the same
field cannot race. Putting it in D1 means writing the locking ourselves.

The DO already has SQLite inside it, which covers the audit trail.

D1 earns its place when we want queries **across** many objects: every document
we have ever processed, searchable, with history. That is a real feature and it
is not in today's scope.

**If someone reaches for D1, ask which query they cannot answer from the DO.**
If there is a good answer, add it. If not, it is a second source of truth and a
sync problem.

## Bindings, roughly

Siva owns the real file. This is the shape.

```jsonc
{
  "compatibility_date": "2026-03-24",
  "compatibility_flags": ["nodejs_compat"],
  "ai": { "binding": "AI" },
  "browser": { "binding": "BROWSER" },
  "r2_buckets": [
    { "binding": "DOCS", "bucket_name": "reconcile-docs" }
  ],
  "durable_objects": {
    "bindings": [{ "name": "Standard", "class_name": "Standard" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["Standard"] }
  ],
  "assets": { "directory": "./dist/client", "binding": "ASSETS" },
  "observability": { "enabled": true }
}
```

Every Durable Object class needs both a binding and a migration entry. Adding a
class later means a **new** tag. Never edit a shipped one.
