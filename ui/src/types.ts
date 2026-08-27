/**
 * The contract, in TypeScript.
 *
 * `plan/contract.md` is the agreement, now filled in; these types mirror it.
 * If the two disagree, the contract wins — change these to match and the
 * compiler will point at everything that needs to follow.
 */

/** One product, once a document has been parsed. */
export interface ProductRecord {
  /** What we match a product on across documents. Everything hangs on this. */
  sku: string;
  name: string;
  description?: string;
  unit?: string;
  [field: string]: string | undefined;
}

/**
 * Why a field was raised.
 *
 * A mismatch is not the only reason to ask a person. A field we have never seen
 * and a field the customer left out are different questions with different
 * right answers, and lumping them together makes a reviewer read every one.
 */
export type FlagKind =
  /** Both have a value and they disagree. */
  | "mismatch"
  /** The customer sent a field the standard has never held. */
  | "unknown-field"
  /** The standard holds a field the customer's document did not mention. */
  | "missing";

export type FlagState = "pending" | "accepted" | "rejected" | "edited";

export interface Flag {
  /** Stable across reprocessing the same document, so decisions survive a re-run. */
  id: string;
  sku: string;
  /** Product name, carried so the screen never has to look it up. */
  productName: string;
  field: string;
  kind: FlagKind;
  /** From their document. Null when the document did not mention it. */
  customerValue: string | null;
  /** What we hold. Null when we have never seen this field. */
  standardValue: string | null;
  state: FlagState;
  /** Set only when state is `edited`. */
  resolvedValue?: string;
}

/** A field where the document and the standard already agree. */
export interface Match {
  sku: string;
  field: string;
  value: string;
}

/** Everything one uploaded document produced. */
export interface Review {
  documentName: string;
  receivedAt: string;
  customerName: string;
  flags: Flag[];
  matches: Match[];
}

/** What a reviewer decided, sent back to the standard. */
export interface Decision {
  flagId: string;
  state: Exclude<FlagState, "pending">;
  /**
   * The value that wins. Null on a rejection means the field is left as it
   * was; null on an accepted `missing` flag means the field is removed.
   */
  value: string | null;
}

/**
 * The value a flag will write if resolved as it currently stands.
 *
 * Per the contract: accepted means the customer is right — including an
 * accepted `missing` flag, where the customer's absence wins and the null
 * returned here means the field is removed from the standard. Rejected leaves
 * the standard untouched, so the standard's own value is what stands.
 */
export function winningValue(flag: Flag): string | null {
  if (flag.state === "accepted") return flag.customerValue;
  if (flag.state === "edited") return flag.resolvedValue ?? null;
  if (flag.state === "rejected") return flag.standardValue;
  return null;
}
