#!/usr/bin/env node
/** Minimal one-page PDFs so Bryan has something to extract from. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const invoiceA = [
  "APEX COMPONENTS PTE LTD",
  "Invoice INV-1042    2026-08-20    SGD",
  "",
  "SKU-1001  Hex Bolt M8 x 20                 100  ea     0.35     35.00",
  "SKU-1104  HDMI Cable 2 m                    10  ea     9.50     95.00",
  "         Widget Pro 2K                       4  ea    12.50     50.00",
  "SKU-2208  Nitrile Examination Gloves         6  case  24.00    144.00",
  "SKU-3301  PTFE Thread Seal Tape              5  ea     2.00     12.00",
  "SKU-1105  USB-C Cable 1 m                   20  ea     6.50    130.00",
  "",
  "Subtotal  466.00",
  "GST 9%     41.94",
  "Total     507.94",
];

const invoiceB = [
  "APEX COMPONENTS PTE LTD",
  "Invoice INV-1088    2026-08-27    SGD",
  "",
  "SKU-1001  Hex Bolt M8 x 20                  40  ea     0.35     14.00",
  "         Widget Pro 2K                       2  ea    12.50     25.00",
  "SKU-1105  USB-C Cable 1 m                   10  ea     6.50     65.00",
  "",
  "Subtotal  104.00",
  "GST 9%      9.36",
  "Total     113.36",
];

writeFileSync(join(root, "fixtures/invoice-a.pdf"), buildPdf(invoiceA));
writeFileSync(join(root, "fixtures/invoice-b.pdf"), buildPdf(invoiceB));
console.log("wrote fixtures/invoice-a.pdf and fixtures/invoice-b.pdf");

function buildPdf(lines) {
  const escaped = lines.map((line) => line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"));
  const ops = ["BT", "/F1 11 Tf", "50 760 Td", "14 TL"];
  for (const [i, line] of escaped.entries()) {
    ops.push(i === 0 ? `(${line}) Tj` : `T* (${line}) Tj`);
  }
  ops.push("ET");
  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  let xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    xrefTable += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += xrefTable;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}
