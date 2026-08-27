/**
 * Pure match + diff. No D1, no Vectorize, no KV.
 *
 * Semantic lookup is injected so a test can fake Vectorize without standing
 * one up. Omit it and tier 3 is skipped — exact and alias still carry the demo.
 */

import type {
  ExtractedInvoice,
  ExtractedLine,
  LineReview,
  StandardProduct,
} from "../shared/contracts.ts";
import { diffMatchedLine, unmatchedFlags } from "./diff.ts";
import { SEMANTIC_FLOOR } from "./keys.ts";
import { normalize } from "./normalize.ts";

export type SemanticLookup = (
  description: string,
) => Promise<{ sku: string; score: number } | null>;

type CatalogueIndex = {
  bySku: Map<string, StandardProduct>;
  byAlias: Map<string, StandardProduct>;
};

function indexCatalogue(standard: StandardProduct[]): CatalogueIndex {
  const bySku = new Map<string, StandardProduct>();
  const byAlias = new Map<string, StandardProduct>();
  for (const product of standard) {
    bySku.set(product.sku, product);
    for (const alias of product.aliases) {
      const key = normalize(alias);
      if (key && !byAlias.has(key)) byAlias.set(key, product);
    }
  }
  return { bySku, byAlias };
}

export async function matchInvoice(
  invoice: ExtractedInvoice,
  standard: StandardProduct[],
  semantic?: SemanticLookup,
): Promise<LineReview[]> {
  const index = indexCatalogue(standard);
  const lines: LineReview[] = [];
  for (const item of invoice.lineItems) {
    lines.push(await reviewLine(item, index, semantic));
  }
  return lines;
}

async function reviewLine(
  line: ExtractedLine,
  index: CatalogueIndex,
  semantic: SemanticLookup | undefined,
): Promise<LineReview> {
  const hit = await matchLine(line, index, semantic);
  if (!hit) {
    return {
      lineId: line.lineId,
      matchedSku: null,
      matchMethod: "none",
      matchScore: 0,
      flags: unmatchedFlags(line),
      resolution: "pending",
    };
  }
  return {
    lineId: line.lineId,
    matchedSku: hit.product.sku,
    matchMethod: hit.method,
    matchScore: hit.score,
    flags: diffMatchedLine(line, hit.product, hit.method, hit.score),
    resolution: "pending",
  };
}

async function matchLine(
  line: ExtractedLine,
  index: CatalogueIndex,
  semantic: SemanticLookup | undefined,
): Promise<
  { product: StandardProduct; method: "exact" | "alias" | "semantic"; score: number } | null
> {
  if (line.sku) {
    const exact = index.bySku.get(line.sku);
    if (exact) return { product: exact, method: "exact", score: 1 };
  }

  const aliasKey = normalize(line.description);
  if (aliasKey) {
    const aliased = index.byAlias.get(aliasKey);
    if (aliased) return { product: aliased, method: "alias", score: 0.95 };
  }

  if (!semantic) return null;
  const hit = await semantic(line.description);
  if (!hit || hit.score < SEMANTIC_FLOOR) return null;
  const product = index.bySku.get(hit.sku);
  if (!product) return null;
  return { product, method: "semantic", score: hit.score };
}
