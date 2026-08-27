import { describe, expect, it } from "vitest";
import { runIngest } from "./pipeline";
import type { IngestDeps } from "./pipeline";
import invoiceA from "../../fixtures/invoice-a.json";
import invoiceB from "../../fixtures/invoice-b.json";
import { parseExtractedInvoice } from "./schema";

/**
 * The ingest pipeline as ordered steps.
 *
 * Michelle's matcher and Zuriel's session DO are seams here, per the plan's
 * "what you can stub". What is tested is the order, what each step is handed,
 * and that `?demo=1` genuinely never reaches the model.
 */

const params = {
  docId: "doc-abc",
  sessionId: "sess-1",
  r2Key: "documents/doc-abc",
  filename: "invoice-a.pdf",
  demo: false,
};

function deps(overrides: Partial<IngestDeps> = {}) {
  const calls: string[] = [];
  const seeded: any[] = [];
  const base: IngestDeps = {
    async loadDocument(key) {
      calls.push(`load:${key}`);
      return new Blob(["%PDF fake"]);
    },
    async toMarkdown(name) {
      calls.push(`toMarkdown:${name}`);
      return "| Qty | Description | Price |";
    },
    async extract(markdown, docId) {
      calls.push(`extract:${markdown.slice(0, 4)}`);
      return { ...(invoiceA as any), docId };
    },
    async match(invoice) {
      calls.push(`match:${invoice.lineItems.length}`);
      return invoice.lineItems.map((l: any) => ({
        lineId: l.lineId, matchedSku: l.sku, matchMethod: "exact",
        matchScore: 1, flags: [], resolution: "pending",
      }));
    },
    async seedSession(session) {
      calls.push("seed");
      seeded.push(session);
    },
    async markDocument(docId, vendor, status) {
      calls.push(`mark:${status}`);
    },
    demoInvoice: invoiceA as any,
    demoInvoiceB: invoiceB as any,
    ...overrides,
  };
  return { deps: base, calls, seeded };
}

describe("the demo fixture", () => {
  it("conforms to the contract, so ?demo=1 cannot ship a broken shape", () => {
    const result = parseExtractedInvoice(invoiceA);
    expect(result.ok).toBe(true);
  });

  it("conforms for invoice B, so ?demo=2 cannot ship a broken shape", () => {
    const result = parseExtractedInvoice(invoiceB);
    expect(result.ok).toBe(true);
  });
});

describe("runIngest", () => {
  it("runs the steps in order: load, markdown, extract, match, seed", async () => {
    const { deps: d, calls } = deps();
    await runIngest(d, params);
    expect(calls.filter((c) => !c.startsWith("mark:"))).toEqual([
      "load:documents/doc-abc",
      "toMarkdown:invoice-a.pdf",
      "extract:| Qt",
      "match:8",
      "seed",
    ]);
  });

  it("seeds the session with the invoice and the matched lines", async () => {
    const { deps: d, seeded } = deps();
    await runIngest(d, params);
    expect(seeded[0].sessionId).toBe("sess-1");
    expect(seeded[0].docId).toBe("doc-abc");
    expect(seeded[0].invoice.invoiceNumber).toBe("NW-INV-24817");
    expect(seeded[0].lines).toHaveLength(8);
    expect(seeded[0].status).toBe("ready");
  });

  it("stamps our docId onto the seeded invoice, not the fixture's", async () => {
    const { deps: d, seeded } = deps();
    await runIngest(d, params);
    expect(seeded[0].invoice.docId).toBe("doc-abc");
  });

  it("records the vendor on the documents row once extraction knows it", async () => {
    const marked: any[] = [];
    const { deps: d } = deps({
      async markDocument(docId, vendor, status) {
        marked.push({ docId, vendor, status });
      },
    });
    await runIngest(d, params);
    expect(marked.at(-1)).toEqual({
      docId: "doc-abc",
      vendor: "Northwind Trading Pte Ltd",
      status: "ready",
    });
  });

  it("marks the document failed when extraction throws, and rethrows", async () => {
    const marked: string[] = [];
    const { deps: d } = deps({
      async extract() {
        throw new Error("extraction failed after one repair retry");
      },
      async markDocument(_docId, _vendor, status) {
        marked.push(status);
      },
    });
    // Rethrown so the Workflow step fails and can be resumed from here rather
    // than from the upload.
    await expect(runIngest(d, params)).rejects.toThrow(/repair retry/);
    expect(marked).toContain("failed");
  });

  describe("demo mode", () => {
    const demoParams = { ...params, demo: true };

    it("never touches the model", async () => {
      const { deps: d, calls } = deps();
      await runIngest(d, demoParams);
      expect(calls).not.toContain("toMarkdown:invoice-a.pdf");
      expect(calls.some((c) => c.startsWith("extract:"))).toBe(false);
    });

    it("still matches and still seeds a ready session", async () => {
      const { deps: d, seeded } = deps();
      await runIngest(d, demoParams);
      expect(seeded[0].lines).toHaveLength(8);
      expect(seeded[0].status).toBe("ready");
    });

    it("seeds invoice B when fixture is b, still without the model", async () => {
      const { deps: d, calls, seeded } = deps();
      await runIngest(d, { ...demoParams, fixture: "b" });
      expect(calls.some((c) => c.startsWith("toMarkdown:"))).toBe(false);
      expect(calls.some((c) => c.startsWith("extract:"))).toBe(false);
      expect(seeded[0].invoice.invoiceNumber).toBe("NW-INV-24902");
      expect(seeded[0].invoice.vendor).toBe("Northwind Trading Pte Ltd");
      expect(seeded[0].invoice.lineItems).toHaveLength(4);
      expect(seeded[0].lines).toHaveLength(4);
    });
  });
});
