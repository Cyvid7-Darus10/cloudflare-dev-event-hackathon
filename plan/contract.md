# The contract

**Fill this in together in the first fifteen minutes. Everything depends on it.**

Two shapes. Once they are written down, five people can work in parallel.

## A product record

What one product looks like after parsing. Replace this with the real thing.

```jsonc
{
  "sku": "string, required, the key we match on",
  "name": "string, required",
  "description": "string, optional",
  "unit": "string, optional"
  // add the fields that actually matter for our products
}
```

Decide and write down:

- Which field identifies a product across documents. Everything hangs on this.
- Which fields are required.
- What absent means, and how it differs from empty.

## A flag

One disagreement between a customer's document and the standard.

```jsonc
{
  "id": "string, stable across reprocessing of the same document",
  "sku": "string, which product",
  "field": "string, which field disagrees",
  "customerValue": "the value from their document, or null if absent",
  "standardValue": "the value we hold, or null if we have never seen this field",
  "state": "pending | accepted | rejected | edited",
  "resolvedValue": "set when state is edited"
}
```

Decide and write down:

- What a field the standard has never seen is called. It is not a mismatch.
- What a field the customer omitted is called. It is not a mismatch either.
- Whether a reviewer can flag a product as a whole, or only individual fields.

## Changing this

After the first hour, changes go through owner 5 and get announced. A silent
change to either shape breaks four workstreams at once.
