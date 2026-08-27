/**
 * The corrected invoice, as a page.
 *
 * `renderInvoice` is pure and synchronous: data in, HTML string out. No env, no
 * fetch, no binding. It runs under plain node in milliseconds, so the visual
 * loop is a browser refresh rather than a Worker restart, and it is trivially
 * testable. The hash is computed by the caller and passed in, which is what
 * keeps this function synchronous even though `crypto.subtle` is not.
 *
 * Every interpolated value is escaped without exception. These values came out
 * of a supplier's PDF via a language model. They will contain ampersands and
 * angle brackets eventually, and an unescaped one either breaks the layout on
 * stage or silently swallows a price.
 */

import type { ExtractedLine } from "../../shared/contracts.ts";
import { money, toCents, type CorrectedInvoice, type CorrectedLine } from "./correct.ts";
import { STYLES } from "./styles.ts";

export type RenderMeta = {
  generatedAt: string;
  /** Full hex digest. The page shows a short prefix and carries the rest. */
  contentHash: string;
  dataSource: "live" | "fixture";
  /** Why we are on the fixture, when we are. */
  sourceNote?: string;
};

/** The only interpolation primitive in this file. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LABELS: Record<string, string> = {
  sku: "SKU",
  description: "Description",
  quantity: "Quantity",
  unitPrice: "Unit price",
  uom: "Unit of measure",
  lineTotal: "Line total",
  taxCode: "Tax code",
};

const MONEY_FIELDS = new Set(["unitPrice", "lineTotal"]);

/** Format a field value for display, so money reads as money and absent reads as absent. */
function fmt(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "not stated";
  if (MONEY_FIELDS.has(field) && typeof value === "number") return money(toCents(value));
  return String(value);
}

const MATCH_NOTE: Record<CorrectedLine["matchMethod"], string> = {
  exact: "Matched on SKU",
  alias: "Matched on a known vendor alias",
  semantic: "Matched by description similarity",
  none: "No match found",
};

function statusTag(line: CorrectedLine): string {
  if (line.unresolved) return `<span class="tag open">Needs review</span>`;
  if (line.changes.length > 0) return `<span class="tag corrected">Corrected</span>`;
  if (line.standardUpdated) return `<span class="tag learned">Price list updated</span>`;
  return `<span class="tag clean">As invoiced</span>`;
}

/** A cell that shows the corrected value, with the supplier's original beneath it. */
function cell(line: CorrectedLine, field: keyof ExtractedLine, cls = ""): string {
  const change = line.changes.find((c) => c.field === field);
  const now = fmt(field, line.corrected[field]);
  if (!change) return `<td class="${cls}">${esc(now)}</td>`;
  return `<td class="${cls}">${esc(now)}<span class="was">was <s>${esc(fmt(field, change.from))}</s></span></td>`;
}

/**
 * The SKU column.
 *
 * A line the supplier sent without a SKU may still have been matched, by alias
 * or by description similarity. Printing "not stated" there hides a fact we
 * hold. Printing it as though the supplier stated it claims a decision nobody
 * made. So it is shown, marked as ours rather than theirs.
 */
function skuCell(line: CorrectedLine): string {
  const stated = line.corrected.sku;
  if (stated) return cell(line, "sku", "sku");
  if (line.matchedSku) {
    return `<td class="sku">${esc(line.matchedSku)}<span class="was">matched, not on the invoice</span></td>`;
  }
  return cell(line, "sku", "sku");
}

