# How we split this

Five people, one day. The goal is that nobody waits on anybody.

## Decide this together, first. Fifteen minutes, then stop talking.

Everything below depends on two shapes. Agree them, write them into
`plan/contract.md`, and do not change them after the first hour without telling
everyone.

**A product record.** What one product looks like once it has been parsed. Field
names, types, which fields are required.

**A flag.** What one disagreement looks like: which field, what the customer
sent, what the standard says, and its state (`pending`, `accepted`, `rejected`,
`edited`).

Once those exist, all five workstreams can start against them. Until they exist,
four of the five are guessing.

## Who does what

| # | Owner | Owns | Blocked by |
|---|---|---|---|
| 1 | **Bryan** — [Ingest](01-ingest.md) | Upload, storage, extraction to JSON | the contract |
| 2 | **Michelle** — [Standard](02-standard.md) | The standard, the diff, applying edits | the contract |
| 3 | **Siva** — [Review UI](03-review-ui.md) | The screen where flags are triaged | the contract |
| 4 | **Zuriel** — [Output](04-output.md) | The document we send back | the contract |
| 5 | **Cyrus** — [Platform](05-platform.md) | Config, deploy, verification, the demo | nothing |

Cyrus takes platform because he has already hit most of the traps listed in that
file, and because that role calls the scope cuts.

**The other four are assigned in list order, not by skill.** Swap them in the
first five minutes if someone is closer to one of these. Owner 2 is the hardest
and owner 3 is the most visible, so put your strongest on 2 and whoever cares
most about how things look on 3.

## Work against fixtures, not against each other

Every workstream ships a fixture on day one: a hand-written JSON file matching
the contract. Build against the fixture. Swap it for the real thing when the
neighbouring piece lands.

This is the difference between five people working and five people waiting.

## The rule about the model

The model reads and compares. It does not decide.

Every change to the standard passes through a person. If a demo path lets a
model write to the standard without someone accepting it, that path is wrong.

## What "done" means today

A person uploads a document, sees flags, fixes one, and gets a document back
that reflects the fix. Everything else is optional.

Cut scope toward that sentence. Owner 5 calls it.

## Freeze and rehearse

Stop building with time to spare. Run the demo twice, start to finish, on the
deployed URL rather than on a laptop. A demo that runs beats a demo that is
more impressive when it works.
