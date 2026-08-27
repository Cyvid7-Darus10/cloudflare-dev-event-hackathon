/**
 * Workers AI embeddings for Vectorize. Shared by the live matcher (seed +
 * query) and write-back (upsert the SKU that just changed).
 */

import type { StandardProduct } from "../shared/contracts.ts";
import { EMBEDDING_MODEL } from "./keys.ts";

const EMBED_BATCH = 20;
const UPSERT_BATCH = 20;

/**
 * Workers AI returns `{ data: number[][] }` for bge. Other shapes show up in
 * the wild; we accept them rather than treat a live match as unmatched.
 */
export function embeddingVectors(result: unknown): number[][] {
  if (!result || typeof result !== "object") {
    throw new Error("Workers AI embedding returned a non-object");
  }
  const data = (result as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Workers AI embedding returned no data[] vectors");
  }
  if (typeof data[0] === "number") return [data as number[]];
  if (Array.isArray(data[0])) return data as number[][];
  const first = data[0] as { embedding?: unknown } | null;
  if (first && Array.isArray(first.embedding)) {
    return (data as { embedding: number[] }[]).map((row) => row.embedding);
  }
  throw new Error("Workers AI embedding data[0] was not a vector");
}

export async function embedTexts(env: Pick<Env, "AI">, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const group of chunk(texts, EMBED_BATCH)) {
    const result: unknown = await env.AI.run(EMBEDDING_MODEL, { text: group });
    const batch = embeddingVectors(result);
    if (batch.length !== group.length) {
      throw new Error(`embedded ${batch.length} vectors for ${group.length} texts`);
    }
    vectors.push(...batch);
  }
  return vectors;
}

export async function seedCatalogueEmbeddings(
  env: Pick<Env, "AI" | "PRODUCTS">,
  products: StandardProduct[],
): Promise<void> {
  if (products.length === 0) return;
  const vectors = await embedTexts(env, products.map((product) => product.canonicalName));
  const rows = products.map((product, i) => ({
    id: product.sku,
    values: vectors[i]!,
    metadata: { sku: product.sku },
  }));
  for (const group of chunk(rows, UPSERT_BATCH)) {
    await env.PRODUCTS.upsert(group);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
