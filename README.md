# Cloudflare Dev Event Hackathon

My hackathon project for **Cloudflare Singapore Developers Day**, 27 August 2026.

Built with Cloudflare Workers, Durable Objects, and Workers AI.

## The idea

A pattern for letting a team run [Airwallex AgentOS](https://www.airwallex.com/docs/developer-tools/ai/agentos)
skills without giving every employee production credentials.

A skill like `contract-to-billing` reads a purchase order and creates the
invoice. To use one today, an employee authenticates against the production
account directly. Every employee then holds credentials, and every agent writes
straight to the API.

This puts a Cloudflare Worker in between.

| Property | How it is held |
|---|---|
| Credentials never leave the server | The MCP tool server holds them. The model calls named tools and never sees a key. |
| One write at a time, per customer | A Durable Object named after the thing that must not be corrupted. |
| A repeat costs nothing | An idempotency key ties every attempt to its source document. |
| Nothing is lost on a crash | The audit row is written before the caller is told the write succeeded. |
| The checks are code | A deterministic gate runs before anything irreversible. |

Those are guarantees rather than conventions, because the runtime provides them
instead of the application asking everyone to be careful.

## Status

Starting point. Code to follow.

## Licence

MIT
