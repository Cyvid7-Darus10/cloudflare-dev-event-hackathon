# Rectify — invoice reconciliation against a standard that learns

## Context

Cloudflare Singapore Developers Day hackathon. The repo currently holds only a
README describing an unrelated idea (an Airwallex AgentOS credential-broker
pattern); there is no code. We are pivoting to a new product and documenting it
in a new `architecture.md` (the existing README is left in place and gets a
short pointer added).

**The problem.** A supplier sends an invoice as a PDF. Somebody opens it next to
a price list and checks it line by line — is that the right SKU, is that the
contracted price, is that the right unit of measure. It is slow, it is
error-prone, and the knowledge gained ("this vendor calls SKU-4471 a
*Widget Pro 2K*") evaporates the moment the check is done.

**The product.** Upload an invoice. It is parsed to structured JSON, every line
is matched against a canonical product standard, and every field difference is
flagged. A reviewer accepts, rejects, or edits each flag in a live UI. Accepting
a correction **writes back into the standard** — the corrected price, and the
vendor's odd product name recorded as an alias. Then a clean, corrected invoice
is published as a PDF.

**The outcome we want judges to see.** The standard gets smarter with every
document. Invoice #1 needs eight manual decisions; invoice #2 from the same
vendor auto-matches, because the system learned. That is the demo's payoff.

**Constraints.** 5 people, 2 hours, max Cloudflare surface area. Every service
below is load-bearing — nothing is bolted on for the scoreboard.

---

## Cloudflare services and why each one earns its place

| Service | Load-bearing role |
|---|---|
| **Workers** (+ static assets) | The API and the UI, one deploy. |
| **Workers AI** | `env.AI.toMarkdown()` parses PDF/DOCX/XLSX/images natively — no parsing library. Llama does structured extraction. `bge-base-en-v1.5` embeds product names. |
| **AI Gateway** | Every AI call routed through it: caching, token logs, a live dashboard to show a judge. |
| **Workflows** | The ingest pipeline as durable steps. A failed extraction retries from that step, not from the upload. |
| **Durable Objects** | One DO per review session. Holds flag state, serialises edits, broadcasts over WebSocket so multiple reviewers see the same board live. |
| **D1** | The standard catalogue, its aliases, its version history, and the audit log. |
| **R2** | Original uploads and published PDFs. |
| **KV** | Edge-cached snapshot of the published standard — read on the hot matching path. |
| **Vectorize** | Semantic match when a vendor's product name matches no SKU and no alias. |
| **Queues** | Bulk upload path: drop 20 invoices, they fan out to Workflows. |
| **Browser Rendering** | Renders the corrected invoice HTML to PDF. |

Eleven services, one coherent story.

---

## Architecture

```
Upload ──> Worker ──> R2 (original)
                 └──> Workflow
                        1. toMarkdown(R2 object)          [Workers AI]
                        2. extract -> ExtractedInvoice    [Workers AI + AI Gateway]
                        3. match each line                [D1 + KV + Vectorize]
                        4. diff -> LineReview[]           [pure TS]
                        5. seed ReviewSession             [Durable Object]

Reviewer UI <── WebSocket ──> ReviewSession DO
                                 │  accept / reject / edit
                                 ▼
                          write-back: D1 standard + alias + audit
                                      Vectorize upsert
                                      KV snapshot invalidate
                                 │
                                 ▼
                          Publish ──> HTML ──> Browser Rendering ──> R2 ──> download
```

Bulk path: `Queue` consumer → same Workflow, one instance per document.

---

## The frozen contract (`src/shared/contracts.ts`)

**Person A writes this file in the first 10 minutes and pushes it. Nobody
changes it after that without saying so out loud.** Everyone else codes against
it plus a fixture, so no workstream ever blocks on another.

```ts
export type ExtractedLine = {
  lineId: string;            // stable: `L0`, `L1`, ...
  rawText: string;           // the line exactly as it appeared
  sku: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  uom: string | null;
};

export type ExtractedInvoice = {
  docId: string;
  vendor: string;
  invoiceNumber: string;
  issueDate: string;         // ISO
  currency: string;
  lineItems: ExtractedLine[];
  totals: { subtotal: number; tax: number; total: number };
};

export type StandardProduct = {
  sku: string;
  canonicalName: string;
  uom: string;
  listPrice: number;
  currency: string;
  taxCode: string;
  aliases: string[];
  version: number;
};

export type FlagStatus = 'match' | 'mismatch' | 'unmatched';
export type FlaggedField =
  | 'sku' | 'description' | 'unitPrice' | 'uom' | 'quantity' | 'lineTotal' | 'taxCode';

export type FieldFlag = {
  field: FlaggedField;
  documentValue: unknown;
  standardValue: unknown;
  status: FlagStatus;
  confidence: number;        // 0..1
  reason: string;            // human-readable, shown in the UI
};

export type LineReview = {
  lineId: string;
  matchedSku: string | null;
  matchMethod: 'exact' | 'alias' | 'semantic' | 'none';
  matchScore: number;
  flags: FieldFlag[];
  resolution: 'pending' | 'accept_standard' | 'accept_document' | 'edited';
  finalValues?: Partial<ExtractedLine>;
};

export type ReviewSession = {
  sessionId: string;
  docId: string;
  invoice: ExtractedInvoice;
  lines: LineReview[];
  status: 'extracting' | 'ready' | 'reviewing' | 'published';
  updatedAt: number;
};
```

**Fixtures to commit alongside it** (Person A, same 10 minutes):
`fixtures/invoice-a.json` (an `ExtractedInvoice`), `fixtures/session-a.json`
(a fully-flagged `ReviewSession`), `fixtures/standard.json` (~40
`StandardProduct` rows). These unblock C, D and E instantly.

---

## D1 schema (`migrations/0001_init.sql`)

```sql
CREATE TABLE standard_products (
  sku TEXT PRIMARY KEY, canonical_name TEXT NOT NULL, uom TEXT NOT NULL,
  list_price REAL NOT NULL, currency TEXT NOT NULL, tax_code TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE TABLE standard_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, alias TEXT NOT NULL,
  source_doc_id TEXT, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_alias ON standard_aliases(alias);
CREATE TABLE standard_versions (          -- the audit log
  id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, field TEXT NOT NULL,
  old_value TEXT, new_value TEXT, session_id TEXT, actor TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE documents (
  doc_id TEXT PRIMARY KEY, r2_key TEXT NOT NULL, filename TEXT,
  vendor TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, status TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
```

Seed `standard_products` from `fixtures/standard.json`. Deliberately seed it
*imperfectly* — a couple of stale prices and one missing alias — so the demo has
real flags to fire.

---

## The matching + diff engine (the heart of it)

Pure, testable, no network in the diff half.

**Match** a line to a SKU, in order, first hit wins:
1. `sku` field matches `standard_products.sku` exactly → `exact`, score 1.0
2. `description` (normalised: lowercase, punctuation stripped) hits
   `standard_aliases.alias` → `alias`, score 0.95
3. Embed the description with `@cf/baai/bge-base-en-v1.5`, query Vectorize;
   top hit ≥ 0.82 → `semantic`, score = similarity
4. Otherwise → `none`, and every field is flagged `unmatched`

**Diff** each matched line field by field:
- `unitPrice` — mismatch if it differs from `listPrice` by >0.5%. `reason`
  spells out the delta and the money at stake across the quantity.
- `uom` — mismatch on any difference (this is where real money hides: a price
  per *case* billed per *unit*).
- `description` — mismatch if it is not the canonical name and not a known
  alias. This is the one whose acceptance teaches the system.
- `lineTotal` — recompute `quantity * unitPrice` and flag arithmetic errors.
- `taxCode` — mismatch against the standard's code.

**Write-back on resolution** — this is the learning loop, and it must be right:
- `accept_standard` → the document was wrong. No change to the standard. Write
  the corrected value into `finalValues` for the published PDF.
- `accept_document` → the standard was stale. `UPDATE standard_products` (bump
  `version`), insert the vendor's `description` into `standard_aliases`, upsert
  the embedding into Vectorize, insert an audit row, purge the KV snapshot.
- `edited` → operator supplied a third value. Same write-back path as
  `accept_document`, with `actor` recorded.

---

## Five workstreams

Each person owns files nobody else touches. Cross-workstream calls go through
the frozen contract only.

### A — Platform (owns the deploy)
`wrangler.jsonc`, all bindings, `migrations/`, `fixtures/`,
`src/shared/contracts.ts`.
1. **First job, before anything else:** confirm the account plan supports
   **Browser Rendering** and **Vectorize** — both need Workers Paid. If not,
   trigger the fallbacks below immediately and tell everyone.
2. Scaffold, create D1 / R2 / KV / Vectorize / Queue, wire the AI Gateway id,
   deploy a hello-world with **every binding attached**, share the URL.
3. Push contracts + fixtures. Then become the integrator and glue for whoever
   is behind.

### B — Ingest pipeline
`src/ingest/`, `src/workflows/ingest.ts`.
`POST /api/documents` → R2 put → `documents` row → Workflow trigger. Workflow
steps: `toMarkdown` → LLM extraction into `ExtractedInvoice` (JSON mode,
schema-constrained; validate and repair once on failure) → hand to C's matcher →
seed the DO. Then the Queue consumer for bulk. Owns the demo invoice PDFs.

### C — Match & diff
`src/matching/`. Pure functions taking `(ExtractedInvoice, standard)` →
`LineReview[]`. Vectorize seeding script for the catalogue. Also owns the
write-back functions D will call. Works entirely from fixtures — never blocked.

### D — Session DO + API + write-back
`src/session/ReviewSession.ts`, `src/api/`. The DO (WebSocket Hibernation API),
`GET /api/sessions/:id`, `WS /api/sessions/:id/ws`, resolution handler calling
C's write-back, `POST /api/sessions/:id/publish`, `GET /api/standard`,
`GET /api/audit`.

### E — UI
`public/`. Single page, no build step if that is faster — plain HTML +
`<script type="module">` is fine and removes a whole class of risk. Screens:
upload/drop zone → live extraction status → **the flag board** (invoice line
left, standard right, flags coloured, accept-standard / accept-document / edit
per flag) → publish → PDF download. Plus a small "Standard" tab showing version
history, so the learning is visible. Codes against `fixtures/session-a.json`
served statically from minute 0; swaps to the real WebSocket at integration.

**Spend the polish budget on the flag board.** It is the only screen a judge
will actually look at.

---

## Timeline (T+0 to T+120)

| Time | What |
|---|---|
| **T+0–10** | A: plan check + deploy skeleton with all bindings + push contracts & fixtures. B/C/D/E: read the contract, agree it, start. |
| **T+10–70** | Five parallel builds against fixtures. No integration attempts. |
| **T+70–90** | Integration in order: B→C (real extraction into real matcher), C→D (real flags into DO), D→E (real WebSocket). A floats. |
| **T+90–105** | Publish path: HTML → Browser Rendering → R2 → download. Seed the *second* demo invoice and rehearse the learning moment. |
| **T+105–115** | `architecture.md`, README pointer, final deploy. |
| **T+115–120** | Demo rehearsal, twice. |

**Hard rule: last deploy at T+115.** Nothing merges after that.

---

## Drop ladder

If behind at T+70, cut from the bottom. Each cut is one person stopping, not the
whole team.

1. Queues / bulk upload — a nice line in the architecture doc, ~15 min to add back.
2. Browser Rendering — **fallback:** serve the corrected invoice as styled HTML
   with a print stylesheet and hit Cmd-P in the demo. Costs nothing narratively.
3. Vectorize — **fallback:** Workers AI embeddings + cosine similarity computed
   in-Worker over the ~40-row catalogue. Identical behaviour at this scale, and
   the exact/alias tiers carry the demo regardless.
4. KV snapshot — read D1 directly.
5. Multi-user WebSocket — the DO still holds state; the UI polls.

Never cut: upload → extract → flag → edit → **write-back to standard**. That
chain *is* the product.

---

## Risks

- **Extraction returning malformed JSON** is the single most likely failure.
  Mitigation: constrain the schema, validate, one repair retry, and keep
  `fixtures/invoice-a.json` wired to a `?demo=1` query param so the demo can
  bypass the LLM entirely if it misbehaves on stage. Build this escape hatch at
  T+70, not at T+118.
- **Paid-plan bindings** (Browser Rendering, Vectorize) — checked at T+0, not
  discovered at T+95.
- **Contract drift** between workstreams. Mitigated by freezing it early and
  making A the only person who may change it.
- **Five people, one repo, two hours** — everyone owns disjoint directories;
  `main` only, small commits, no PRs.

---

## Verification

- `npx wrangler d1 migrations apply` then a seeded `GET /api/standard` returns
  ~40 products.
- `curl -F file=@fixtures/invoice-a.pdf $URL/api/documents` returns a
  `sessionId`; `GET /api/sessions/:id` shows `status: ready` with a non-empty
  `flags` array containing at least one `mismatch`.
- Unit-test the diff engine against `fixtures/` — a stale price, a UOM
  difference, an arithmetic error, and an unmatched line each produce the
  expected flag. This is the one thing worth real tests.
- **The end-to-end that is also the demo:** upload invoice A → three flags fire
  → accept the document's price on one, edit another → `GET /api/audit` shows
  the version rows → upload invoice B from the same vendor with the same odd
  product naming → **it auto-matches via the learned alias** → publish → PDF
  lands in R2 and downloads.
- Open the UI in two browser windows on the same session; an accept in one
  appears in the other.

---

## Demo script (2 minutes)

1. "Every invoice gets checked by hand against a price list." Upload invoice A.
2. Extraction runs live. The flag board fills: a stale price, a unit-of-measure
   mismatch worth real money at that quantity, an unrecognised product name.
3. Accept the standard on one, accept the document on another — "the standard
   was out of date; now it isn't."
4. Show the audit trail. Every change, who, when, from what to what.
5. Upload invoice B. Same vendor, same odd naming. **Zero flags.** It learned.
6. Publish. Corrected PDF downloads.
7. Close on the architecture diagram — eleven Cloudflare services, one Worker,
   one deploy.