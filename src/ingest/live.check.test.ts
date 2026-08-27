import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { extractInvoice } from "./extract";

/**
 * A live check against the real gateway. Opt-in: set CF_TOKEN to run it.
 *
 * `05-platform.md` is blunt about this — verify over the wire, not by
 * typecheck. Everything else in this suite proves the code; only this proves
 * the model.
 */

const TOKEN = (env as unknown as { CF_TOKEN?: string }).CF_TOKEN ?? "";
const run = TOKEN ? describe : describe.skip;

const MARKDOWN = `
# TAX INVOICE

Northwind Trading Pte Ltd
Invoice No: NW-INV-24817
Date: 21 August 2026
Currency: SGD

| Code     | Description                   | Qty | UOM | Unit Price | Amount   |
|----------|-------------------------------|-----|-----|------------|----------|
| SKU-2027 | Enamel mug 350ml              | 24  | EA  | 11.20      | 268.80   |
| SKU-1002 | Cold-pressed rapeseed oil 5L  | 12  | CTN | 72.90      | 874.80   |
| SKU-3038 | Paper straws 200mm            | 40  | EA  | 31.00      | 1,240.00 |
|          | Widget Pro 2K                 | 2   | EA  | 289.00     | 578.00   |

Subtotal: 2,961.60
Tax (9%): 266.54
Total: 3,228.14
`;

const CANDIDATES = [
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/openai/gpt-oss-120b",
  "@cf/openai/gpt-oss-20b",
  "@cf/qwen/qwen2.5-coder-32b-instruct",
];

run("extraction against the real gateway", () => {
  for (const model of CANDIDATES) {
    it(
      `${model} returns a conforming invoice`,
      async () => {
        const invoice = await extractInvoice(
          { fetch: globalThis.fetch.bind(globalThis), apiToken: TOKEN, model },
          { markdown: MARKDOWN, docId: "live-check-001" },
        );

        console.log(
          `\n${model}\n  vendor=${invoice.vendor}\n  invoiceNumber=${invoice.invoiceNumber}` +
            `\n  currency=${invoice.currency} issueDate=${invoice.issueDate}` +
            `\n  totals=${JSON.stringify(invoice.totals)}\n` +
            invoice.lineItems
              .map(
                (l) =>
                  `  ${l.lineId} sku=${JSON.stringify(l.sku)} qty=${l.quantity} ` +
                  `unit=${l.unitPrice} total=${l.lineTotal} uom=${JSON.stringify(l.uom)} | ${l.description}`,
              )
              .join("\n"),
        );

        expect(invoice.docId).toBe("live-check-001");
        expect(invoice.lineItems.length).toBe(4);
        // The fourth line has no code in the document. Inventing one here is
        // the failure mode that matters most.
        expect(invoice.lineItems[3].sku).toBeNull();
      },
      120_000,
    );
  }
});
