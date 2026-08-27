import { Agent, callable } from "agents";
import type { ExtractedInvoice, LineReview, ReviewSession } from "../shared/contracts";
import type { ReviewSessionDO } from "../session/ReviewSession.ts";
import { documentToMarkdown, extractInvoice } from "./extract";
import { runIngest, type IngestDeps } from "./pipeline";
import type { IngestParams } from "./upload";
import { matchInvoiceLive } from "../matching/index.ts";
import demoInvoice from "../../fixtures/invoice-a.json";
import demoInvoiceB from "../../fixtures/invoice-b.json";

/**
 * The ingesting agent.
 *
 * One Durable Object per document. It owns that document's journey from bytes
 * to a flagged review, and — the reason it is an agent rather than a function —
 * it publishes the state of that journey while it happens.
 *
 * The board opens the moment the upload returns, before extraction has
 * finished, and reads this state to tell a slow model from a dead one.
 */

export type IngestStatus = "idle" | "extracting" | "ready" | "failed";

export interface IngestState {
  docId: string | null;
  sessionId: string | null;
  status: IngestStatus;
  invoice: ExtractedInvoice | null;
  lines: LineReview[];
  /** Set only when status is `failed`. The reason, in words a person can read. */
  error: string | null;
  updatedAt: number;
}

export const INITIAL_STATE: IngestState = {
  docId: null,
  sessionId: null,
  status: "idle",
  invoice: null,
  lines: [],
  error: null,
  updatedAt: 0,
};

/** Just enough of the agent for the pipeline to publish through. */
export interface StateSink {
  readonly state: IngestState;
  setState(next: IngestState): void;
}

const ATTEMPTS = 3;

/**
 * Retry a step that talks to the model.
 *
 * An Agent has no `step.do`, so the retry a Workflow gave us for free has to be
 * explicit. This is not durable — an eviction mid-run starts over rather than
 * resuming — but it covers what actually goes wrong in a two-minute demo, which
 * is one flaky call to a remote model.
 */
export async function withRetry<T>(
  label: string,
  work: () => Promise<T>,
  delayMs = 1000,
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await work();
    } catch (error) {
      last = error;
      if (attempt < ATTEMPTS && delayMs > 0) {
        // Exponential, matching what the Workflow step used.
        await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** (attempt - 1)));
      }
    }
  }
  throw last instanceof Error ? last : new Error(`${label} failed: ${String(last)}`);
}

/**
 * Run the pipeline, publishing each transition as it happens.
 *
 * Separate from the `Agent` subclass so the transitions can be tested without
 * standing up a Durable Object — the AI binding is remote even locally, so a
 * test that boots the real agent cannot run without an account.
 */
export async function performIngest(
  sink: StateSink,
  deps: IngestDeps,
  params: IngestParams,
): Promise<ReviewSession> {
  sink.setState({
    ...INITIAL_STATE,
    docId: params.docId,
    sessionId: params.sessionId,
    status: "extracting",
    updatedAt: Date.now(),
  });

  try {
    const session = await runIngest(deps, params);

    sink.setState({
      docId: params.docId,
      sessionId: params.sessionId,
      status: "ready",
      invoice: session.invoice,
      lines: session.lines,
      error: null,
      updatedAt: Date.now(),
    });

    return session;
  } catch (error) {
    // Publish the failure before rethrowing. A board left on "extracting"
    // forever is the worst outcome.
    sink.setState({
      ...sink.state,
      status: "failed",
      invoice: null,
      lines: [],
      error: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    });
    throw error;
  }
}

interface IngestAgentEnv extends Env {
  REVIEW_SESSION: DurableObjectNamespace<ReviewSessionDO>;
}

export class IngestAgent extends Agent<IngestAgentEnv, IngestState> {
  initialState: IngestState = INITIAL_STATE;

  /** The board reads this on load and on refresh; state sync covers the live case. */
  async onRequest(): Promise<Response> {
    return Response.json(this.state, { headers: { "cache-control": "no-store" } });
  }

  /**
   * Ingest one document.
   *
   * Not awaited by the upload route: extraction takes as long as the model
   * takes, and the response must not wait for it.
   */
  @callable()
  async ingest(params: IngestParams): Promise<IngestState> {
    await performIngest(this, this.deps(), params);
    return this.state;
  }

  private deps(): IngestDeps {
    const env = this.env;

    return {
      loadDocument: async (r2Key) => {
        const object = await env.DOCS.get(r2Key);
        if (!object) throw new Error(`no object in R2 at ${r2Key}`);
        return object.blob();
      },

      toMarkdown: (filename, blob) =>
        withRetry("toMarkdown", () => documentToMarkdown(env.AI as never, filename, blob)),

      extract: (markdown, docId) =>
        withRetry("extract", () =>
          extractInvoice(
            // Bound: workerd rejects global fetch called as a method of
            // anything but the global, with "Illegal invocation".
            { fetch: globalThis.fetch.bind(globalThis), apiToken: env.HACKATHON_AI_TOKEN },
            { markdown, docId },
          ),
        ),

      match: (invoice) => matchInvoiceLive(invoice, env),

      /*
       * Hand the finished session to D's Durable Object.
       *
       * Named by sessionId, which is the same name the session API reads by.
       * Without this the agent builds a correct session and discards it:
       * upload answers 202 and GET /api/sessions/:id 404s forever after.
       */
      seedSession: async (session) => {
        await env.REVIEW_SESSION.getByName(session.sessionId).seed(session);
      },

      markDocument: async (docId, vendor, status) => {
        await env.DB.prepare(`UPDATE documents SET vendor = ?, status = ? WHERE doc_id = ?`)
          .bind(vendor, status, docId)
          .run();
      },

      demoInvoice: demoInvoice as ExtractedInvoice,
      demoInvoiceB: demoInvoiceB as ExtractedInvoice,
    };
  }
}
