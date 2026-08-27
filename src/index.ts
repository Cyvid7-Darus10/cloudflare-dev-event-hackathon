/**
 * The Worker entrypoint.
 *
 * Static assets — the review UI, built from `ui/` — are served by the platform
 * before this code runs. Only `/api/*` reaches us; see `run_worker_first` in
 * wrangler.jsonc.
 *
 * Feature routes land here as the four workstreams in `plan/` arrive. Today it
 * carries one endpoint, which exists so a deploy can be verified over the wire
 * rather than by a green build.
 */

const SERVICE = "product-reconciliation";

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const health = (env: Env): Response =>
  json({
    status: "ok",
    service: SERVICE,
    // Which version is actually live. Workers Builds deploys one per commit.
    version: env.VERSION?.id ?? "unknown",
    timestamp: new Date().toISOString(),
  });

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/api/health") return health(env);

      return json({ error: `No route for ${request.method} ${pathname}` }, 404);
    } catch (cause) {
      // Log the detail for `wrangler tail`; return nothing sensitive.
      console.error(`${SERVICE}: unhandled error on ${pathname}`, cause);
      return json({ error: "Internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
