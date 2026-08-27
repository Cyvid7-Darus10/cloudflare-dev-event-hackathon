# A. Platform and the demo

**Siva owns this.**

**You own:** that it deploys, that every binding exists, the frozen contract
and fixtures, the scope call, and that the demo lands.

You will write less product code than everyone else and you are not less
busy. When this role is missing, four people discover at T+100 that Vectorize
was never created.

## Deliver

- `wrangler.jsonc` with **every** binding attached: Workers AI, AI Gateway,
  Workflows, D1, R2, KV, Vectorize, Queue, Browser Rendering, ReviewSession
  DO, assets. Shape is in `stack.md`.
- `migrations/0001_init.sql` as in `contract.md`. Seed from
  `fixtures/standard.json` — imperfectly, so the demo has flags.
- `src/shared/contracts.ts` plus the three JSON fixtures, pushed in the
  first ten minutes.
- Secrets in place, never in git.
- A verification path against the deployed URL (see below).
- A deploy that works from a clean checkout.
- The demo narrative, and two rehearsals.

Then become the integrator and glue for whoever is behind.

## What you can stub

Nothing, and you are blocked by nobody. Start now.

## T+0–10 (do this before anyone has a feature)

1. **Paid-plan check.** Browser Rendering and Vectorize need Workers Paid.
   If they are missing, trigger the fallbacks *now* and tell Zuriel and
   Michelle. Do not discover this at T+95.
2. Create D1 / R2 / KV / Vectorize / Queue, wire the AI Gateway id.
3. Deploy a hello-world with every binding attached. Hit it. Share the URL.
4. Push `contracts.ts` and fixtures. Announce in the room.

## Watch for

- **Every Durable Object class needs a binding and a migration entry.**
  Adding a class later means a new migration tag. Never edit a shipped one.
  The class is `ReviewSession`, not `Standard`.
- **A deployed Worker cannot read `.dev.vars`.** Secrets are uploaded
  separately.
- **`wrangler dev` needs `CLOUDFLARE_API_TOKEN` once the AI binding exists.**
  Workers AI is remote even locally.
- **A broken Worker returns `error code: 1101` and nothing else.**
  `wrangler tail` is the only way to see the real error. Have it open during
  the demo.
- **Model ids drift.** Confirm Llama and `bge-base-en-v1.5` through the
  binding, not only over REST. All calls via AI Gateway.
- **Verify over the wire, not by typecheck.** A green build proves nothing
  about a deployed endpoint.
- **Contract drift.** You are the only person who may change
  `src/shared/contracts.ts`. `ui/src/types.ts` still has the old catalogue
  types — make sure Cyrus knows to throw them away.

## Own the scope call

You decide what gets cut. If behind at T+70, cut from the bottom. Each cut is
one person stopping, not the whole team.

1. Queues / bulk upload — a line in the architecture doc, ~15 min to add back.
2. Browser Rendering — HTML + print stylesheet, Cmd-P in the demo.
3. Vectorize — Workers AI embeddings + cosine similarity in-Worker over ~40
   rows. Exact and alias still carry the demo.
4. KV snapshot — read D1 directly.
5. Multi-user WebSocket — the DO still holds state; the UI polls.

Never cut: upload → extract → flag → edit → **write-back to standard**.

Call the freeze at T+115. Last deploy then. Rehearse twice on the deployed
URL. Conference wifi is a real risk, so have `?demo=1` and a local fallback
ready, and know which one you are demoing from.

## Verification

- `npx wrangler d1 migrations apply` then `GET /api/standard` returns ~40
  products.
- `curl -F file=@fixtures/invoice-a.pdf $URL/api/documents` returns a
  `sessionId`; `GET /api/sessions/:id` is `ready` with at least one
  `mismatch`.
- Michelle's unit tests against `fixtures/` — stale price, UOM, arithmetic,
  unmatched line.
- **The demo, which is also the test:** upload A → flags → accept document
  on one, edit another → `GET /api/audit` shows version rows → upload B
  (same vendor, same odd name) → **it auto-matches** → publish → file lands
  in R2.
- Two browser windows on the same session; an accept in one appears in the
  other.

## Demo script (2 minutes)

1. "Every invoice gets checked by hand against a price list." Upload A.
2. Extraction runs live. Flag board: stale price, a UOM mismatch worth real
   money, an unrecognised product name.
3. Accept the standard on one, accept the document on another — "the
   standard was out of date; now it isn't."
4. Show the audit trail.
5. Upload B. Same vendor, same odd naming. **Zero flags.** It learned.
6. Publish. Corrected PDF (or HTML) downloads.
7. Close on the architecture diagram — eleven Cloudflare services, one
   Worker, one deploy.
