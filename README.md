# Rectify

Invoice reconciliation against a standard that learns.

Live: [rectify.cloudflare-hackathon.workers.dev](https://rectify.cloudflare-hackathon.workers.dev/).

My team's project for **Cloudflare Singapore Developers Day**, 27 August 2026.

## The idea

A supplier sends an invoice as a PDF. Somebody opens it next to a price list and
checks it line by line — is that the right SKU, is that the contracted price, is
that the right unit of measure. It is slow, it is error-prone, and the knowledge
gained ("this vendor calls SKU-4471 a *Widget Pro 2K*") evaporates the moment the
check is done.

Upload an invoice. It is parsed to structured JSON, every line is matched against
a canonical product standard, and every field difference is flagged. A reviewer
accepts, rejects, or edits each flag in a live UI. Accepting a correction
**writes back into the standard** — the corrected price, and the vendor's odd
product name recorded as an alias. Then a clean, corrected invoice is published
as a PDF.

The payoff: the standard gets smarter with every document. Invoice #1 needs
manual decisions. Invoice #2 from the same vendor auto-matches, because the
system learned.

The model reads and compares. It does not decide. Only a human resolution
changes the standard.

## Where things are

| | |
|---|---|
| [`architecture.md`](architecture.md) | The design. Services, contract, timeline, drop ladder. **Start here.** |
| [`plan/`](plan/README.md) | The working split — one file per person |
| [`src/shared/contracts.ts`](src/shared/contracts.ts) | The frozen contract every workstream codes against |
| [`fixtures/`](fixtures/) | The canonical fixtures, so nobody waits on anybody |

## Why Cloudflare

Eleven services, each load-bearing — Workers and Workers AI, AI Gateway,
Workflows, Durable Objects, D1, R2, KV, Vectorize, Queues, and Browser
Rendering. `architecture.md` says what each one earns its place doing.

## The team

Bryan, Cyrus, Michelle, Siva, Zuriel. Five people, two hours, five disjoint
directories and one frozen contract.

## Licence

MIT
