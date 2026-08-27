import { z } from "zod";
import type { ExtractedInvoice } from "../shared/contracts";

/**
 * The contract as a zod schema, and the gate that enforces it.
 *
 * Two jobs. It constrains the model (the JSON Schema handed to Workers AI is
 * generated from here, so there is one definition, not two that drift), and it
 * rejects what comes back if the model ignored it.
 *
 * Everything is strict. A schema constrains a model; it does not make the model
 * honest about a field that was not in the document.
 */

/** Rejects NaN and Infinity, which `JSON.parse` will happily hand us. */
const finiteNumber = z.number().finite();

export const ExtractedLineSchema = z
  .object({
    lineId: z.string().min(1),
    rawText: z.string(),
    // Nullable, but required: the model must say it looked and found nothing,
    // rather than quietly omitting the key.
    sku: z.string().nullable(),
    description: z.string(),
    quantity: finiteNumber,
    unitPrice: finiteNumber,
    lineTotal: finiteNumber,
    uom: z.string().nullable(),
  })
  // Closed field set. An invented key is dropped here rather than travelling
  // all the way to the review screen.
  .strip();

/**
 * The object schema on its own, without the cross-line refinement below.
 *
 * This is what the model's JSON Schema is generated from: a refinement cannot
 * be expressed in JSON Schema, and duplicate lineIds are our problem to catch,
 * not something to ask the model to reason about.
 */
export const ExtractedInvoiceObject = z
  .object({
    docId: z.string().min(1),
    vendor: z.string(),
    invoiceNumber: z.string(),
    issueDate: z.string(),
    currency: z.string(),
    lineItems: z.array(ExtractedLineSchema),
    totals: z
      .object({
        subtotal: finiteNumber,
        tax: finiteNumber,
        total: finiteNumber,
      })
      .strip(),
  })
  .strip();

export const ExtractedInvoiceSchema = ExtractedInvoiceObject.superRefine((invoice, ctx) => {
    // lineId is what the session keys every flag and edit on. Two lines sharing
    // one id means a reviewer's decision lands on the wrong line.
    const seen = new Set<string>();
    invoice.lineItems.forEach((line, i) => {
      if (seen.has(line.lineId)) {
        ctx.addIssue({
          code: "custom",
          path: ["lineItems", i, "lineId"],
          message: `duplicate lineId "${line.lineId}"`,
        });
      }
      seen.add(line.lineId);
    });
});

export type ParseResult =
  | { ok: true; invoice: ExtractedInvoice }
  | { ok: false; errors: string[] };

/**
 * Validate whatever the model returned.
 *
 * Returns every problem rather than the first, because the errors are fed back
 * to the model as the repair prompt — one round trip should fix all of them.
 */
export function parseExtractedInvoice(input: unknown): ParseResult {
  const result = ExtractedInvoiceSchema.safeParse(input);
  if (result.success) return { ok: true, invoice: result.data };

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}
