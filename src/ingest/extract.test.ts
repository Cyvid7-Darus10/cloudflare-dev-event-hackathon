import { describe, expect, it } from "vitest";
import {
  AI_RUN_URL,
  EXTRACTION_MODEL,
  GATEWAY_ID,
  documentToMarkdown,
  extractInvoice,
} from "./extract";
import type { AiLike, ChatTransport } from "./extract";

/**
 * Extraction is the risk in this workstream, and malformed JSON is the single
 * most likely failure in the project. These tests pin the repair retry, the
 * refusal to invent a SKU, and the AI Gateway routing.
 *
 * The transport double answers in the `/ai/run` envelope (`{ result, success }`)
 * that the REST endpoint returns, because a double that lies proves nothing.
 */

interface Call {
  url: string;
  body: any;
  headers: Record<string, string>;
}

const TOKEN = "test-token";

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
  docId: "will-be-overwritten",
  vendor: "Northwind Trading Pte Ltd",
  invoiceNumber: "INV-2026-0912",
  issueDate: "2026-08-27",
  currency: "SGD",
  lineItems: [line],
  totals: { subtotal: 85, tax: 7.65, total: 92.65 },
};

function fakeAi(opts: { markdown?: string }): AiLike {
  return {
    async toMarkdown(file) {
      if (opts.markdown === undefined) {
        return { id: "1", name: file.name, mimeType: "application/pdf", format: "error", error: "unsupported file" };
      }
      return {
        id: "1", name: file.name, mimeType: "application/pdf",
        format: "markdown", tokens: 10, data: opts.markdown,
      };
    },
  };
}

/** `replies` is consumed one per call, so a test can make the first answer bad. */
function fakeGateway(replies: unknown[], calls: Call[] = [], envelope = "response"): ChatTransport {
  const queue = [...replies];
  return {
    apiToken: TOKEN,
    async fetch(url, init) {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        headers: init?.headers as Record<string, string>,
      });
      const content = queue.shift();
      const text = typeof content === "string" ? content : JSON.stringify(content);
      const result = envelope === "response" ? { response: text } : { output: text };
      return Response.json({ success: true, errors: [], result });
    },
  };
}

describe("documentToMarkdown", () => {
  it("returns the converted markdown", async () => {
    const ai = fakeAi({ markdown: "| Qty | Description |\n| 2 | Rapeseed Oil |" });
    await expect(documentToMarkdown(ai, "invoice-a.pdf", new Blob(["x"]))).resolves.toContain("Rapeseed");
  });

  it("throws when conversion fails rather than extracting from an empty string", async () => {
    // An empty document extracts to zero lines and looks like a blank invoice,
    // which is a silent failure the reviewer would never catch.
    await expect(
      documentToMarkdown(fakeAi({}), "invoice-a.pdf", new Blob(["x"])),
    ).rejects.toThrow(/unsupported file/);
  });
});

describe("extractInvoice", () => {
  const args = { markdown: "MARKDOWN BODY MARKER", docId: "doc-abc" };

  it("returns a conforming invoice when the model behaves", async () => {
    const result = await extractInvoice(fakeGateway([invoice]), args);
    expect(result.lineItems[0].unitPrice).toBe(42.5);
  });

  it("stamps our docId rather than trusting the model's", async () => {
    const result = await extractInvoice(fakeGateway([invoice]), args);
    expect(result.docId).toBe("doc-abc");
  });

  it("reads the answer when the endpoint returns it under result.output", async () => {
    // The envelope key varies by model family; both are the same answer.
    const result = await extractInvoice(fakeGateway([invoice], [], "output"), args);
    expect(result.invoiceNumber).toBe("INV-2026-0912");
  });

  it("parses a response the model wrapped in a markdown code fence", async () => {
    // Small models do this constantly, even in JSON mode.
    const fenced = "```json\n" + JSON.stringify(invoice) + "\n```";
    const result = await extractInvoice(fakeGateway([fenced]), args);
    expect(result.invoiceNumber).toBe("INV-2026-0912");
  });

  it("keeps a null sku rather than letting the model invent one", async () => {
    const withNull = { ...invoice, lineItems: [{ ...line, sku: null }] };
    const result = await extractInvoice(fakeGateway([withNull]), args);
    expect(result.lineItems[0].sku).toBeNull();
  });

  it("repairs once when the first reply is invalid, and succeeds", async () => {
    const calls: Call[] = [];
    const bad = { ...invoice, lineItems: [{ ...line, unitPrice: "42.50" }] };
    const result = await extractInvoice(fakeGateway([bad, invoice], calls), args);
    expect(result.lineItems[0].unitPrice).toBe(42.5);
    expect(calls).toHaveLength(2);
  });

  it("tells the repair attempt what was wrong with the first", async () => {
    const calls: Call[] = [];
    const bad = { ...invoice, lineItems: [{ ...line, unitPrice: "42.50" }] };
    await extractInvoice(fakeGateway([bad, invoice], calls), args);
    expect(JSON.stringify(calls[1].body.input.messages)).toMatch(/unitPrice/);
  });

  it("throws after exactly one repair retry, so the Workflow step can resume", async () => {
    const calls: Call[] = [];
    const bad = { ...invoice, lineItems: [{ ...line, unitPrice: "42.50" }] };
    await expect(extractInvoice(fakeGateway([bad, bad], calls), args)).rejects.toThrow(/unitPrice/);
    expect(calls).toHaveLength(2);
  });

  it("throws when the model returns prose both times", async () => {
    await expect(
      extractInvoice(fakeGateway(["Sure! Here is the invoice:", "Sorry, here it is:"]), args),
    ).rejects.toThrow(/JSON/i);
  });

  it("throws when the endpoint itself fails, rather than parsing an error body", async () => {
    const transport: ChatTransport = {
      apiToken: TOKEN,
      async fetch() {
        return Response.json({ success: false, errors: [{ message: "model not found" }] }, { status: 404 });
      },
    };
    await expect(extractInvoice(transport, args)).rejects.toThrow(/model not found/);
  });

  it("routes through AI Gateway, authenticated", async () => {
    // Caching and the token dashboard are the point, not a nice-to-have.
    const calls: Call[] = [];
    await extractInvoice(fakeGateway([invoice], calls), args);
    expect(calls[0].url).toBe(AI_RUN_URL);
    expect(calls[0].headers["cf-aig-gateway-id"]).toBe(GATEWAY_ID);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("asks for JSON mode, and sends the model the document", async () => {
    const calls: Call[] = [];
    await extractInvoice(fakeGateway([invoice], calls), args);
    expect(calls[0].body.model).toBe(EXTRACTION_MODEL);
    expect(calls[0].body.input.response_format.type).toBe("json_schema");
    expect(JSON.stringify(calls[0].body.input.messages)).toContain("MARKDOWN BODY MARKER");
  });
});
