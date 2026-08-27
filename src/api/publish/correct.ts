/**
 * Turning a reviewed session into the invoice we send back.
 *
 * Everything here is pure. No env, no fetch, no Cloudflare API, so it runs under
 * plain node in milliseconds and the visual loop is a browser refresh.
 *
 * Money is held in integer cents for every intermediate step. Summing a column
 * of floats is how a corrected invoice ends up stating 1718.1999999999998, and a
 * document whose arithmetic is visibly wrong is worse than no document.
 */

import type {
  ExtractedLine, FieldFlag, LineReview, ReviewSession,
} from "../../shared/contracts.ts";

export const toCents = (n: number): number => Math.round(n * 100);

/** `numerator / denominator`, rounded half up, without ever leaving integers. */
function halfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}
export const fromCents = (c: number): number => c / 100;

/** Fixed two decimals with thousands separators. Never locale-dependent. */
export function money(cents: number): string {
  const neg = cents < 0;
  const s = Math.abs(cents).toString().padStart(3, "0");
  const whole = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${whole}.${s.slice(-2)}`;
}

/** A field on a line whose value the review changed. */
export type FieldChange = {
  field: keyof ExtractedLine;
  from: unknown;
  to: unknown;
  reason: string;
};

export type CorrectedLine = {
  lineId: string;
  original: ExtractedLine;
  corrected: ExtractedLine;
  changes: FieldChange[];
  /** Reviewed, but the invoice was found to be right. Nothing on the line moved. */
  standardUpdated: boolean;
  /** Carries flags nobody has resolved yet. */
  unresolved: boolean;
  flags: FieldFlag[];
  matchMethod: LineReview["matchMethod"];
  matchScore: number;
  matchedSku: string | null;
};

export type CorrectedInvoice = {
  vendor: string;
  invoiceNumber: string;
  issueDate: string;
  currency: string;
  sessionId: string;
  lines: CorrectedLine[];
  /** Cents throughout. */
  originalSubtotal: number;
  correctedSubtotal: number;
  originalTax: number;
  correctedTax: number;
  originalTotal: number;
  correctedTotal: number;
  /** Derived from the document's own stated tax, not hardcoded. */
  taxRate: number;
  changedLineCount: number;
  standardUpdatedCount: number;
  unresolvedCount: number;
};

const FIELDS: (keyof ExtractedLine)[] = [
  "sku", "description", "quantity", "unitPrice", "uom", "lineTotal",
];

/**
 * Why a field moved.
 *
 * Only a flag that actually disagreed explains a change. A flag whose status is
 * `match` is the diff saying this field was fine, so quoting its reason next to
 * a changed value tells the reader something untrue about their own invoice.
 *
 * A line total that moved with no disagreeing flag of its own moved because the
 * unit price above it moved, and the document should say exactly that.
 */
function reasonFor(
  flags: FieldFlag[],
  field: keyof ExtractedLine,
  changedFields: Set<string>,
): string {
  const flag = flags.find((f) => f.field === (field as FieldFlag["field"]));
  if (flag && flag.status !== "match") return flag.reason;
  if (field === "lineTotal" && changedFields.has("unitPrice")) {
    return "Recomputed from the corrected unit price.";
  }
  return "";
}

/**
 * Apply a line's resolution to produce the line we bill.
 *
 * `accept_standard` and `edited` write `finalValues` over the extracted line.
 * `accept_document` means the standard was stale: the standard changed, the
 * invoice line did not, so nothing here moves. `pending` also leaves the line
 * alone, but is reported rather than passed over in silence.
 */
export function correctLine(original: ExtractedLine, review: LineReview): CorrectedLine {
  const applies = review.resolution === "accept_standard" || review.resolution === "edited";
  const final = applies ? (review.finalValues ?? {}) : {};
  const corrected: ExtractedLine = { ...original, ...final };

  const changedFields = new Set(FIELDS.filter((f) => original[f] !== corrected[f]));
  const changes: FieldChange[] = [...changedFields].map((field) => ({
    field,
    from: original[field],
    to: corrected[field],
    reason: reasonFor(review.flags, field, changedFields),
  }));

  return {
    lineId: review.lineId,
    original,
    corrected,
    changes,
    standardUpdated: review.resolution === "accept_document",
    // A line whose flags all say `match` is agreed, not undecided. Counting it
    // as unresolved puts a warning on a document that has nothing wrong with it.
    unresolved: review.resolution === "pending"
      && review.flags.some((f) => f.status !== "match"),
    flags: review.flags,
    matchMethod: review.matchMethod,
    matchScore: review.matchScore,
    matchedSku: review.matchedSku,
  };
}

export function correctInvoice(session: ReviewSession): CorrectedInvoice {
  const { invoice } = session;
  const byLineId = new Map(session.lines.map((r) => [r.lineId, r]));

  const lines = invoice.lineItems.map((item) => {
    const review = byLineId.get(item.lineId);
    // A line with no review is a line nobody looked at. Treat it as pending with
    // no flags rather than dropping it: an invoice missing a line is not an
    // invoice, and silently omitting one would be the worst failure available.
    return correctLine(item, review ?? {
      lineId: item.lineId, matchedSku: item.sku, matchMethod: "none",
      matchScore: 0, flags: [], resolution: "pending",
    });
  });

  // "As invoiced" is what the supplier actually stated, not our re-addition of
  // their lines. If an invoice carries a header adjustment or a rounding
  // difference, restating its total as our own sum would put a number on the
  // page that the supplier never wrote.
  const originalSubtotal = toCents(invoice.totals.subtotal);
  const originalTax = toCents(invoice.totals.tax);
  const originalTotal = toCents(invoice.totals.total);

  // Corrections are applied as a delta against the stated figures, so anything
  // the stated total includes but the lines do not is carried through.
  const lineDelta = lines.reduce(
    (a, l) => a + toCents(l.corrected.lineTotal) - toCents(l.original.lineTotal), 0,
  );
  const correctedSubtotal = originalSubtotal + lineDelta;

  // Tax at the rate the document itself billed at, computed on integers.
  // Scaling cents through a floating rate rounds to the wrong cent: a 29/100
  // rate on 50 cents evaluates to 14.499999999999998, which rounds down to 14
  // where half-up gives 15.
  const correctedTax = originalSubtotal > 0
    ? halfUp(correctedSubtotal * originalTax, originalSubtotal)
    : 0;
  const taxRate = originalSubtotal > 0 ? originalTax / originalSubtotal : 0;

  // Whatever the stated total holds beyond subtotal and tax stays put.
  const adjustment = originalTotal - originalSubtotal - originalTax;

  return {
    vendor: invoice.vendor,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    currency: invoice.currency,
    sessionId: session.sessionId,
    lines,
    originalSubtotal,
    correctedSubtotal,
    originalTax,
    correctedTax,
    originalTotal,
    correctedTotal: correctedSubtotal + correctedTax + adjustment,
    taxRate,
    changedLineCount: lines.filter((l) => l.changes.length > 0).length,
    standardUpdatedCount: lines.filter((l) => l.standardUpdated).length,
    unresolvedCount: lines.filter((l) => l.unresolved).length,
  };
}
