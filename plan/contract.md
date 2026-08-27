# The contract

**Frozen against `architecture.md`. From here, changes go through Siva and get
announced.** A silent change to any shape here breaks four workstreams at once.

The TypeScript lives at `src/shared/contracts.ts`. This file is the same
agreement in prose. If the two disagree, `architecture.md` wins, then this
file, then the `.ts`.

This replaces the earlier catalogue-reconciliation contract (open field set,
all-strings, `accepted` / `rejected`). We are reconciling **invoice line
items** against a **price-list standard that learns**.

## Ground rules

- **A line is identified by `lineId`** (`L0`, `L1`, …), stable for the life of
  a session. A product in the standard is identified by `sku`.
- **Numbers are numbers.** `quantity`, `unitPrice`, `lineTotal`, `listPrice`,
  `confidence`, `matchScore`, `version` are numeric. Do not stringify them.
- **`null` means unknown / unmatched**, never "the customer sent empty". An
  extracted SKU we could not read is `null`; an unmatched line has
  `matchedSku: null` and `matchMethod: "none"`.
- **Field names are camelCase** in JSON/TS. SQL columns are snake_case.

## Extracted invoice (Bryan produces, Michelle consumes)

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
```

## Standard product (D1 row, Michelle reads/writes)

```ts
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
```

Closed field set. No open bag of extra keys.

## Flags and the review session (Michelle produces, Zuriel holds, Cyrus displays)

```ts
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

### How the UI maps onto `resolution`

The flag board acts **per flag** (accept standard / accept document / edit).
The type stores **one resolution per line**. Map it this way, do not invent a
parallel shape:

- Each flag action writes that field into `finalValues`.
- Write-back to the catalogue is per field: `accept_document` or `edited` on
  `unitPrice` / `uom` updates the product; on `description` it also inserts an
  alias. `accept_standard` never touches the catalogue.
- `LineReview.resolution` rolls up: `pending` until every mismatch/unmatched
  flag on the line is resolved; `edited` if any flag was typed; otherwise
  `accept_document` if any flag took the invoice; otherwise `accept_standard`.

## Matching (Michelle, first hit wins)

1. Line `sku` equals `standard_products.sku` → `exact`, score `1.0`
2. Normalised `description` hits `standard_aliases.alias` → `alias`, score `0.95`
3. Embed description with `@cf/baai/bge-base-en-v1.5`, Vectorize top hit ≥ `0.82`
   → `semantic`, score = similarity
4. Otherwise → `none`; every field flagged `unmatched`

## Diff (Michelle, pure TS, no network)

- `unitPrice` — mismatch if it differs from `listPrice` by more than 0.5%.
  `reason` states the delta and the money at stake (`delta × quantity`).
- `uom` — mismatch on any difference.
- `description` — mismatch if it is not the canonical name and not a known
  alias. Accepting this one is how the system learns names.
- `lineTotal` — recompute `quantity * unitPrice` and flag arithmetic errors.
- `taxCode` — mismatch against the standard's code.

## Write-back (Michelle owns the functions, Zuriel calls them)

| Resolution | Catalogue | Published invoice |
|---|---|---|
| `accept_standard` | unchanged | `finalValues` take the standard |
| `accept_document` | `UPDATE standard_products` (bump `version`), insert vendor `description` as alias, Vectorize upsert, audit row, purge KV snapshot | `finalValues` take the document |
| `edited` | same write-back as `accept_document`, with `actor` recorded | `finalValues` take the typed value |

The model never writes here.

## D1 schema (Siva owns the migration, everyone reads this)

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

Seed `standard_products` from `fixtures/standard.json`. Seed it imperfectly — a
couple of stale prices and one missing alias — so the demo has real flags.

## HTTP / WebSocket (Zuriel owns, everyone else calls)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/documents` | Upload → R2 → Workflow. Returns `{ sessionId }`. `?demo=1` seeds from `fixtures/invoice-a.json` and skips the LLM. |
| `GET` | `/api/sessions/:id` | Current `ReviewSession`. |
| `WS` | `/api/sessions/:id/ws` | Live flag board. |
| `POST` | `/api/sessions/:id/publish` | HTML → Browser Rendering → R2. Returns a download URL. |
| `GET` | `/api/standard` | Catalogue snapshot. |
| `GET` | `/api/audit` | `standard_versions` rows. |

## Fixtures (Siva, T+0–10)

| File | Shape | Unblocks |
|---|---|---|
| `fixtures/invoice-a.json` | `ExtractedInvoice` | Bryan's tests, Michelle, `?demo=1` |
| `fixtures/session-a.json` | fully-flagged `ReviewSession` | Cyrus, Zuriel |
| `fixtures/standard.json` | ~40 `StandardProduct` rows | Michelle, D1 seed |
| `fixtures/invoice-a.pdf` / `invoice-b.pdf` | demo PDFs | Bryan, the demo |

`ui/src/fixture.ts` and `ui/src/types.ts` still describe the old catalogue
contract. Cyrus replaces them with these shapes; do not keep both.

## Changing this

Changes go through Siva and get announced. Architecture's rule: nobody changes
`src/shared/contracts.ts` after the first push without saying so out loud.
