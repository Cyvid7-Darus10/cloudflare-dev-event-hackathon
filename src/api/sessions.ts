/**
 * The session API.
 *
 * Routes under `/api/sessions/*`, plus the two thin catalogue reads. Everything
 * here is dispatch and shape: the state lives in the Durable Object, the
 * corrected invoice comes from `./publish`, and the catalogue belongs to
 * Michelle. This file holds no business rules of its own on purpose.
 */

import { listStandard } from "../platform/catalogue.ts";
import type { ReviewSession } from "../shared/contracts.ts";
import type { ReviewSessionDO } from "../session/ReviewSession.ts";
import { publishInvoice } from "./publish/index.ts";
import fixture from "../../fixtures/session-a.json" with { type: "json" };

/** One line's decision, as the flag board sends it at publish time. */
type BatchResolution = {
  lineId: string;
  resolution: "pending" | "accept_standard" | "accept_document" | "edited";
  finalValues?: Record<string, unknown>;
};

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** The one place that knows how to reach a session object. */
function stubFor(env: Env, id: string): DurableObjectStub<ReviewSessionDO> {
  const ns = (env as Record<string, unknown>).REVIEW_SESSION as
    | DurableObjectNamespace<ReviewSessionDO>
    | undefined;
  if (!ns) throw new Error("REVIEW_SESSION is not bound. See durable_objects in wrangler.jsonc.");
  return ns.getByName(id);
}

/**
 * A session, seeding from the fixture the first time one is asked for.
 *
 * Bryan's workflow will seed real sessions. Until it does, asking for the
 * fixture's own id gives a complete session to work against, which is what lets
 * Cyrus integrate before extraction exists.
 */
async function loadOrSeed(
  stub: DurableObjectStub<ReviewSessionDO>,
  id: string,
): Promise<ReviewSession | null> {
  const existing = await stub.getSession();
  if (existing) return existing;
  if (id !== (fixture as ReviewSession).sessionId) return null;
  return stub.seed(fixture as ReviewSession);
}

export async function handleSessions(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const match = pathname.match(/^\/api\/sessions\/([^/]+)(\/[^/]+)?$/);
  if (!match) return null;

  const [, id, action] = match;
  const stub = stubFor(env, id);

  // The WebSocket lives on the object itself, so the socket outlives this request.
  if (action === "/ws") {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "Expected a WebSocket upgrade." }, 426);
    }
    await loadOrSeed(stub, id);
    return stub.fetch(request);
  }

  if (action === "/publish") {
    let session = await loadOrSeed(stub, id);
    if (!session) return json({ error: `No session ${id}.` }, 404);

    // The flag board holds decisions locally and sends them all at once when
    // the reviewer presses publish, rather than resolving line by line. Accept
    // that batch here so publishing writes back and renders in one call, and E
    // does not have to change to match D.
    if (request.method === "POST") {
      const batch = await request.json<{ resolutions?: BatchResolution[] }>().catch(() => ({}));
      const resolutions = batch.resolutions;
      if (resolutions !== undefined && !Array.isArray(resolutions)) {
        return json({ error: "`resolutions` must be an array." }, 400);
      }
      for (const r of resolutions ?? []) {
        if (!r || typeof r.lineId !== "string") {
          return json({ error: "Every resolution needs a lineId." }, 400);
        }
        if (r.resolution === "pending") continue;
        const applied = await stub.resolve(r.lineId, r.resolution, r.finalValues);
        if (!applied.ok) return json({ error: applied.error }, 400);
      }
      session = (await stub.getSession()) ?? session;
    }

    const { html, hash, doc } = await publishInvoice(session, { dataSource: "live" });

    // `?format=json` so the verification script can assert on the numbers
    // rather than grepping HTML.
    if (new URL(request.url).searchParams.get("format") === "json") {
      return json({
        invoiceNumber: doc.invoiceNumber,
        contentHash: hash,
        correctedTotal: doc.correctedTotal,
        originalTotal: doc.originalTotal,
        changedLineCount: doc.changedLineCount,
        unresolvedCount: doc.unresolvedCount,
      });
    }

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // The reviewer accepts a flag in one tab and regenerates in another.
        // A cached page here shows an unchanged document and reads as broken.
        "cache-control": "no-store",
        "x-content-hash": hash,
      },
    });
  }

  if (action === "/resolve") {
    if (request.method !== "POST") return json({ error: "POST only." }, 405);
    await loadOrSeed(stub, id);
    const body = await request.json<{
      lineId: string;
      resolution: "accept_standard" | "accept_document" | "edited";
      finalValues?: Record<string, unknown>;
    }>();
    const result = await stub.resolve(body.lineId, body.resolution, body.finalValues);
    return result.ok ? json({ ok: true, line: result.line }) : json({ error: result.error }, 400);
  }

  if (!action) {
    const session = await loadOrSeed(stub, id);
    return session ? json(session) : json({ error: `No session ${id}.` }, 404);
  }

  return json({ error: `No route for ${pathname}.` }, 404);
}

/**
 * The audit trail.
 *
 * Michelle's write-back owns the `standard_versions` table. D1 is not bound yet,
 * so this reads what the session object recorded and says so rather than
 * presenting it as the catalogue's own history.
 */
export async function handleAudit(env: Env, url: URL): Promise<Response> {
  const id = url.searchParams.get("session") ?? (fixture as ReviewSession).sessionId;
  const rows = await stubFor(env, id).getAudit();
  return json({
    source: "durable-object",
    note: "D1 is not bound yet. These are the rows the session recorded; "
      + "the catalogue's own history arrives with Michelle's write-back.",
    session: id,
    rows,
  });
}

export async function handleStandard(env: Env): Promise<Response> {
  const db = env.DB;
  if (!db) {
    return json({
      source: "unbound",
      note: "D1 is not bound yet, so there is no catalogue to read. "
        + "Seed it from fixtures/standard.json once the migration lands.",
      products: [],
      count: 0,
    });
  }
  const products = await listStandard(db);
  return json({ source: "d1", products, count: products.length });
}

/** `?demo=1` seeds the fixture session so the flag board can run without ingest. */
export async function handleDocuments(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "POST only." }, 405);

  const demo = new URL(request.url).searchParams.get("demo") === "1";
  if (!demo) {
    return json(
      {
        error: "ingest not wired yet",
        hint: "POST /api/documents?demo=1 seeds fixtures/session-a.json and skips the LLM",
      },
      501,
    );
  }

  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const seeded = fixture as ReviewSession;
  const session: ReviewSession = {
    ...seeded,
    sessionId,
    docId: `demo-${sessionId}`,
    invoice: { ...seeded.invoice, docId: `demo-${sessionId}` },
    status: "ready",
    updatedAt: now,
  };

  if (env.DB) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO documents (doc_id, r2_key, filename, vendor, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(session.docId, "fixtures/invoice-a.json", "invoice-a.json", session.invoice.vendor, "ready", now),
      env.DB.prepare(
        `INSERT INTO sessions (session_id, doc_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(sessionId, session.docId, "ready", now, now),
    ]);
  }

  await stubFor(env, sessionId).seed(session);
  return json({ sessionId, docId: session.docId, demo: true, status: session.status });
}
