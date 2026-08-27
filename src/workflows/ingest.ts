import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { ExtractedInvoice, LineReview, ReviewSession } from "../shared/contracts";
import type { IngestParams } from "../ingest/upload";
import { documentToMarkdown, extractInvoice } from "../ingest/extract";
import demoInvoice from "../../fixtures/invoice-a.json";

/**
 * Ingest as durable steps.
 *
 * The point of the Workflow is that a failed extraction retries from the
 * extraction step, not from the upload. So each step is small and the failure
 * is loud.
 *
 * `runIngest` holds the orchestration and takes its collaborators as arguments.
 * That keeps the ordering testable without a live account, and gives Michelle
 * and Zuriel a single seam each to land against at integration.
 */

export interface IngestDeps {
  loadDocument(r2Key: string): Promise<Blob>;
  toMarkdown(filename: string, blob: Blob): Promise<string>;
  extract(markdown: string, docId: string): Promise<ExtractedInvoice>;
  /** Michelle's matcher. Pure, takes the invoice, returns a review per line. */
  match(invoice: ExtractedInvoice): Promise<LineReview[]>;
  /** Zuriel's ReviewSession DO. */
  seedSession(session: ReviewSession): Promise<void>;
  markDocument(docId: string, vendor: string | null, status: string): Promise<void>;
  /** `fixtures/invoice-a.json`, used only when `demo` is set. */
  demoInvoice: ExtractedInvoice;
}

export async function runIngest(deps: IngestDeps, params: IngestParams): Promise<ReviewSession> {
  const { docId, sessionId, r2Key, filename, demo } = params;

  try {
    // The demo path skips both AI calls entirely. It exists so the stage does
    // not depend on the model behaving, and it has to be a real path through
    // the same code, not a separate one that rots.
    const invoice: ExtractedInvoice = demo
      ? { ...deps.demoInvoice, docId }
      : await (async () => {
          const blob = await deps.loadDocument(r2Key);
          const markdown = await deps.toMarkdown(filename, blob);
          return deps.extract(markdown, docId);
        })();

    const lines = await deps.match(invoice);

    const session: ReviewSession = {
      sessionId,
      docId,
      invoice,
      lines,
      status: "ready",
      updatedAt: Date.now(),
    };

    await deps.seedSession(session);
    await deps.markDocument(docId, invoice.vendor, "ready");

    return session;
  } catch (error) {
    // Record the failure, then rethrow so the step fails and Workflows can
    // resume it. Swallowing this would leave a session stuck on "extracting"
    // with nothing saying why.
    await deps.markDocument(docId, null, "failed");
    throw error;
  }
}

interface IngestEnv {
  AI: Ai;
  DOCS: R2Bucket;
  DB: D1Database;
  /** AI Gateway token, set as a Worker var. Never in git. */
  HACKATHON_AI_TOKEN: string;
}

export class IngestWorkflow extends WorkflowEntrypoint<IngestEnv, IngestParams> {
  async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep): Promise<void> {
    const env = this.env;
    const params = event.payload;

    const deps: IngestDeps = {
      loadDocument: async (r2Key) => {
        const object = await env.DOCS.get(r2Key);
        if (!object) throw new Error(`no object in R2 at ${r2Key}`);
        return object.blob();
      },

      toMarkdown: (filename, blob) =>
        step.do("toMarkdown", () => documentToMarkdown(env.AI as never, filename, blob)),

      extract: (markdown, docId) =>
        step.do("extract", () =>
          extractInvoice({ fetch: globalThis.fetch, apiToken: env.HACKATHON_AI_TOKEN }, { markdown, docId }),
        ),

      // Michelle (workstream C) lands here at integration. Until then every
      // line comes back unmatched, which is a truthful empty state rather than
      // a fake one: the board shows the invoice and flags nothing.
      match: async (invoice) =>
        invoice.lineItems.map((line) => ({
          lineId: line.lineId,
          matchedSku: null,
          matchMethod: "none" as const,
          matchScore: 0,
          flags: [],
          resolution: "pending" as const,
        })),

      // Zuriel (workstream D) lands here at integration.
      seedSession: async () => {},

      markDocument: async (docId, vendor, status) => {
        await env.DB.prepare(`UPDATE documents SET vendor = ?, status = ? WHERE doc_id = ?`)
          .bind(vendor, status, docId)
          .run();
      },

      demoInvoice: demoInvoice as ExtractedInvoice,
    };

    await runIngest(deps, params);
  }
}
