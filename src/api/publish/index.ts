/**
 * Publish: a reviewed session in, a corrected invoice page out.
 *
 * This is the only async step, because `crypto.subtle.digest` is async. Keeping
 * it here leaves `renderInvoice` synchronous and pure.
 */

import type { ReviewSession } from "../../shared/contracts.ts";
import { correctInvoice, type CorrectedInvoice } from "./correct.ts";
import { contentHash } from "./hash.ts";
import { renderInvoice } from "./render.ts";

export type PublishOptions = {
  dataSource: "live" | "fixture";
  sourceNote?: string;
  /** Injected so the caller controls the clock and tests stay deterministic. */
  now?: Date;
};

export type PublishResult = {
  html: string;
  hash: string;
  doc: CorrectedInvoice;
};

/**
 * The substance of the document, and nothing else.
 *
 * Deliberately excludes `generatedAt` and the session id. The hash answers one
 * question: did the invoice we are sending change. A re-render a minute later
 * must produce the same digest, or the number is decoration. Resolving a flag
 * must change it, or the number is a lie.
 */
function hashPayload(doc: CorrectedInvoice) {
  return {
    vendor: doc.vendor,
    invoiceNumber: doc.invoiceNumber,
    issueDate: doc.issueDate,
    currency: doc.currency,
    lines: doc.lines.map((l) => ({ lineId: l.lineId, corrected: l.corrected })),
    subtotal: doc.correctedSubtotal,
    tax: doc.correctedTax,
    total: doc.correctedTotal,
  };
}

/** ISO 8601 to the second, in UTC. Readable on a page, unambiguous in a footer. */
function stamp(now: Date): string {
  return `${now.toISOString().slice(0, 19)}Z`;
}

export async function publishInvoice(
  session: ReviewSession,
  options: PublishOptions,
): Promise<PublishResult> {
  const doc = correctInvoice(session);
  const hash = await contentHash(hashPayload(doc));
  const html = renderInvoice(doc, {
    generatedAt: stamp(options.now ?? new Date()),
    contentHash: hash,
    dataSource: options.dataSource,
    sourceNote: options.sourceNote,
  });
  return { html, hash, doc };
}
