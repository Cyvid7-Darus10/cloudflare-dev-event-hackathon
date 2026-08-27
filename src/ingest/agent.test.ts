import { describe, expect, it } from "vitest";
import { INITIAL_STATE, performIngest, withRetry } from "./agent";
import type { IngestState } from "./agent";
import type { IngestDeps } from "./pipeline";
import invoiceA from "../../fixtures/invoice-a.json";

/**
 * The ingesting agent's observable state.
 *
 * The agent is a Durable Object holding one document's ingestion. What matters
 * to everyone else is the state it publishes: the board opens the moment upload
 * returns, before extraction has finished, and reads this to tell a slow model
 * from a dead one.
 *
 * Tested through `performIngest`, which takes the state sink as an argument.
 * The `Agent` subclass is a thin wrapper; the SDK owns the plumbing.
 */

const params = {
  docId: "doc-abc",
  sessionId: "sess-1",
  r2Key: "documents/doc-abc",
  filename: "invoice-a.pdf",
  demo: false,
};

function sink() {
  const states: IngestState[] = [];
  let current = INITIAL_STATE;
  return {
    states,
    get state() {
      return current;
    },
    setState(next: IngestState) {
      current = next;
      states.push(next);
    },
  };
}

function deps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  return {
    async loadDocument() {
      return new Blob(["%PDF"]);
    },
    async toMarkdown() {
      return "| Qty | Description |";
    },
    async extract(_markdown, docId) {
      return { ...(invoiceA as any), docId };
    },
    async match(invoice) {
      return invoice.lineItems.map((l: any) => ({
        lineId: l.lineId, matchedSku: l.sku, matchMethod: "exact" as const,
        matchScore: 1, flags: [], resolution: "pending" as const,
      }));
    },
    async seedSession() {},
    async markDocument() {},
    demoInvoice: invoiceA as any,
    ...overrides,
  };
}

describe("withRetry", () => {
  // An Agent has no step.do, so the retry the Workflow gave us for free has to
  // be explicit. Losing it would make one flaky model call kill the demo.
  it("returns the first success without retrying", async () => {
    let calls = 0;
    const result = await withRetry("extract", async () => { calls++; return "ok"; }, 0);
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries a failing call up to twice more, then succeeds", async () => {
    let calls = 0;
    const result = await withRetry("extract", async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "ok";
    }, 0);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after three attempts and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      withRetry("extract", async () => { calls++; throw new Error("still broken"); }, 0),
    ).rejects.toThrow(/still broken/);
    expect(calls).toBe(3);
  });
});

describe("performIngest", () => {
  it("publishes extracting before it starts work", async () => {
    const s = sink();
    await performIngest(s, deps(), params);
    expect(s.states[0].status).toBe("extracting");
    expect(s.states[0].docId).toBe("doc-abc");
  });

  it("ends ready, carrying the extracted invoice and the matched lines", async () => {
    const s = sink();
    await performIngest(s, deps(), params);
    expect(s.state.status).toBe("ready");
    expect(s.state.invoice?.invoiceNumber).toBe("NW-INV-24817");
    expect(s.state.lines).toHaveLength(8);
    expect(s.state.error).toBeNull();
  });

  it("seeds the session, because a session nobody seeded 404s forever", async () => {
    const seeded: any[] = [];
    const s = sink();
    await performIngest(s, deps({ async seedSession(sn) { seeded.push(sn); } }), params);
    expect(seeded).toHaveLength(1);
    expect(seeded[0].sessionId).toBe("sess-1");
    expect(seeded[0].status).toBe("ready");
  });

  it("publishes failed with the reason when extraction gives up", async () => {
    const s = sink();
    const failing = deps({
      async extract() { throw new Error("extraction failed after one repair retry: unitPrice"); },
    });
    await expect(performIngest(s, failing, params)).rejects.toThrow(/repair retry/);
    expect(s.state.status).toBe("failed");
    expect(s.state.error).toMatch(/unitPrice/);
  });

  it("never leaves the state on extracting after a failure", async () => {
    // A board stuck on a spinner forever is the worst outcome: the reviewer
    // cannot tell a slow model from a dead one.
    const s = sink();
    await expect(
      performIngest(s, deps({ async toMarkdown() { throw new Error("boom"); } }), params),
    ).rejects.toThrow();
    expect(s.state.status).not.toBe("extracting");
  });

  it("skips the model in demo mode and still ends ready", async () => {
    const s = sink();
    const noModel = deps({
      async toMarkdown() { throw new Error("the model must not be called in demo mode"); },
      async extract() { throw new Error("the model must not be called in demo mode"); },
    });
    await performIngest(s, noModel, { ...params, demo: true });
    expect(s.state.status).toBe("ready");
    expect(s.state.lines).toHaveLength(8);
  });
});
