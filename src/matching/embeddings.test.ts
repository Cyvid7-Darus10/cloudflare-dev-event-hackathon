import { describe, expect, it } from "vitest";
import invoiceA from "../../fixtures/invoice-a.json";
import standardFixture from "../../fixtures/standard.json";
import type { ExtractedInvoice, StandardProduct } from "../shared/contracts.ts";
import { embeddingVectors, seedCatalogueEmbeddings } from "./embeddings.ts";
import { SNAPSHOT_KEY, VECTORIZE_SEEDED_KEY } from "./keys.ts";
import { matchInvoiceLive } from "./live.ts";

const invoice = invoiceA as ExtractedInvoice;
const standard = standardFixture as StandardProduct[];

describe("seedCatalogueEmbeddings", () => {
  it("embeds canonical names and upserts Vectorize rows keyed by sku", async () => {
    const upserts: Array<{ id: string; metadata?: { sku: string } }> = [];
    const texts: string[] = [];
    const env = {
      AI: {
        async run(_model: string, input: { text: string[] }) {
          texts.push(...input.text);
          return { shape: [input.text.length, 2], data: input.text.map(() => [0.1, 0.2]) };
        },
      },
      PRODUCTS: {
        async upsert(rows: Array<{ id: string; metadata?: { sku: string } }>) {
          upserts.push(...rows);
        },
      },
    } as unknown as Env;

    await seedCatalogueEmbeddings(env, standard.slice(0, 2));
    expect(texts).toEqual([standard[0]!.canonicalName, standard[1]!.canonicalName]);
    expect(upserts.map((row) => row.id)).toEqual([standard[0]!.sku, standard[1]!.sku]);
    expect(upserts[0]!.metadata).toEqual({ sku: standard[0]!.sku });
  });
});

describe("embeddingVectors", () => {
  it("reads data[0] from the documented Workers AI shape", () => {
    expect(embeddingVectors({ shape: [1, 3], data: [[1, 2, 3]] })).toEqual([[1, 2, 3]]);
  });
});

describe("matchInvoiceLive", () => {
  it("reads the catalogue from the KV snapshot and does not hit D1", async () => {
    const kv = new Map<string, string>([
      [SNAPSHOT_KEY, JSON.stringify(standard)],
      [VECTORIZE_SEEDED_KEY, "1"],
    ]);
    const env = {
      DB: {
        prepare() {
          throw new Error("D1 should not be hit when the snapshot is warm");
        },
      },
      STANDARD_KV: {
        async get(key: string, typeOrOpts?: string | { type?: string }) {
          const raw = kv.get(key);
          if (raw === undefined) return null;
          const type = typeof typeOrOpts === "string" ? typeOrOpts : typeOrOpts?.type;
          return type === "json" ? JSON.parse(raw) : raw;
        },
        async put() {},
        async delete() {
          return true;
        },
      },
      AI: {
        async run() {
          return { data: [[0.1, 0.2]] };
        },
      },
      PRODUCTS: {
        async query() {
          return { matches: [] };
        },
      },
    } as unknown as Env;

    const lines = await matchInvoiceLive(invoice, env);
    expect(lines[0]!.matchedSku).toBe("SKU-2027");
    expect(lines[5]!.matchMethod).toBe("alias");
    expect(lines[6]!.matchMethod).toBe("none");
  });
});
