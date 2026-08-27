import type { ExtractedInvoice, LineReview, ReviewSession } from "../shared/contracts";
import type { IngestParams } from "./upload";

/**
 * The ingest pipeline: what happens to a document, in order.
 *
 * Kept separate from the agent that runs it, and taking its collaborators as
 * arguments, so the ordering is testable without a live account. Michelle and
 * Zuriel each land against one seam here.
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
  /** `fixtures/invoice-a.json`, used when `demo` is set and fixture is `"a"` or omitted. */
  demoInvoice: ExtractedInvoice;
  /** `fixtures/invoice-b.json`, used when `demo` is set and fixture is `"b"`. */
  demoInvoiceB?: ExtractedInvoice;
}

function demoInvoiceFor(deps: IngestDeps, params: IngestParams): ExtractedInvoice {
  if (params.fixture === "b") {
    if (!deps.demoInvoiceB) throw new Error("demo fixture b is not loaded");
    return deps.demoInvoiceB;
  }
  return deps.demoInvoice;
}

export async function runIngest(deps: IngestDeps, params: IngestParams): Promise<ReviewSession> {
  const { docId, sessionId, r2Key, filename, demo } = params;

  try {
    // The demo path skips both AI calls entirely. It exists so the stage does
    // not depend on the model behaving, and it has to be a real path through
    // the same code, not a separate one that rots.
    const invoice: ExtractedInvoice = demo
      ? { ...demoInvoiceFor(deps, params), docId }
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
    // Record the failure, then rethrow. Swallowing this would leave a session
    // stuck on "extracting" with nothing saying why.
    await deps.markDocument(docId, null, "failed");
    throw error;
  }
}
