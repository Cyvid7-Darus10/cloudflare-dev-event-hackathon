# How we split this

Five people, two hours. The product is **Rectify**: upload a supplier invoice,
flag every line against a canonical price list, let a person decide, write the
decision back into the standard so the next invoice from that vendor is cleaner.

The source of truth for *what we are building* is [`../architecture.md`](../architecture.md).
This folder is who owns which files, and the contract everyone codes against.

## Decide this together, first. Ten minutes, then stop talking.

The shapes live in [`contract.md`](contract.md). They match
`src/shared/contracts.ts`. Siva pushes that file and the fixtures in the first
ten minutes. Do not change them after that without saying so out loud.

Until those exist, four of the five are guessing. Once they exist, everyone
builds against fixtures. Nobody waits on a neighbour.

## Who does what

Architecture workstreams A–E, mapped onto the five of us. Each person owns
files nobody else touches. Cross-workstream calls go through the frozen
contract only.

| # | Owner | Owns | Files | Blocked by |
|---|---|---|---|---|
| A | **Siva** — [Platform](05-platform.md) | Deploy, bindings, D1 schema, contracts, fixtures, glue | `wrangler.jsonc`, `migrations/`, `fixtures/`, `src/shared/` | nothing |
| B | **Bryan** — [Ingest](01-ingest.md) | Upload, R2, Workflow, extraction | `src/ingest/`, `src/workflows/ingest.ts` | the contract |
| C | **Michelle** — [Match & diff](02-standard.md) | Matching, field diff, write-back, Vectorize seed | `src/matching/` | the contract |
| D | **Zuriel** — [Session, API, publish](04-output.md) | Review-session DO, HTTP/WS API, PDF publish | `src/session/`, `src/api/` | the contract |
| E | **Cyrus** — [Review UI](03-review-ui.md) | The flag board, Standard tab, upload → publish | `ui/` | the contract |

Siva owns platform, and therefore owns the scope call.

Cyrus has already hit most of the traps listed in `05-platform.md`, so the two
of you should spend ten minutes on that file together before anyone starts.

**Michelle's workstream is the heart of the product.** The demo's payoff is a
second invoice that auto-matches because the first one taught the standard.
That write-back loop is hers; Zuriel calls it, he does not reimplement it.

## The stack

[`stack.md`](stack.md) lists the eleven Cloudflare services and why each one
is load-bearing. Read the drop ladder in `05-platform.md` before you add
anything extra.

## Work against fixtures, not against each other

Siva ships three fixtures with the contract:

- `fixtures/invoice-a.json` — an `ExtractedInvoice`
- `fixtures/session-a.json` — a fully-flagged `ReviewSession`
- `fixtures/standard.json` — ~40 `StandardProduct` rows, seeded *imperfectly*

Build against those. Swap for the real neighbour at T+70, not before.

Cyrus already has a Vite app in `ui/` against an older catalogue fixture.
Keep `ui/` — do not start a second frontend. Rebuild the screen against
`fixtures/session-a.json` and the frozen types.

## The rule about the model

The model reads, extracts, and matches. It does not decide.

Every change to the standard passes through a person (`accept_document` or
`edited`). `accept_standard` writes the corrected value into the published
invoice and leaves the catalogue alone.

If a demo path lets a model write to the standard without someone accepting
it, that path is wrong.

## What "done" means today

Upload invoice A → flags fire → accept one, edit another → the standard
learns → upload invoice B from the same vendor → it auto-matches → publish a
corrected PDF.

That chain is the product. Everything else is on the drop ladder.

## Timeline (T+0 to T+120)

| Time | What |
|---|---|
| **T+0–10** | Siva: paid-plan check, deploy skeleton with every binding, push contracts and fixtures. Everyone else: read the contract, agree it, start. |
| **T+10–70** | Five parallel builds against fixtures. No integration attempts. |
| **T+70–90** | Integration in order: Bryan→Michelle (extraction into matcher), Michelle→Zuriel (flags into the DO), Zuriel→Cyrus (real WebSocket). Siva floats. |
| **T+90–105** | Publish path. Seed invoice B. Rehearse the learning moment. |
| **T+105–115** | README pointer, final deploy. |
| **T+115–120** | Demo rehearsal, twice, on the deployed URL. |

**Hard rule: last deploy at T+115.** Nothing merges after that.
