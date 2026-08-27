import { describe, expect, it } from "vitest";
import { handleAudit } from "./sessions.ts";

describe("handleAudit", () => {
  it("reads camelCased rows from D1 when the catalogue is bound", async () => {
    const rows = [
      {
        id: 7,
        sku: "SKU-4471",
        field: "description",
        old_value: "Widget Pro Series 2000",
        new_value: "Widget Pro 2K",
        session_id: "session-a",
        actor: "reviewer",
        created_at: 1_787_793_240_000,
      },
      {
        id: 8,
        sku: "SKU-1001",
        field: "unitPrice",
        old_value: "10",
        new_value: "12",
        session_id: "other",
        actor: "reviewer",
        created_at: 1_787_793_250_000,
      },
    ];
    const env = {
      DB: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async all() {
              return { results: rows };
            },
          };
        },
      },
    } as unknown as Env;

    const all = await handleAudit(env, new URL("https://x/api/audit"));
    expect(all.status).toBe(200);
    const body = await all.json<{ source: string; count: number; rows: Array<{ sku: string; oldValue: string }> }>();
    expect(body.source).toBe("d1");
    expect(body.count).toBe(2);
    expect(body.rows[0]?.oldValue).toBe("Widget Pro Series 2000");

    const filtered = await handleAudit(env, new URL("https://x/api/audit?session=session-a"));
    const scoped = await filtered.json<{ count: number; rows: Array<{ sessionId: string }> }>();
    expect(scoped.count).toBe(1);
    expect(scoped.rows[0]?.sessionId).toBe("session-a");
  });

  it("falls back to the session object when D1 is unbound", async () => {
    const env = {
      DB: undefined,
      REVIEW_SESSION: {
        getByName: () => ({
          async getAudit() {
            return [{ sku: "SKU-1", field: "uom", persisted: true }];
          },
        }),
      },
    } as unknown as Env;

    const res = await handleAudit(env, new URL("https://x/api/audit?session=session-a"));
    const body = await res.json<{ source: string; count: number }>();
    expect(body.source).toBe("durable-object");
    expect(body.count).toBe(1);
  });
});
