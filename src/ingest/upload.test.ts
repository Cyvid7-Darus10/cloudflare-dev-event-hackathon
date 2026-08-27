import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { handleUpload } from "./upload";
import { documentId, documentKey } from "./hash";

/**
 * `POST /api/documents`: bytes to R2, a row in `documents`, a Workflow started,
 * a sessionId back.
 *
 * R2 here is the real miniflare binding, so the storage assertions mean
 * something. D1 and Workflows are doubles that record what they were asked to
 * do — they belong to Siva and Zuriel, and the contract between us is the call.
 */

interface Started {
  id: string;
  params: any;
}

function fakes() {
  const statements: { sql: string; bindings: unknown[] }[] = [];
  const started: Started[] = [];

  const DB = {
    prepare(sql: string) {
      const record = { sql, bindings: [] as unknown[] };
      return {
        bind(...bindings: unknown[]) {
          record.bindings = bindings;
          statements.push(record);
          return this;
        },
        async run() {
          return { success: true };
        },
      };
    },
  };

  const INGEST = {
    async create(options: { id: string; params: unknown }) {
      started.push({ id: options.id, params: options.params });
      return { id: options.id };
    },
  };

  return { DB, INGEST, statements, started };
}

/** Siva's generated `Env` does not exist yet; this is the binding we declared. */
const env = workerEnv as unknown as { DOCS: R2Bucket };

function upload(body: BodyInit, url = "https://x/api/documents") {
  return new Request(url, { method: "POST", body });
}

function form(name = "invoice-a.pdf", contents = "%PDF-1.4 fake invoice bytes") {
  const fd = new FormData();
  fd.append("file", new File([contents], name, { type: "application/pdf" }));
  return fd;
}

describe("handleUpload", () => {
  it("returns a sessionId", async () => {
    const f = fakes();
    const response = await handleUpload(upload(form()), { ...env, ...f } as any);
    expect(response.status).toBe(202);
    const body = (await response.json()) as { sessionId: string };
    expect(body.sessionId).toBeTruthy();
  });

  it("stores the original bytes in R2 under the document id", async () => {
    const f = fakes();
    const contents = "%PDF-1.4 stored bytes";
    await handleUpload(upload(form("invoice-a.pdf", contents)), { ...env, ...f } as any);

    const docId = await documentId(new TextEncoder().encode(contents));
    const stored = await env.DOCS.get(documentKey(docId));
    expect(stored).not.toBeNull();
    await expect(stored!.text()).resolves.toBe(contents);
  });

  it("inserts a documents row carrying the r2 key and filename", async () => {
    const f = fakes();
    await handleUpload(upload(form("invoice-a.pdf")), { ...env, ...f } as any);
    const insert = f.statements.find((s) => /insert into documents/i.test(s.sql));
    expect(insert).toBeDefined();
    expect(insert!.bindings).toContain("invoice-a.pdf");
  });

  it("starts the ingest Workflow with what it needs to run", async () => {
    const f = fakes();
    const response = await handleUpload(upload(form()), { ...env, ...f } as any);
    const { sessionId } = (await response.json()) as { sessionId: string };

    expect(f.started).toHaveLength(1);
    expect(f.started[0].params.sessionId).toBe(sessionId);
    expect(f.started[0].params.docId).toBeTruthy();
    expect(f.started[0].params.r2Key).toBe(documentKey(f.started[0].params.docId));
  });

  it("rejects a request with no file rather than starting an empty run", async () => {
    const f = fakes();
    const response = await handleUpload(upload(new FormData()), { ...env, ...f } as any);
    expect(response.status).toBe(400);
  });

  it("rejects an empty file", async () => {
    const f = fakes();
    const response = await handleUpload(upload(form("empty.pdf", "")), { ...env, ...f } as any);
    expect(response.status).toBe(400);
  });

  it("rejects a non-document so R2 never stores an executable", async () => {
    const f = fakes();
    const fd = new FormData();
    fd.append("file", new File(["MZ"], "tool.exe", { type: "application/x-msdownload" }));
    const response = await handleUpload(upload(fd), { ...env, ...f } as any);
    expect(response.status).toBe(400);
    expect(f.started).toHaveLength(0);
  });

  it("gives the same document id for the same invoice uploaded twice", async () => {
    const f = fakes();
    await handleUpload(upload(form("a.pdf", "identical")), { ...env, ...f } as any);
    await handleUpload(upload(form("renamed.pdf", "identical")), { ...env, ...f } as any);
    expect(f.started[0].params.docId).toBe(f.started[1].params.docId);
  });

  it("gives each upload its own session, so re-review does not collide", async () => {
    const f = fakes();
    await handleUpload(upload(form("a.pdf", "identical")), { ...env, ...f } as any);
    await handleUpload(upload(form("a.pdf", "identical")), { ...env, ...f } as any);
    expect(f.started[0].params.sessionId).not.toBe(f.started[1].params.sessionId);
  });

  describe("?demo=1", () => {
    it("returns a sessionId without a file being uploaded at all", async () => {
      // The stage escape hatch: conference wifi, or the model misbehaving live.
      const f = fakes();
      const response = await handleUpload(
        new Request("https://x/api/documents?demo=1", { method: "POST" }),
        { ...env, ...f } as any,
      );
      expect(response.status).toBe(202);
      const body = (await response.json()) as { sessionId: string };
      expect(body.sessionId).toBeTruthy();
    });

    it("tells the Workflow to skip the LLM", async () => {
      const f = fakes();
      await handleUpload(
        new Request("https://x/api/documents?demo=1", { method: "POST" }),
        { ...env, ...f } as any,
      );
      expect(f.started[0].params.demo).toBe(true);
    });
  });
});
