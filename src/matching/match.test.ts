import { describe, expect, it } from "vitest";
import invoiceA from "../../fixtures/invoice-a.json";
import invoiceB from "../../fixtures/invoice-b.json";
import sessionA from "../../fixtures/session-a.json";
import standardFixture from "../../fixtures/standard.json";
import type {
  ExtractedInvoice,
  ExtractedLine,
  FlaggedField,
  LineReview,
  StandardProduct,
} from "../shared/contracts.ts";
import { needsDecision, priceDisagrees } from "./diff.ts";
import { matchInvoice, type SemanticLookup } from "./match.ts";
import { normalize } from "./normalize.ts";

const invoice = invoiceA as ExtractedInvoice;
const invoiceNext = invoiceB as ExtractedInvoice;
const standard = standardFixture as StandardProduct[];
const expected = (sessionA as { lines: LineReview[] }).lines;

const mixingBowl: SemanticLookup = async (description) => {
  if (normalize(description).includes("mixing bowl")) {
    return { sku: "SKU-2059", score: 0.88 };
  }
  return null;
};

function flagOf(line: LineReview, field: FlaggedField) {
  return line.flags.find((flag) => flag.field === field);
}

function statuses(line: LineReview): Record<string, string> {
  return Object.fromEntries(line.flags.map((flag) => [flag.field, flag.status]));
}

describe("matchInvoice against invoice-a", () => {
  it("reproduces matchMethod, matchedSku, and mismatch fields from session-a", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    expect(lines).toHaveLength(expected.length);

    for (const want of expected) {
      const got = lines.find((line) => line.lineId === want.lineId);
      expect(got, want.lineId).toBeDefined();
      if (!got) continue;
      expect(got.matchedSku, want.lineId).toBe(want.matchedSku);
      expect(got.matchMethod, want.lineId).toBe(want.matchMethod);
      expect(got.resolution).toBe("pending");
      expect(statuses(got)).toEqual(statuses(want));
    }
  });

  it("has six lines that need a decision, and L0 and L5 are clean", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    expect(lines.filter(needsDecision).map((line) => line.lineId)).toEqual([
      "L1",
      "L2",
      "L3",
      "L4",
      "L6",
      "L7",
    ]);
    expect(needsDecision(lines[0]!)).toBe(false);
    expect(needsDecision(lines[5]!)).toBe(false);
  });

  it("scores exact at 1, alias at 0.95, semantic at the injected similarity, none at 0", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    expect(lines[0]!.matchScore).toBe(1);
    expect(lines[5]!.matchMethod).toBe("alias");
    expect(lines[5]!.matchScore).toBe(0.95);
    expect(lines[5]!.matchedSku).toBe("SKU-5048");
    expect(lines[6]!.matchMethod).toBe("semantic");
    expect(lines[6]!.matchedSku).toBe("SKU-2059");
    expect(lines[6]!.matchScore).toBe(0.88);
    expect(lines[7]!.matchMethod).toBe("none");
    expect(lines[7]!.matchScore).toBe(0);
    expect(lines[7]!.matchedSku).toBeNull();
  });

  it("flags L1 unitPrice with the delta and the money at stake", async () => {
    const [l1] = (await matchInvoice(invoice, standard, mixingBowl)).filter((l) => l.lineId === "L1");
    const price = flagOf(l1!, "unitPrice");
    expect(price?.status).toBe("mismatch");
    expect(price?.documentValue).toBe(72.9);
    expect(price?.standardValue).toBe(68.4);
    expect(price?.reason).toMatch(/72\.90/);
    expect(price?.reason).toMatch(/68\.40/);
    expect(price?.reason).toMatch(/54\.00/);
    expect(price?.reason).toMatch(/12/);
  });

  it("flags L2 uom EA vs CTN", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    const uom = flagOf(lines[2]!, "uom");
    expect(uom?.status).toBe("mismatch");
    expect(uom?.documentValue).toBe("EA");
    expect(uom?.standardValue).toBe("CTN");
  });

  it("flags L3 description Widget Pro 2K vs Pro Series 2000 Controller", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    const description = flagOf(lines[3]!, "description");
    expect(lines[3]!.matchedSku).toBe("SKU-4471");
    expect(description?.status).toBe("mismatch");
    expect(description?.documentValue).toBe("Widget Pro 2K");
    expect(description?.standardValue).toBe("Pro Series 2000 Controller");
  });

  it("flags L4 lineTotal 250 vs 15 x 16 = 240, without re-pricing from list", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    const total = flagOf(lines[4]!, "lineTotal");
    const price = flagOf(lines[4]!, "unitPrice");
    expect(price?.status).toBe("match");
    expect(total?.status).toBe("mismatch");
    expect(total?.documentValue).toBe(250);
    expect(total?.standardValue).toBe(240);
    expect(total?.reason).toMatch(/240/);
    expect(total?.reason).toMatch(/250/);
    expect(flagOf(lines[4]!, "quantity")?.field).toBe("quantity");
  });

  it("treats L5 Sanitiser 5 Litre as a known alias, description match", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    expect(lines[5]!.matchMethod).toBe("alias");
    expect(flagOf(lines[5]!, "description")?.status).toBe("match");
    expect(flagOf(lines[5]!, "sku")?.documentValue).toBeNull();
    expect(flagOf(lines[5]!, "sku")?.standardValue).toBe("SKU-5048");
  });

  it("keeps taxCode informational: match when matched, unmatched when not", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    expect(flagOf(lines[0]!, "taxCode")).toMatchObject({
      documentValue: null,
      standardValue: "SR",
      status: "match",
    });
    expect(flagOf(lines[7]!, "taxCode")).toMatchObject({
      documentValue: null,
      standardValue: null,
      status: "unmatched",
    });
  });

  it("marks every flag unmatched on L7, including taxCode", async () => {
    const lines = await matchInvoice(invoice, standard, mixingBowl);
    expect(lines[7]!.flags.every((flag) => flag.status === "unmatched")).toBe(true);
    expect(lines[7]!.flags.map((flag) => flag.field)).toEqual([
      "sku",
      "description",
      "quantity",
      "unitPrice",
      "uom",
      "lineTotal",
      "taxCode",
    ]);
  });

  it("skips tier 3 when semantic is omitted, so L6 is unmatched", async () => {
    const lines = await matchInvoice(invoice, standard);
    expect(lines[6]!.matchMethod).toBe("none");
    expect(lines[6]!.matchedSku).toBeNull();
  });

  it("does not mutate the catalogue it was handed", async () => {
    const clone = structuredClone(standard);
    await matchInvoice(invoice, standard, mixingBowl);
    expect(standard).toEqual(clone);
  });
});

