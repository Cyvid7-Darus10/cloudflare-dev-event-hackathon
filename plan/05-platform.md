# 5. Platform and the demo

**Cyrus owns this.**

**You own:** that it deploys, that it stays deployed, and that the demo lands.

You will write less code than everyone else and you are not less busy. When this
role is missing, four people discover at 4pm that nothing is deployed.

## Deliver

- `wrangler.jsonc`: bindings, migrations, assets, R2, Workers AI.
- Secrets in place, and never in git.
- A verification script that runs over the wire against the deployed URL.
- A deploy that works from a clean checkout.
- The demo narrative, and two rehearsals.

## What you can stub

Nothing, and you are blocked by nobody. Start now.

## First hour

Deploy a hello-world Worker with an R2 bucket and the AI binding bound, and hit
it. Do this before anyone has written a feature. Every deployment problem you
find now is one that will not surface at 4pm.

## Watch for

- **Every Durable Object class needs a binding and a migration entry.** Adding a
  class later means a new migration tag. Never edit a shipped one.
- **A deployed Worker cannot read `.dev.vars`.** Secrets are uploaded separately.
- **`wrangler dev` needs `CLOUDFLARE_API_TOKEN` once the AI binding exists.**
  Workers AI is remote even locally.
- **A broken Worker returns `error code: 1101` and nothing else.** `wrangler
  tail` is the only way to see the real error. Have it open during the demo.
- **Model ids drift.** Confirm the one you use is current rather than
  deprecated, and check it through the binding, not only over REST.
- **Verify over the wire, not by typecheck.** A green build proves nothing about
  a deployed endpoint.

## Own the scope call

You decide what gets cut. The bar is: a person uploads a document, sees flags,
fixes one, gets a document back reflecting the fix.

Call the freeze with time to spare and make everyone rehearse on the deployed
URL. Conference wifi is a real risk, so have a local fallback ready and know
which one you are demoing from.
