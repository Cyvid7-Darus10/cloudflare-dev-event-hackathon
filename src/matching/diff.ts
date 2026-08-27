/**
 * Field-by-field comparison against a matched product.
 *
 * Money uses a 0.5% band — `===` on floats is how you invent flags. lineTotal
 * is the document's own arithmetic, never a re-price from listPrice.
 */

import type {
  ExtractedLine,
  FieldFlag,
  FlaggedField,
  LineReview,
  StandardProduct,
} from "../shared/contracts.ts";
import { PRICE_TOLERANCE } from "./keys.ts";
import { normalize } from "./normalize.ts";

const SGD = "SGD";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number, currency = SGD): string {
  const abs = Math.abs(roundMoney(n)).toFixed(2);
  const sign = n < 0 ? "-" : "";
  if (currency === SGD) return `${sign}S$${abs}`;
  return `${sign}${currency} ${abs}`;
}

/** Relative band, never `===`. A 0.5% gap is rounding; anything larger is a disagreement. */
export function priceDisagrees(billed: number, list: number): boolean {
  if (list === 0) return billed !== 0;
  return Math.abs(billed - list) / Math.abs(list) > PRICE_TOLERANCE;
}

export function needsDecision(line: Pick<LineReview, "flags">): boolean {
  return line.flags.some((flag) => flag.status !== "match");
}

function knownDescription(product: StandardProduct, description: string): boolean {
  const key = normalize(description);
  if (!key) return false;
  if (key === normalize(product.canonicalName)) return true;
  return product.aliases.some((alias) => normalize(alias) === key);
}

function flag(
  field: FlaggedField,
  documentValue: unknown,
  standardValue: unknown,
  status: FieldFlag["status"],
  confidence: number,
  reason: string,
): FieldFlag {
  return { field, documentValue, standardValue, status, confidence, reason };
}

export function diffMatchedLine(
  line: ExtractedLine,
  product: StandardProduct,
  method: Exclude<LineReview["matchMethod"], "none">,
  score: number,
): FieldFlag[] {
  // sku/description rest on the match itself; price, uom, totals are deterministic.
  const matchConfidence = method === "exact" ? 1 : score;
  const currency = product.currency || SGD;

  const skuAgrees = !line.sku || line.sku === product.sku;
  const skuFlag = flag(
    "sku",
    line.sku,
    product.sku,
    skuAgrees ? "match" : "mismatch",
    matchConfidence,
    skuReason(line, product, method, score),
  );

  const descAgrees = knownDescription(product, line.description);
  const descFlag = flag(
    "description",
    line.description,
    product.canonicalName,
    descAgrees ? "match" : "mismatch",
    matchConfidence,
    descAgrees
      ? descMatchReason(product, line.description, method)
      : descMismatchReason(method),
  );

  const uomAgrees = normalize(line.uom ?? "") === normalize(product.uom);
  const priceAgrees = !priceDisagrees(line.unitPrice, product.listPrice);
  const expectedTotal = roundMoney(line.quantity * line.unitPrice);
  const billedTotal = roundMoney(line.lineTotal);
  const totalAgrees = Math.abs(expectedTotal - billedTotal) < 0.005;

  const priceFlag = flag(
    "unitPrice",
    line.unitPrice,
    product.listPrice,
    priceAgrees ? "match" : "mismatch",
    1,
    priceAgrees
      ? uomAgrees
        ? "Billed at list price."
        : "Matches the list price - but see the unit of measure."
      : priceMismatchReason(line, product, currency),
  );

  const uomFlag = flag(
    "uom",
    line.uom,
    product.uom,
    uomAgrees ? "match" : "mismatch",
    1,
    uomAgrees ? "Unit of measure agrees." : uomMismatchReason(line, product, currency),
  );

  const totalFlag = flag(
    "lineTotal",
    line.lineTotal,
    expectedTotal,
    totalAgrees ? "match" : "mismatch",
    1,
    totalAgrees
      ? totalMatchReason(line, expectedTotal, currency, !priceAgrees, !uomAgrees)
      : totalMismatchReason(line, expectedTotal, currency),
  );

  const taxFlag = flag(
    "taxCode",
    null,
    product.taxCode,
    "match",
    1,
    `The invoice states no tax code; the standard's ${product.taxCode} applies.`,
  );

  const flags: FieldFlag[] = [skuFlag, descFlag];
  // Quantity only appears when there is arithmetic to talk about, matching session-a.
  if (!totalAgrees) {
    flags.push(
      flag(
        "quantity",
        line.quantity,
        null,
        "match",
        1,
        "Quantity is the invoice's to state; the standard holds no quantity.",
      ),
    );
  }
  flags.push(priceFlag, uomFlag, totalFlag, taxFlag);
  return flags;
}

