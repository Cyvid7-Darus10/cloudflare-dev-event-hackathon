# The contract

**Agreed 27 August 2026. From here, changes go through owner 5 — see the end.**

Two shapes, plus the decision that flows back. Everything below is decided, not
proposed. `ui/src/types.ts` mirrors this file in TypeScript; if the two ever
disagree, this file wins and the types get fixed.

## Ground rules

- **`sku` identifies a product across documents.** Exact string match after
  trimming surrounding whitespace, case-sensitive. Everything hangs on this.
- **Every field value is a string.** Quantities, weights, codes — all strings,
  exactly as written in the source. Nobody coerces. `"4"` and `4` being two
  different things is how diffs go quietly wrong.
- **Absent means the key is not there.** A record that does not mention
  `warrantyMonths` has no `warrantyMonths` key. An empty string `""` is a value
  the customer actually sent, and gets compared like any other value. `null`
  never appears inside a product record — it appears only in flags, where it
  means "this side has nothing".
- **Field names are camelCase** (`caseQuantity`, `hsCode`, `weightGrams`).
  Owner 1 maps whatever the customer wrote onto these names.

## A product record

What one product looks like after parsing. This is what owner 1 produces and
owner 2 consumes.

```jsonc
{
  "sku": "NW-1042",                              // required, the key
  "name": "Cold-pressed rapeseed oil, 5L",       // required
  // every other field is optional, string-valued, camelCase-named:
  "description": "…",
  "unit": "5L",
  "caseQuantity": "6",
  "hsCode": "1514.11"
}
```

- **Required:** `sku` and `name`. A record missing either fails extraction
  loudly. Nothing else is required.
- **Open field set.** The fields above are the common ones, not a closed list.
  A field the standard has never held is legal in a record — the diff turns it
  into an `unknown-field` flag, a person decides.

## A flag

One disagreement between a customer's document and the standard. Owner 2
produces these, owner 3 displays them.

```jsonc
{
  "id": "f-…",                       // stable across reprocessing, see below
  "sku": "NW-1042",
  "productName": "Cold-pressed rapeseed oil, 5L", // carried so the UI never looks it up
  "field": "caseQuantity",
  "kind": "mismatch",                // mismatch | unknown-field | missing
  "customerValue": "4",              // null when the document did not mention it
  "standardValue": "6",              // null when the standard has never held it
  "state": "pending",                // pending | accepted | rejected | edited
  "resolvedValue": "…"               // present only when state is "edited"
}
```

Three kinds, because a mismatch is not the only reason to ask a person:

| `kind` | Meaning | `customerValue` | `standardValue` |
|---|---|---|---|
| `mismatch` | Both have a value and they disagree | set | set |
| `unknown-field` | The customer sent a field the standard has never held | set | `null` |
| `missing` | The standard holds a field the customer's document did not mention | `null` | set |

- **Flags are field-level only.** There is no product-level flag. A product the
  standard has never seen produces one `unknown-field` flag per field it
  carries. A reviewer resolves fields, not products.
- **`id` is deterministic:** derived from (document hash, `sku`, `field`).
  Reprocessing the same document reproduces the same ids, so decisions survive
  a re-run and no flag is ever duplicated. The exact derivation is owner 2's
  internals; determinism is the contract.
- **The document hash is SHA-256 of the uploaded bytes**, and doubles as the
  document's idempotency key (owner 1 reuses a previous extraction on a repeat
  upload).

## A decision

What a reviewer decided, sent from owner 3 back to owner 2. The only thing in
the system allowed to change the standard.

```jsonc
{
  "flagId": "f-…",
  "state": "accepted",               // accepted | rejected | edited — never pending
  "value": "4"                       // the value that wins; null means no value wins
}
```

What each state does to the standard — owner 2 applies these, looking up the
flag's `kind` by `flagId`:

| `state` | Effect on the standard |
|---|---|
| `accepted` | The customer is right. `mismatch`: standard takes `customerValue`. `unknown-field`: field is added with `customerValue`. `missing`: field is **removed** — the customer's absence wins too. (Reviewers will usually reject `missing` flags; accepting one is deliberate.) |
| `rejected` | The standard stands, untouched, always. |
| `edited` | The standard takes the typed `resolvedValue`, including for `unknown-field` (added) — the reviewer's value wins over both sides. |

Every applied decision writes an audit row — field, winning value, when —
**before** the decision is acknowledged.

## The surrounding shapes

Smaller, but crossing the same boundaries, so they live here too.

```jsonc
// A field where the document and the standard already agree. Shown quiet in the UI.
{ "sku": "NW-1042", "field": "name", "value": "Cold-pressed rapeseed oil, 5L" }
```

```jsonc
// Everything one uploaded document produced. What the review screen loads.
{
  "documentName": "northwind-catalogue-q3.pdf",
  "customerName": "Northwind Trading Pte Ltd",
  "receivedAt": "2026-08-27T09:14:00+08:00",   // ISO 8601 with offset
  "flags": [ /* flags */ ],
  "matches": [ /* matches */ ]
}
```

The reference fixture for all of this is `ui/src/fixture.ts` — one realistic
review, hand-written, deliberately boring. Build against it.

## Changing this

Changes go through owner 5 and get announced. A silent change to any shape here
breaks four workstreams at once.