describe("invoice-b after accepting the document on L3", () => {
  it("hits SKU-4471 via alias, with description match", async () => {
    const taught = structuredClone(standard);
    const product = taught.find((row) => row.sku === "SKU-4471");
    expect(product).toBeDefined();
    product!.aliases = [...product!.aliases, "Widget Pro 2K"];

    const lines = await matchInvoice(invoiceNext, taught);
    const l0 = lines[0]!;
    expect(l0.matchedSku).toBe("SKU-4471");
    expect(l0.matchMethod).toBe("alias");
    expect(flagOf(l0, "description")?.status).toBe("match");
    expect(l0.matchScore).toBe(0.95);
  });
});

describe("0.5% price tolerance", () => {
  it("treats 68.40 vs 68.50 as a match and 72.90 vs 68.40 as a mismatch", () => {
    expect(priceDisagrees(68.5, 68.4)).toBe(false);
    expect(priceDisagrees(72.9, 68.4)).toBe(true);
  });

  it("matches a line billed 68.50 against list 68.40", async () => {
    const oil = standard.find((row) => row.sku === "SKU-1002")!;
    const tiny: ExtractedInvoice = {
      docId: "doc-tol",
      vendor: "test",
      invoiceNumber: "T-1",
      issueDate: "2026-08-21",
      currency: "SGD",
      totals: { subtotal: 68.5, tax: 0, total: 68.5 },
      lineItems: [
        {
          lineId: "L0",
          rawText: "oil",
          sku: "SKU-1002",
          description: oil.canonicalName,
          quantity: 1,
          unitPrice: 68.5,
          lineTotal: 68.5,
          uom: "CTN",
        } satisfies ExtractedLine,
      ],
    };
    const [line] = await matchInvoice(tiny, standard);
    expect(flagOf(line!, "unitPrice")?.status).toBe("match");
  });
});