export function unmatchedFlags(line: ExtractedLine): FieldFlag[] {
  const expectedTotal = roundMoney(line.quantity * line.unitPrice);
  return [
    flag(
      "sku",
      line.sku,
      null,
      "unmatched",
      0,
      line.sku
        ? `${line.sku} is not in the catalogue, and neither alias nor semantic matched.`
        : "No SKU on the line, no alias hit, and no semantic match above 0.82.",
    ),
    flag(
      "description",
      line.description,
      null,
      "unmatched",
      0,
      "Nothing in the catalogue corresponds to this line.",
    ),
    flag(
      "quantity",
      line.quantity,
      null,
      "unmatched",
      0,
      "Nothing to check the quantity against.",
    ),
    flag(
      "unitPrice",
      line.unitPrice,
      null,
      "unmatched",
      0,
      "No list price to compare - this line is unpriced by the standard.",
    ),
    flag(
      "uom",
      line.uom,
      null,
      "unmatched",
      0,
      line.uom
        ? `${line.uom} is not a unit the catalogue can check without a match.`
        : "No unit of measure to check.",
    ),
    flag(
      "lineTotal",
      line.lineTotal,
      null,
      "unmatched",
      0,
      `${line.quantity} x ${formatMoney(line.unitPrice)} = ${formatMoney(expectedTotal)}; internally consistent, but there is nothing to check it against.`,
    ),
    flag(
      "taxCode",
      null,
      null,
      "unmatched",
      0,
      "No matched product, so no tax code to apply.",
    ),
  ];
}

function skuReason(
  line: ExtractedLine,
  product: StandardProduct,
  method: Exclude<LineReview["matchMethod"], "none">,
  score: number,
): string {
  if (line.sku && line.sku === product.sku) return "Exact SKU match.";
  if (method === "alias") {
    return `No SKU on the line; matched on the known alias '${normalize(line.description)}'.`;
  }
  if (method === "semantic") {
    return `No SKU on the line; matched semantically at ${score.toFixed(2)}.`;
  }
  return `Matched to ${product.sku}.`;
}

function descMatchReason(
  product: StandardProduct,
  description: string,
  method: Exclude<LineReview["matchMethod"], "none">,
): string {
  if (normalize(description) === normalize(product.canonicalName)) {
    return "Matches the canonical name.";
  }
  if (method === "alias") {
    return "A known alias of the canonical name - the standard already learned this one.";
  }
  return "A known alias of the canonical name.";
}

function descMismatchReason(method: Exclude<LineReview["matchMethod"], "none">): string {
  if (method === "semantic") {
    return "Matched by meaning, not by name. Accepting the document records it as an alias, so the next invoice matches without the embedding.";
  }
  return "Not the canonical name and not a known alias. Accepting the document records the vendor wording as an alias, so this vendor's naming matches on its own next time.";
}

function priceMismatchReason(
  line: ExtractedLine,
  product: StandardProduct,
  currency: string,
): string {
  const delta = line.unitPrice - product.listPrice;
  const pct = (Math.abs(delta) / Math.abs(product.listPrice)) * 100;
  const stake = roundMoney(Math.abs(delta) * line.quantity);
  const direction = delta > 0 ? "over" : "under";
  const unit = line.uom ?? product.uom;
  return `Invoice bills ${formatMoney(line.unitPrice, currency)} against a list price of ${formatMoney(product.listPrice, currency)} - ${pct.toFixed(1)}% ${direction}, ${formatMoney(stake, currency)} across ${line.quantity} ${unit}.`;
}

function uomMismatchReason(
  line: ExtractedLine,
  product: StandardProduct,
  currency: string,
): string {
  const billedTotal = formatMoney(line.lineTotal, currency);
  const list = formatMoney(product.listPrice, currency);
  return `The ${list} list price is per ${product.uom}; this line bills it per ${line.uom ?? "unknown"}. ${line.quantity} units at ${product.uom} price is ${billedTotal} for what the standard prices at ${list} a ${product.uom}.`;
}

function totalMatchReason(
  line: ExtractedLine,
  expected: number,
  currency: string,
  priceDisputed: boolean,
  uomDisputed: boolean,
): string {
  const sum = `${line.quantity} x ${formatMoney(line.unitPrice, currency)} = ${formatMoney(expected, currency)}`;
  if (priceDisputed) {
    return `${sum}; the arithmetic is right even though the price is disputed.`;
  }
  if (uomDisputed) {
    return `${sum}; the arithmetic follows from the wrong unit.`;
  }
  return `${sum}.`;
}

function totalMismatchReason(
  line: ExtractedLine,
  expected: number,
  currency: string,
): string {
  const gap = roundMoney(line.lineTotal - expected);
  const direction = gap > 0 ? "over" : "under";
  return `${line.quantity} x ${formatMoney(line.unitPrice, currency)} is ${formatMoney(expected, currency)}; the invoice states ${formatMoney(line.lineTotal, currency)} - ${formatMoney(Math.abs(gap), currency)} ${direction}. Arithmetic error on the document, so keep the standard.`;
}
