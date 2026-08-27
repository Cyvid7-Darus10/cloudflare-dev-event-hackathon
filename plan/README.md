# How we split this

**[`architecture.md`](../architecture.md) is the source of truth** — the product,
the services, the frozen contract, the timeline, the drop ladder. Read it first.
This directory is the working split: one file per person, saying what you own,
what you can stub, and what will bite you.

Five people, two hours. The goal is that nobody waits on anybody.

## Who does what

The letters are the ones in `architecture.md`. Use them in commit messages and
in the room, so "who owns the matcher" never needs asking.

| | Owner | Owns | Files nobody else touches |
|---|---|---|---|
| **A** | **Siva** — [Platform](a-platform.md) | The deploy, the bindings, the contract, the fixtures | `wrangler.jsonc`, `migrations/`, `fixtures/`, `src/shared/` |
| **B** | **Bryan** — [Ingest](b-ingest.md) | Upload → R2 → Workflow → extraction | `src/ingest/`, `src/workflows/` |
| **C** | **Michelle** — [Match & diff](c-match-diff.md) | Matching, flagging, and the write-back that makes the standard learn | `src/matching/` |
| **D** | **Zuriel** — [Session, API, publish](d-session-api.md) | The Durable Object, the HTTP + WebSocket API, the PDF | `src/session/`, `src/api/` |
| **E** | **Cyrus** — [UI](e-ui.md) | The flag board — the only screen a judge looks at | `public/` |

A is blocked by nobody and unblocks everybody. A goes first.

C is the hardest and the most valuable — the matcher plus the write-back *is*
the product. Put your strongest there and protect their time.

## Work against fixtures, not against each other

`fixtures/` is A's, and it is canonical:

| File | What it is | Who needs it |
|---|---|---|
| `standard.json` | 40 `StandardProduct` rows, seeded imperfectly on purpose | C, D |
| `invoice-a.json` | An `ExtractedInvoice` — B's output, before anyone can produce it | C |
| `session-a.json` | A fully-flagged `ReviewSession` — C's output, before anyone can produce it | D, E |
| `invoice-b.json` | The second invoice, same vendor, same odd naming | the demo |

Code against these plus [`src/shared/contracts.ts`](../src/shared/contracts.ts)
from minute zero. Swap in the real thing at integration. **If you keep your own
copy of a fixture, it will drift** — copy from `fixtures/`, never fork it.

The fixtures are consistent with each other by construction: every
`documentValue` in `session-a.json` is what `invoice-a.json` actually says, and
every `standardValue` is what `standard.json` actually holds. Keep it that way
or the thing four people are building against is a lie.

## The two rules that do not bend

**The model reads and compares. It does not decide.** Extraction and matching
propose; a person accepts, rejects or edits. If a path lets a model write to the
standard without a human resolution, that path is wrong — including the
convenience one someone adds at T+100.

**Never cut the chain.** Upload → extract → flag → edit → **write-back to the
standard**. Everything else in the drop ladder can go. That chain is the product,
and the write-back is the only reason the demo has a payoff.

## Timeline

From `architecture.md`, repeated because it is the thing people forget:

| Time | What |
|---|---|
| **T+0–10** | A: plan check, deploy skeleton with every binding, push contract + fixtures. Everyone else: read the contract, agree it out loud, start. |
| **T+10–70** | Five parallel builds against fixtures. **No integration attempts.** |
| **T+70–90** | Integration in order: B→C, C→D, D→E. A floats to whoever is behind. |
| **T+90–105** | Publish path, then seed invoice B and rehearse the learning moment. |
| **T+105–115** | Docs, final deploy. |
| **T+115–120** | Rehearse the demo. Twice. |

**Hard rule: last deploy at T+115.** Nothing merges after that.

If you are behind at T+70, cut from the bottom of the drop ladder in
`architecture.md`. Each cut is one person stopping, not the whole team. A calls
it — not the person who does not want to stop.

## Before anyone starts

Ten minutes, together, on [`a-platform.md`](a-platform.md). Everything learned
the hard way about Workers deploys is written down there, and a walkthrough is
faster than five cold reads at the moment it breaks.
