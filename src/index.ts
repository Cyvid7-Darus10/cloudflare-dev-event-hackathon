/**
 * The Worker entrypoint.
 *
 * Every request hits this file first (`run_worker_first`), including static
 * assets, so the flag board gets the same security headers as the API. `/api/*`
 * is routed here; everything else is `env.ASSETS`.
 */

import { handleUpload, type IngestParams } from "./ingest/upload";
import { handleAudit, handleSessions, handleStandard } from "./api/sessions.ts";
import {
  clientKey,
  isIngestParams,
  isSafeSessionId,
  MAX_JSON_BYTES,
  MAX_UPLOAD_BYTES,
  payloadTooLarge,
  rateLimited,
  websocketOriginDenied,
  withSecurity,
} from "./platform/safety.ts";

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

function sessionIdFrom(pathname: string): string | null {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function gate(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (method !== "GET" && method !== "POST" && method !== "HEAD") {
    return json({ error: "Method not allowed" }, 405);
  }

  const sessionId = sessionIdFrom(pathname);
  if (sessionId && !isSafeSessionId(sessionId)) {
    return json({ error: "Invalid session id" }, 400);
  }

  if (pathname.endsWith("/ws")) {
    return websocketOriginDenied(request);
  }

  const mutating = method === "POST";
  if (mutating) {
    const max = pathname === "/api/documents" ? MAX_UPLOAD_BYTES : MAX_JSON_BYTES;
    const oversized = payloadTooLarge(request, max);
    if (oversized) return oversized;

    const limited = await rateLimited(
      env.INGEST_RATE,
      `${clientKey(request)}:${pathname === "/api/documents" ? "ingest" : "mutate"}`,
    );
    if (limited) return limited;
  }

  return null;
}

async function route(request: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === "/api/health") return health(env);
  if (pathname === "/api/standard") return handleStandard(env);
  if (pathname === "/api/audit") return handleAudit(env, new URL(request.url));

  if (pathname === "/api/documents" && request.method === "POST") {
    return handleUpload(request, env);
  }

  const session = await handleSessions(request, env, pathname);
  if (session) return session;

  return json({ error: `No route for ${request.method} ${pathname}` }, 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    try {
      if (pathname.startsWith("/api/")) {
        const blocked = await gate(request, env, pathname);
        if (blocked) return withSecurity(request, blocked);
        return withSecurity(request, await route(request, env, pathname));
      }

      return withSecurity(request, await env.ASSETS.fetch(request));
    } catch (cause) {
      console.error(`${SERVICE}: unhandled error on ${pathname}`, cause);
      return withSecurity(request, json({ error: "Internal error" }, 500));
    }
  },

  async queue(batch, env): Promise<void> {
    for (const message of batch.messages) {
      if (!isIngestParams(message.body)) {
        console.error(`${SERVICE}: dropping malformed queue message`, message.id);
        message.ack();
        continue;
      }
      const params: IngestParams = message.body;
      try {
        await env.INGEST.create({ id: params.sessionId, params });
        message.ack();
      } catch (cause) {
        console.error(`${SERVICE}: queue ingest failed`, message.id, cause);
        message.retry({ delaySeconds: 30 });
      }
    }
  },
} satisfies ExportedHandler<Env>;
