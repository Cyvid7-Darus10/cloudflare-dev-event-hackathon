/**
 * A reviewed version of `fixtures/session-a.json`, for local preview only.
 *
 * The canonical fixture is deliberately all-pending: it is what the flag board
 * loads before anybody has decided anything. Publish needs the other end of
 * that, a session where a reviewer has been through it.
 *
 * Rather than keep a second hand-written invoice that drifts the moment Siva
 * edits the first one, this derives `finalValues` from the flags already on the
 * canonical fixture. Change the fixture and this follows.
 *
 * Nothing here ships. The Worker reads a real session from the Durable Object.
 */

import type { LineReview, ReviewSession } from "../src/shared/contracts.ts";

type Choice =
  | { kind: "accept_standard" }
  | { kind: "accept_document" }
  | { kind: "edited"; values: Record<string, unknown> };

/**
 * What a reviewer decided, line by line.
 *
 * The mix is the point. `accept_standard` corrects the invoice, which is the
 * money. `accept_document` leaves the invoice alone and teaches the price list,
 * which is the payoff architecture.md wants judges to see. `edited` is the
 * third value a person types when neither side is right.
 */
const DECISIONS: Record<string, Choice> = {
  L1: { kind: "accept_standard" },                 // billed above contract
  L2: { kind: "accept_standard" },                 // priced per carton, billed per unit
  L3: { kind: "accept_document" },                 // vendor's name is legitimate, learn it
  L4: { kind: "accept_standard" },                 // arithmetic error
  L6: { kind: "accept_document" },                 // semantic match confirmed, learn the alias
  L7: {
    kind: "edited",
    values: { sku: "SKU-9001", description: "Produce crate, seasonal assortment" },
  },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Accepting the standard means every flagged field takes the standard's value.
 * A corrected unit price has to carry the line total with it, or the document
 * states a price and a total that do not multiply, which is the one arithmetic
 * error this whole product exists to catch.
 */
function fromStandard(review: LineReview, quantity: number): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const flag of review.flags) {
    if (flag.status === "match") continue;
    if (flag.standardValue === null || flag.standardValue === undefined) continue;
    values[flag.field] = flag.standardValue;
  }
  if (typeof values.unitPrice === "number") {
    values.lineTotal = round2(values.unitPrice * quantity);
  }
  return values;
}

export function reviewedSession(session: ReviewSession): ReviewSession {
  const quantities = new Map(session.invoice.lineItems.map((l) => [l.lineId, l.quantity]));

  return {
    ...session,
    lines: session.lines.map((review) => {
      const choice = DECISIONS[review.lineId];
      if (!choice) return review;

      if (choice.kind === "accept_document") {
        return { ...review, resolution: "accept_document" };
      }
      if (choice.kind === "edited") {
        return { ...review, resolution: "edited", finalValues: choice.values };
      }
      return {
        ...review,
        resolution: "accept_standard",
        finalValues: fromStandard(review, quantities.get(review.lineId) ?? 0),
      };
    }),
  };
}
