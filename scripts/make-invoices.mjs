/**
 * Build the demo invoice PDFs from the JSON fixtures.
 *
 * The two must agree. `?demo=1` seeds a session straight from
 * `fixtures/invoice-a.json`, while the real path uploads
 * `fixtures/invoice-a.pdf` and extracts it. If they describe different
 * invoices, the escape hatch shows a different document from the live run and
 * the demo contradicts itself on stage.
 *
 * The vendor's own wording is deliberate. Invoice A bills SKU-4471 as
 * "Widget Pro 2K" where the standard calls it "Pro Series 2000 Controller";
 * accepting that teaches the alias. Invoice B then bills the same product with
 * no SKU at all, so it only matches if the alias was learned. That is the
 * payoff, and it only works if both documents keep the odd name.
 *
 *   node scripts/make-invoices.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const money = (n) =>
  n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function html(inv) {
  const rows = inv.lineItems
    .map(
      (l) => `
      <tr>
        <td class="sku">${l.sku ?? ""}</td>
        <td>${l.description}</td>
        <td class="n">${l.quantity}</td>
        <td class="u">${l.uom ?? ""}</td>
        <td class="n">${money(l.unitPrice)}</td>
        <td class="n">${money(l.lineTotal)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 10.5pt/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #111; padding-bottom: 10px; }
  .vendor { font-size: 15pt; font-weight: 700; letter-spacing: -.2px; }
  .vendor small { display: block; font-size: 8.5pt; font-weight: 400; color: #555;
                  letter-spacing: 0; margin-top: 3px; }
  .doc { text-align: right; font-size: 9pt; }
  .doc b { font-size: 12pt; display: block; margin-bottom: 3px; }
  .to { margin: 16px 0 18px; font-size: 9pt; color: #333; }
  .to b { display: block; color: #111; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { text-align: left; font-size: 7.5pt; letter-spacing: .8px; text-transform: uppercase;
       color: #666; border-bottom: 1px solid #999; padding: 0 6px 5px 0; font-weight: 600; }
  td { padding: 6px 6px 6px 0; border-bottom: 1px solid #e4e4e4; vertical-align: top; }
  td.n, th.n { text-align: right; }
  td.sku, td.u { font-family: "SF Mono", Menlo, monospace; font-size: 8.5pt; color: #444; }
  .totals { margin-top: 14px; margin-left: auto; width: 46%; font-size: 9.5pt; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { border-top: 1.5px solid #111; margin-top: 5px; padding-top: 6px;
                   font-weight: 700; font-size: 11pt; }
  .terms { margin-top: 26px; font-size: 8pt; color: #666; border-top: 1px solid #ddd;
           padding-top: 8px; }
</style></head><body>
  <div class="head">
    <div class="vendor">${inv.vendor}
      <small>18 Tuas Basin Link, Singapore 638775 &nbsp;·&nbsp; GST Reg 20-1188-4471-K</small>
    </div>
    <div class="doc">
      <b>TAX INVOICE</b>
      ${inv.invoiceNumber}<br>Date ${inv.issueDate}<br>Currency ${inv.currency}
    </div>
  </div>

  <div class="to"><b>Bill to</b>Rectify Operations Pte Ltd<br>
    71 Ayer Rajah Crescent, Singapore 139951</div>

  <table>
    <thead><tr>
      <th>Item</th><th>Description</th><th class="n">Qty</th><th>UoM</th>
      <th class="n">Unit</th><th class="n">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(inv.totals.subtotal)}</span></div>
    <div><span>GST 9%</span><span>${money(inv.totals.tax)}</span></div>
    <div class="grand"><span>Total ${inv.currency}</span><span>${money(inv.totals.total)}</span></div>
  </div>

  <p class="terms">Payment due 30 days from invoice date. Please quote
  ${inv.invoiceNumber} on remittance. Goods remain the property of
  ${inv.vendor} until paid in full.</p>
</body></html>`;
}

const tmp = mkdtempSync(join(tmpdir(), "rectify-"));

for (const name of ["invoice-a", "invoice-b"]) {
  const inv = JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8"));
  const page = join(tmp, `${name}.html`);
  writeFileSync(page, html(inv));

  execFileSync(CHROME, [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${process.cwd()}/fixtures/${name}.pdf`,
    `file://${page}`,
  ]);

  console.log(`  ${name}.pdf  ${inv.vendor}  ${inv.invoiceNumber}  ${inv.lineItems.length} lines`);
}
