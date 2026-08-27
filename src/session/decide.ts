/**
 * Turning a reviewer's click into the values a decision actually writes.
 *
 * The flag board sends `accept_standard` with no values, because from its side
 * "the standard is right" is the whole decision and it should not have to
 * restate what the standard says. The server holds the flags, so the server
 * works out what that means. Without this, accepting the standard applied an
 * empty object and the corrected invoice came out identical to the original.
 *
 * Numbers arrive as strings from an HTML input. They are coerced here, at the
 * boundary, so nothing downstream has to wonder whether `unitPrice` is a number.
 */

import type { ExtractedLine, LineReview } from "../shared/contracts.ts";

type Resolution = Exclude<LineReview["resolution"], "pending">;

const NUMERIC = new Set(["quantity", "unitPrice", "lineTotal"]);
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** `"70"` and `70` are the same price. `"abc"` is not a price at all. */
function coerce(field: string, value: unknown): unknown {
  if (!NUMERIC.has(field)) return value;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

export class InvalidDecision extends Error {}

/**
 * What this decision writes onto the line.
 *
 * `accept_standard` takes every disagreeing field's standard value.
 * `edited` takes the reviewer's typed values.
 * `accept_document` writes nothing: the invoice was right, and it is the
 * catalogue that changes. It must also clear any values a previous decision
 * left behind, or changing your mind leaves the old correction applied.
 *
 * In both writing cases a changed quantity or unit price carries the line total
 * with it. A document stating a price and a total that do not multiply is the
 * exact error this product exists to catch, and emitting one ourselves would be
 * indefensible.
 */
export function decidedValues(
  review: LineReview,
  line: ExtractedLine,
  resolution: Resolution,
  supplied?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (resolution === "accept_document") return undefined;

  const values: Record<string, unknown> = {};

  if (resolution === "accept_standard") {
    for (const flag of review.flags) {
      if (flag.status === "match") continue;
      if (flag.standardValue === null || flag.standardValue === undefined) continue;
      const v = coerce(flag.field, flag.standardValue);
      if (v !== undefined) values[flag.field] = v;
    }
  } else {
    for (const [field, raw] of Object.entries(supplied ?? {})) {
      if (raw === undefined) continue;
      const v = coerce(field, raw);
      if (v === undefined) {
        throw new InvalidDecision(`${field} must be a number, received ${JSON.stringify(raw)}.`);
      }
      values[field] = v;
    }
    if (Object.keys(values).length === 0) {
      throw new InvalidDecision("An edited line needs at least one value.");
    }
  }

  // A line total the reviewer typed themselves is theirs to keep. One they did
  // not is ours to keep consistent.
  const quantity = (values.quantity ?? line.quantity) as number;
  const unitPrice = (values.unitPrice ?? line.unitPrice) as number;
  if (values.lineTotal === undefined
    && (values.quantity !== undefined || values.unitPrice !== undefined)
    && Number.isFinite(quantity) && Number.isFinite(unitPrice)) {
    values.lineTotal = round2(quantity * unitPrice);
  }

  return Object.keys(values).length > 0 ? values : undefined;
}

/** Order-insensitive, so a re-sent decision is recognised as the same one. */
export function sameValues(a?: Record<string, unknown>, b?: Record<string, unknown>): boolean {
  const ka = Object.keys(a ?? {}).sort();
  const kb = Object.keys(b ?? {}).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => kb[i] === k && (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}