function linesTable(doc: CorrectedInvoice): string {
  const rows = doc.lines.map((line) => {
    const cls = line.unresolved ? "open" : line.changes.length > 0 ? "changed" : "";
    return `<tr class="${cls}">
        ${skuCell(line)}
        <td class="desc">${esc(line.corrected.description)}${
          line.changes.some((c) => c.field === "description")
            ? `<span class="was">was <s>${esc(line.original.description)}</s></span>`
            : ""
        }<span class="raw">${esc(line.original.rawText)} &middot; ${esc(MATCH_NOTE[line.matchMethod])}${
          line.matchMethod === "semantic" ? ` (${esc(line.matchScore.toFixed(2))})` : ""
        }</span></td>
        ${cell(line, "quantity", "num")}
        ${cell(line, "uom")}
        ${cell(line, "unitPrice", "num")}
        ${cell(line, "lineTotal", "num")}
        <td>${statusTag(line)}</td>
      </tr>`;
  }).join("");

  return `<table class="lines">
      <thead><tr>
        <th>SKU</th><th>Description</th><th class="num">Qty</th>
        <th>UoM</th><th class="num">Unit price</th><th class="num">Line total</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function totalsBlock(doc: CorrectedInvoice): string {
  const cur = esc(doc.currency);
  const row = (label: string, before: number, after: number, grand = false) => {
    const moved = before !== after;
    return `<tr class="${grand ? "grand" : ""}">
        <td class="lbl">${esc(label)}</td>
        <td class="num">${moved ? `<span class="prev">${cur} ${money(before)}</span>` : ""}${cur} ${money(after)}</td>
      </tr>`;
  };
  const taxPct = (doc.taxRate * 100).toFixed(taxDecimals(doc.taxRate));
  return `<table class="totals">
      ${row("Subtotal", doc.originalSubtotal, doc.correctedSubtotal)}
      ${row(`Tax at ${esc(taxPct)}%`, doc.originalTax, doc.correctedTax)}
      ${row("Total payable", doc.originalTotal, doc.correctedTotal, true)}
    </table>`;
}

/** Show 9% as "9", not "9.00", but keep precision for an odd rate. */
function taxDecimals(rate: number): number {
  const pct = rate * 100;
  return Math.abs(pct - Math.round(pct)) < 1e-9 ? 0 : 2;
}

function correctionsTable(doc: CorrectedInvoice): string {
  const rows = doc.lines.flatMap((line) =>
    line.changes.map((c) => `<tr>
        <td class="sku">${esc(line.lineId)}</td>
        <td>${esc(LABELS[c.field] ?? c.field)}</td>
        <td class="mv"><s>${esc(fmt(c.field, c.from))}</s> &rarr; <b>${esc(fmt(c.field, c.to))}</b></td>
        <td class="why">${esc(c.reason)}</td>
      </tr>`),
  ).join("");

  if (!rows) {
    return `<div class="empty">
        <h3>No corrections were applied</h3>
        <p>Every line on this invoice matched the price list, so the amounts below are
        exactly as the supplier stated them.</p>
      </div>`;
  }

  return `<table class="corr">
      <thead><tr><th>Line</th><th>Field</th><th>Change</th><th>Why</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function headline(doc: CorrectedInvoice): string {
  const delta = doc.correctedTotal - doc.originalTotal;
  const cur = esc(doc.currency);
  if (delta === 0) {
    return `<div class="headline">
        <dl class="fig"><dt>Total payable</dt><dd>${cur} ${money(doc.correctedTotal)}</dd>
        <small>Unchanged. Nothing on this invoice moved the amount.</small></dl>
      </div>`;
  }
  const overstated = delta < 0;
  return `<div class="headline">
      <dl class="fig was"><dt>As invoiced</dt><dd>${cur} ${money(doc.originalTotal)}</dd></dl>
      <dl class="fig now"><dt>As corrected</dt><dd>${cur} ${money(doc.correctedTotal)}</dd></dl>
      <dl class="fig delta ${overstated ? "" : "up"}"><dt>Difference</dt>
        <dd>${money(delta)}</dd>
        <small>${overstated ? "Invoice overstated by" : "Invoice understated by"} ${cur} ${money(Math.abs(delta))}
        across ${esc(doc.changedLineCount)} ${doc.changedLineCount === 1 ? "line" : "lines"}.</small>
      </dl>
    </div>`;
}

export function renderInvoice(doc: CorrectedInvoice, meta: RenderMeta): string {
  const isFixture = meta.dataSource === "fixture";
  const shortHash = meta.contentHash.slice(0, 12);

  const banner = isFixture
    ? `<div class="sample">
        <b>Sample data</b>
        <span>This invoice was rendered from a checked-in fixture, not from a live review
        session. The figures below are illustrative and must not be sent to a supplier.${
          meta.sourceNote ? ` ${esc(meta.sourceNote)}` : ""
        }</span>
      </div>`
    : "";

  const unresolved = doc.unresolvedCount > 0
    ? `<div class="warn"><b>${esc(doc.unresolvedCount)} ${
        doc.unresolvedCount === 1 ? "line still carries an unresolved flag" : "lines still carry unresolved flags"
      }.</b> Those lines are shown exactly as the supplier invoiced them and are highlighted below.
      This invoice is not final until they are decided.</div>`
    : "";

  const learned = doc.standardUpdatedCount > 0
    ? `<p style="margin-top:var(--s-3);color:var(--ink-3);font-size:var(--t-2xs)">
        ${esc(doc.standardUpdatedCount)} further ${doc.standardUpdatedCount === 1 ? "line was" : "lines were"}
        reviewed and found correct as invoiced. The price list was updated to match, so the next
        invoice from this supplier will not raise them.</p>`
    : "";

  const empty = doc.lines.length === 0
    ? `<div class="empty">
        <h3>This invoice has no lines</h3>
        <p>The review session exists but carries no line items. Nothing has been extracted yet,
        or extraction produced an empty document.</p>
      </div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Corrected invoice ${esc(doc.invoiceNumber)} &middot; ${esc(doc.vendor)}</title>
<meta name="x-content-hash" content="${esc(meta.contentHash)}">
<meta name="x-session-id" content="${esc(doc.sessionId)}">
<meta name="x-data-source" content="${esc(meta.dataSource)}">
<style>${STYLES}</style>
</head>
<body>
<div class="wrap"><div class="sheet">
${banner}
<div class="pad">

  <header class="masthead">
    <div class="issuer">Rectify<p>Invoice reconciliation against a standard that learns</p></div>
    <div class="docid">
      <div class="doctype">Corrected invoice</div>
      <div class="docno">${esc(doc.invoiceNumber)}</div>
    </div>
  </header>

  <dl class="meta">
    <div><dt>Supplier</dt><dd>${esc(doc.vendor)}</dd></div>
    <div><dt>Issued</dt><dd>${esc(doc.issueDate)}</dd></div>
    <div><dt>Currency</dt><dd>${esc(doc.currency)}</dd></div>
    <div><dt>Lines</dt><dd>${esc(doc.lines.length)}</dd></div>
  </dl>

  <div class="stamp">
    <span class="chip"><b>Session</b><code>${esc(doc.sessionId)}</code></span>
    <span class="chip"><b>Content</b><code>${esc(shortHash)}</code></span>
    <span class="chip"><b>Generated</b><code>${esc(meta.generatedAt)}</code></span>
    <span class="chip${isFixture ? " fixture" : ""}"><b>Source</b><code>${
      isFixture ? "fixture" : "live session"
    }</code></span>
  </div>

  ${empty || headline(doc)}
  ${unresolved}

  ${doc.lines.length === 0 ? "" : `<section class="sec">
    <h2>Invoice lines</h2>
    ${linesTable(doc)}
    ${totalsBlock(doc)}
    <div class="legend">
      <span><i class="swatch" style="background:var(--incoming)"></i> Corrected by a reviewer</span>
      <span><i class="swatch" style="background:var(--pending)"></i> Unresolved flag</span>
      <span>Struck values are what the supplier invoiced.</span>
    </div>
  </section>

  <section class="sec">
    <h2>Corrections applied</h2>
    ${correctionsTable(doc)}
    ${learned}
  </section>`}

  <footer class="foot">
    <span>Corrected against the Rectify price list. Lines without a mark are as the supplier invoiced them.</span>
    <span>SHA-256 <code>${esc(meta.contentHash)}</code></span>
  </footer>

</div>
</div></div>
</body>
</html>`;
}
