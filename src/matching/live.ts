/**
 * Live matching path: KV snapshot, D1 fallback, Vectorize semantic.
 *
 * Embeddings are seeded once (KV flag) so the first invoice does not pay
 * for 40 silent product names on the critical path twice.
 */

import { listStandard } from "../platform/catalogue.ts";
import type { ExtractedInvoice, LineReview, StandardProduct } from "../shared/contracts.ts";
import { embedTexts, seedCatalogueEmbeddings } from "./embeddings.ts";
import { SEMANTIC_FLOOR, SNAPSHOT_KEY, VECTORIZE_SEEDED_KEY } from "./keys.ts";
import { matchInvoice } from "./match.ts";

export { seedCatalogueEmbeddings };

export async function matchInvoiceLive(invoice: ExtractedInvoice, env: Env): Promise<LineReview[]> {
  const products = await loadStandard(env);

  if (!(await env.STANDARD_KV.get(VECTORIZE_SEEDED_KEY))) {
    try {
      await seedCatalogueEmbeddings(env, products);
      await env.STANDARD_KV.put(VECTORIZE_SEEDED_KEY, "1");
    } catch (cause) {
      // Exact and alias still work. Do not set the flag so the next invoice retries.
      console.error("vectorize seed failed", cause);
    }
  }

  return matchInvoice(invoice, products, (description) => semanticLookup(env, products, description));
}

async function loadStandard(env: Env): Promise<StandardProduct[]> {
  const cached = await env.STANDARD_KV.get<StandardProduct[]>(SNAPSHOT_KEY, "json");
  if (Array.isArray(cached) && cached.length > 0) return cached;
  const products = await listStandard(env.DB);
  await env.STANDARD_KV.put(SNAPSHOT_KEY, JSON.stringify(products));
  return products;
}

async function semanticLookup(
  env: Env,
  products: StandardProduct[],
  description: string,
): Promise<{ sku: string; score: number } | null> {
  try {
    const [vector] = await embedTexts(env, [description]);
    if (!vector) return null;
    const result = await env.PRODUCTS.query(vector, { topK: 1 });
    const hit = result.matches[0];
    if (!hit || hit.score < SEMANTIC_FLOOR) return null;
    if (!products.some((product) => product.sku === hit.id)) return null;
    return { sku: hit.id, score: hit.score };
  } catch (cause) {
    console.error("semantic lookup failed", cause);
    return null;
  }
}
