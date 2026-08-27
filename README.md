# Cloudflare Dev Event Hackathon

My hackathon project for **Cloudflare Singapore Developers Day**, 27 August 2026.

Built with Cloudflare Workers, Durable Objects, and Workers AI.

## The idea

Customers send us their product information in their own documents, in their own
shape. We keep a standard to check it against. Reconciling the two is manual,
slow, and easy to get wrong.

This automates the comparison and keeps a person in charge of the decisions.

### The flow

1. **A customer sends a company document.** Their format, their field names,
   their wording.
2. **Parse it into JSON.** One predictable shape, whatever arrived.
3. **Match it against the standard** and compare product details field by field.
4. **Flag the differences.** Everything that matches passes through. Everything
   that does not gets raised for review, with both values shown side by side.
5. **A person reviews the flags** in the UI. Accept what the customer sent,
   keep what the standard says, or type a correction.
6. **The accepted values update the standard**, so the same disagreement does
   not come back next time.
7. **Emit a document** carrying the product information as the updated standard
   now defines it.

The model reads and compares. It does not decide. A person accepts, edits or
rejects each flag, and only accepted values change the standard.

### Why Cloudflare

The standard is shared state that several people edit while documents are being
processed against it. That is the hard part, and it is what the platform is for.

| Need | Handled by |
|---|---|
| Extract and compare fields across two shapes | Workers AI |
| One writer for the standard, so two reviewers cannot overwrite each other | Durable Objects |
| A record of who accepted what, and when | SQLite inside the object |
| Reprocessing the same document changes nothing | An idempotency key per document |
| Documents in and out | R2 |

## The team

Bryan, Cyrus, Michelle, Siva, Zuriel.

Work is split five ways in [`plan/`](plan/README.md), with a shared contract the
five workstreams build against so nobody waits on anybody.

## Status

Starting point. Code to follow.

## Licence

MIT
