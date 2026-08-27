/**
 * C's public surface. Bryan's ingest imports `matchInvoiceLive`. D's session
 * imports `applyWriteBack`. Tests import `matchInvoice` and inject semantic.
 */

import type { ExtractedInvoice, LineReview, StandardProduct } from "../shared/contracts.ts";

export { normalize } from "./normalize.ts";
export { matchInvoice, type SemanticLookup } from "./match.ts";
export { matchInvoiceLive } from "./live.ts";
export { seedCatalogueEmbeddings } from "./embeddings.ts";
export { applyWriteBack, type WriteBackEvent } from "./writeback.ts";

export type { ExtractedInvoice, LineReview, StandardProduct };
