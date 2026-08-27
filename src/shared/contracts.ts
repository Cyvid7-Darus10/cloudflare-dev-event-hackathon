/**
 * The frozen contract.
 *
 * `architecture.md` is the agreement; these types are it, verbatim. Every
 * workstream codes against this file plus a fixture, so nobody blocks on
 * anybody.
 *
 * Person A (Siva) owns this file. Nobody changes it without saying so out
 * loud — a silent change here breaks four workstreams at once.
 */

export type ExtractedLine = {
  lineId: string;            // stable: `L0`, `L1`, ...
  rawText: string;           // the line exactly as it appeared
  sku: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  uom: string | null;
};

export type ExtractedInvoice = {
  docId: string;
  vendor: string;
  invoiceNumber: string;
  issueDate: string;         // ISO
  currency: string;
  lineItems: ExtractedLine[];
  totals: { subtotal: number; tax: number; total: number };
};

export type StandardProduct = {
  sku: string;
  canonicalName: string;
  uom: string;
  listPrice: number;
  currency: string;
  taxCode: string;
  aliases: string[];
  version: number;
};

export type FlagStatus = 'match' | 'mismatch' | 'unmatched';
export type FlaggedField =
  | 'sku' | 'description' | 'unitPrice' | 'uom' | 'quantity' | 'lineTotal' | 'taxCode';

export type FieldFlag = {
  field: FlaggedField;
  documentValue: unknown;
  standardValue: unknown;
  status: FlagStatus;
  confidence: number;        // 0..1
  reason: string;            // human-readable, shown in the UI
};

export type LineReview = {
  lineId: string;
  matchedSku: string | null;
  matchMethod: 'exact' | 'alias' | 'semantic' | 'none';
  matchScore: number;
  flags: FieldFlag[];
  resolution: 'pending' | 'accept_standard' | 'accept_document' | 'edited';
  finalValues?: Partial<ExtractedLine>;
};

export type ReviewSession = {
  sessionId: string;
  docId: string;
  invoice: ExtractedInvoice;
  lines: LineReview[];
  status: 'extracting' | 'ready' | 'reviewing' | 'published';
  updatedAt: number;
};
