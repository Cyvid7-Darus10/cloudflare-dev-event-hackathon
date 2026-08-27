/**
 * Ingest's import seam for C's matcher.
 *
 * Prefer the static export from `src/matching/index.ts`. This file exists so
 * ingest keeps a single call site if that barrel moves; it re-exports rather
 * than wrapping.
 */
export { matchInvoice, matchInvoiceLive } from "../matching/index.ts";
