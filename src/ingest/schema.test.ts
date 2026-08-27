import { describe, expect, it } from "vitest";
import { parseExtractedInvoice } from "./schema";

/**
 * `plan/contract.md` restated as assertions.
 *
 * The plan calls malformed JSON the single most likely failure in the project,
 * so this gate is the difference between a failed step Workflows can retry and
 * a confident wrong invoice reaching Michelle's matcher.
 */
describe("parseExtractedInvoice", () => {
  const line = {
    lineId: "L0",
    rawText: "2 x Rapeseed Oil 5L @ 42.50",
    sku: "NW-1042",
    description: "Cold-pressed rapeseed oil, 5L",
    quantity: 2,
    unitPrice: 42.5,
    lineTotal: 85,
    uom: "EA",
  };

  const invoice = {
    docId: "doc-1",
    vendor: "Northwind Trading Pte Ltd",
    invoiceNumber: "INV-2026-0912",
    issueDate: "2026-08-27",
    currency: "SGD",
    lineItems: [line],
    totals: { subtotal: 85, tax: 7.65, total: 92.65 },
  };

  it("accepts a conforming invoice", () => {
    const result = parseExtractedInvoice(invoice);
    expect(result.ok).toBe(true);
    expect(result.ok && result.invoice.lineItems[0].lineId).toBe("L0");
  });

  it("keeps a null sku as null rather than filling the gap", () => {
    // The plan is explicit: if the PDF does not say, sku is null.
    const result = parseExtractedInvoice({ ...invoice, lineItems: [{ ...line, sku: null }] });
    expect(result.ok).toBe(true);
    expect(result.ok && result.invoice.lineItems[0].sku).toBeNull();
  });

  it("keeps a null uom as null", () => {
    const result = parseExtractedInvoice({ ...invoice, lineItems: [{ ...line, uom: null }] });
    expect(result.ok && result.invoice.lineItems[0].uom).toBeNull();
  });

  it("rejects a stringified number, because numbers are numbers", () => {
    // The contract's second ground rule. "42.50" would break every downstream
    // arithmetic check in Michelle's diff.
    const result = parseExtractedInvoice({ ...invoice, lineItems: [{ ...line, unitPrice: "42.50" }] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(" ")).toMatch(/unitPrice/);
  });

  it("rejects a missing sku key instead of treating it as null", () => {
    // Absent and null are different mistakes. Requiring the key means the
    // model has to say it looked and found nothing.
    const { sku, ...noSku } = line;
    const result = parseExtractedInvoice({ ...invoice, lineItems: [noSku] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(" ")).toMatch(/sku/);
  });

  it("rejects a line with no lineId", () => {
    const { lineId, ...noId } = line;
    const result = parseExtractedInvoice({ ...invoice, lineItems: [noId] });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate lineIds, which would collide in the session", () => {
    const result = parseExtractedInvoice({ ...invoice, lineItems: [line, { ...line, lineId: "L0" }] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(" ")).toMatch(/L0/);
  });

  it("rejects a missing totals block", () => {
    const { totals, ...noTotals } = invoice;
    expect(parseExtractedInvoice(noTotals).ok).toBe(false);
  });

  it("rejects NaN, which JSON.parse can produce from a bad number", () => {
    const result = parseExtractedInvoice({ ...invoice, lineItems: [{ ...line, quantity: NaN }] });
    expect(result.ok).toBe(false);
  });

  it("accepts an invoice with no line items", () => {
    // A covering page is a real thing to receive. Michelle flags nothing.
    const result = parseExtractedInvoice({ ...invoice, lineItems: [] });
    expect(result.ok).toBe(true);
  });

  it("strips a field the model invented rather than passing it on", () => {
    // Closed field set. An extra key would travel all the way to the UI.
    const result = parseExtractedInvoice({
      ...invoice,
      lineItems: [{ ...line, discountPercent: 10 }],
    });
    expect(result.ok && "discountPercent" in result.invoice.lineItems[0]).toBe(false);
  });

  it("reports every problem, not just the first", () => {
    const result = parseExtractedInvoice({
      ...invoice,
      lineItems: [{ ...line, unitPrice: "x", quantity: "y" }],
    });
    expect(!result.ok && result.errors.length).toBeGreaterThan(1);
  });

  it("rejects prose, an array, and null", () => {
    expect(parseExtractedInvoice("here is your invoice").ok).toBe(false);
    expect(parseExtractedInvoice([]).ok).toBe(false);
    expect(parseExtractedInvoice(null).ok).toBe(false);
  });
});
