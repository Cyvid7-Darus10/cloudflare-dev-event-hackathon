# A — Platform, contract, deploy

**Siva owns this.**

**You own:** that it deploys, that it stays deployed, that everyone is building
against the same shapes, and that the demo lands.

You write less code than everyone else and you are not less busy. When this role
is missing, four people discover at T+95 that nothing is deployed.

## Deliver

- `wrangler.jsonc` with **every binding attached** — AI, Browser, D1, KV, R2,
  Vectorize, Queues, Durable Object, Workflow, assets.
- `migrations/0001_init.sql` and the seed from `fixtures/standard.json`.
- `src/shared/contracts.ts` and `fixtures/` pushed, then defended.
- A hello-world deploy with the URL shared, before anyone has written a feature.
- Secrets uploaded, never in git.
- A verification script that runs over the wire against the deployed URL.
- The demo narrative, and two rehearsals.

## First, before anything else

**Confirm the account plan covers Browser Rendering and Vectorize.** Both need
Workers Paid. If either is missing, trigger the fallback from the drop ladder
and tell everyone in the room — not in a message they read at T+80.

Then: scaffold, create the resources, deploy a skeleton with every binding bound,
share the URL. Every deployment problem you find in the first ten minutes is one
that does not surface at T+95.

## Then push the contract

`src/shared/contracts.ts` plus the four fixtures. This is the ten minutes that
unblocks B, C, D and E simultaneously — it is the highest-leverage thing anyone
does today.

Two decisions in `plan/contract.md` are yours to settle, both in the first ten
minutes: **what `taxCode` compares against**, and whether **D and E have agreed a
WebSocket envelope**. Neither blocks until T+70. Both bite at T+70.

## Then become the integrator

You are the float. From T+70 you belong to whoever is behind, and you own the
order integration happens in: B→C, C→D, D→E.

## Watch for

- **Every Durable Object class needs a binding and a migration entry.** Adding a
  class later means a new tag. Never edit a shipped one.
- **A deployed Worker cannot read `.dev.vars`.** Secrets upload separately.
- **`wrangler dev` needs `CLOUDFLARE_API_TOKEN` once the AI binding exists.**
  Workers AI is remote even locally.
- **A broken Worker returns `error code: 1101` and nothing else.** `wrangler
  tail` is the only way to see the real error. Have it open during the demo.
- **Model ids drift.** Confirm the ones you use are current, through the binding
  rather than only over REST.
- **Verify over the wire, not by typecheck.** A green build proves nothing about
  a deployed endpoint.
- **Seed the standard imperfectly.** A couple of stale prices and one missing
  alias, exactly as `fixtures/standard.json` has them. A perfectly seeded
  catalogue produces zero flags and no demo.

## Own the scope call

You decide what gets cut, from the bottom of the drop ladder in
`architecture.md`. The bar is: upload a document, see flags, fix one, publish a
corrected invoice, and show that the second invoice auto-matches.

**Last deploy at T+115.** Call the freeze yourself; nobody else will.

## Done when

A clean checkout deploys, `GET /api/standard` returns 40 products over the wire,
and you have run the demo start to finish twice on the deployed URL.
