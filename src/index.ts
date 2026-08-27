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

import { handleUpload } from "./ingest/upload";
import { handleAudit, handleSessions, handleStandard } from "./api/sessions.ts";

export { IngestWorkflow } from "./workflows/ingest";
export { ReviewSessionDO } from "./session/ReviewSession.ts";

const SERVICE = "rectify";

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const health = (env: Env): Response =>
  json({
    ok: true,
    status: "ok",
    service: SERVICE,
    version: env.VERSION?.id ?? "unknown",
    timestamp: new Date().toISOString(),
    aiGateway: env.AI_GATEWAY_ID,
    bindings: {
      DB: Boolean(env.DB),
      DOCS: Boolean(env.DOCS),
      STANDARD_KV: Boolean(env.STANDARD_KV),
      PRODUCTS: Boolean(env.PRODUCTS),
      AI: Boolean(env.AI),
      BROWSER: Boolean(env.BROWSER),
      INGEST: Boolean(env.INGEST),
      INGEST_QUEUE: Boolean(env.INGEST_QUEUE),
      REVIEW_SESSION: Boolean(env.REVIEW_SESSION),
      ASSETS: Boolean(env.ASSETS),
    },
  });

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/api/health") return health(env);
      if (pathname === "/api/standard") return handleStandard(env);
      if (pathname === "/api/audit") return handleAudit(env, new URL(request.url));

      if (pathname === "/api/documents" && request.method === "POST") {
        return handleUpload(request, env as never);
      }

      const session = await handleSessions(request, env, pathname);
      if (session) return session;

      return json({ error: `No route for ${request.method} ${pathname}` }, 404);
    } catch (cause) {
      console.error(`${SERVICE}: unhandled error on ${pathname}`, cause);
      return json({ error: "Internal error" }, 500);
    }
  },

  async queue(batch): Promise<void> {
    for (const message of batch.messages) {
      message.ack();
    }
  },
} satisfies ExportedHandler<Env>;
