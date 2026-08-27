import { describe, expect, it } from "vitest";
import invoiceA from "../../fixtures/invoice-a.json";
import standardFixture from "../../fixtures/standard.json";
import type { ExtractedInvoice, LineReview, StandardProduct } from "../shared/contracts.ts";
import { SNAPSHOT_KEY } from "./keys.ts";
import { matchInvoice } from "./match.ts";
import { applyWriteBack, planWriteBack, teachingField, type WriteBackEvent } from "./writeback.ts";

const invoice = invoiceA as ExtractedInvoice;
const standard = standardFixture as StandardProduct[];

function eventFor(line: LineReview, resolution: WriteBackEvent["resolution"]): WriteBackEvent {
  return {
    sessionId: "sess-a-0001",
    docId: "doc-a-0001",
    lineId: line.lineId,
    resolution,
    line,
    at: 1_787_793_240_000,
    actor: "reviewer",
  };
}

describe("alias insert logic", () => {
  it("prefers a description mismatch as the teaching field", async () => {
    const lines = await matchInvoice(invoice, standard);
    const l3 = lines.find((line) => line.lineId === "L3")!;
    expect(teachingField(l3)).toBe("description");
    const plan = planWriteBack(eventFor(l3, "accept_document"));
    expect(plan?.sku).toBe("SKU-4471");
    expect(plan?.alias).toBe("widget pro 2k");
    expect(plan?.column).toBeUndefined();
  });

  it("does not plan an alias for a price-only disagreement", async () => {
    const lines = await matchInvoice(invoice, standard);
    const l1 = lines.find((line) => line.lineId === "L1")!;
    const plan = planWriteBack(eventFor(l1, "accept_document"));
    expect(plan?.field).toBe("unitPrice");
    expect(plan?.alias).toBeUndefined();
    expect(plan?.column).toEqual({ sql: "list_price", value: 72.9 });
  });
});

describe("accept_standard", () => {
  it("must not mutate a cloned standard", async () => {
    const clone = structuredClone(standard);
    const lines = await matchInvoice(invoice, clone);
    const l3 = lines.find((line) => line.lineId === "L3")!;
    const plan = planWriteBack(eventFor(l3, "accept_standard"));
    expect(plan).toBeNull();

    const env = throwingEnv();
    await applyWriteBack(env, eventFor(l3, "accept_standard"));
    expect(clone).toEqual(standard);
  });
});

describe("applyWriteBack", () => {
  it("batches product bump, alias insert, and audit, then deletes the KV snapshot", async () => {
    const lines = await matchInvoice(invoice, standard);
    const l3 = lines.find((line) => line.lineId === "L3")!;
    const { env, statements, kv, upserts } = recordingEnv();
    kv.set(SNAPSHOT_KEY, JSON.stringify(standard));

    await applyWriteBack(env, eventFor(l3, "accept_document"));

    expect(statements.some((sql) => /UPDATE standard_products SET version = version \+ 1/.test(sql))).toBe(
      true,
    );
    expect(
      statements.some((sql) => /INSERT OR IGNORE INTO standard_aliases/.test(sql)),
    ).toBe(true);
    expect(statements.some((sql) => /INSERT INTO standard_versions/.test(sql))).toBe(true);
    expect(kv.has(SNAPSHOT_KEY)).toBe(false);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.id).toBe("SKU-4471");
  });
});

function throwingEnv(): Env {
  const fail = () => {
    throw new Error("accept_standard must not touch the catalogue");
  };
  return {
    DB: { prepare: fail, batch: fail },
    STANDARD_KV: { delete: fail, get: fail, put: fail },
    PRODUCTS: { upsert: fail },
    AI: { run: fail },
  } as unknown as Env;
}

function recordingEnv(): {
  env: Env;
  statements: string[];
  kv: Map<string, string>;
  upserts: Array<{ id: string }>;
} {
  const statements: string[] = [];
  const kv = new Map<string, string>();
  const upserts: Array<{ id: string }> = [];
  const fakeVector = Array.from({ length: 8 }, () => 0.01);

  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(..._args: unknown[]) {
            statements.push(sql);
            return { sql };
          },
        };
      },
      async batch() {
        return [];
      },
    },
    STANDARD_KV: {
      async get(key: string) {
        return kv.get(key) ?? null;
      },
      async put(key: string, value: string) {
        kv.set(key, value);
      },
      async delete(key: string) {
        kv.delete(key);
        return true;
      },
    },
    PRODUCTS: {
      async upsert(vectors: Array<{ id: string }>) {
        upserts.push(...vectors);
        return { ids: vectors.map((v) => v.id), count: vectors.length };
      },
    },
    AI: {
      async run() {
        return { shape: [1, fakeVector.length], data: [fakeVector] };
      },
    },
  } as unknown as Env;

  return { env, statements, kv, upserts };
}
