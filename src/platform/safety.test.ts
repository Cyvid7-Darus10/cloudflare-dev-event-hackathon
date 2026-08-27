import { describe, expect, it } from "vitest";
import {
  corsHeaders,
  extensionOf,
  inspectUpload,
  isAllowedOrigin,
  isIngestParams,
  isSafeSessionId,
  payloadTooLarge,
  safeFilename,
  withSecurity,
} from "./safety";
import { documentKey } from "../ingest/hash";

describe("isSafeSessionId", () => {
  it("accepts UUIDs and the fixture id", () => {
    expect(isSafeSessionId("session-a")).toBe(true);
    expect(isSafeSessionId("2c1e6d3a-4b5f-4c8d-9e0a-1b2c3d4e5f60")).toBe(true);
  });

  it("rejects path traversal and separators", () => {
    expect(isSafeSessionId("../etc/passwd")).toBe(false);
    expect(isSafeSessionId("a/b")).toBe(false);
    expect(isSafeSessionId("a b")).toBe(false);
    expect(isSafeSessionId("")).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  const url = new URL("https://rectify.cloudflare-hackathon.workers.dev/api/health");

  it("allows same host and local wrangler", () => {
    expect(isAllowedOrigin("https://rectify.cloudflare-hackathon.workers.dev", url)).toBe(true);
    expect(isAllowedOrigin("http://localhost:8787", url)).toBe(true);
  });

  it("rejects other sites", () => {
    expect(isAllowedOrigin("https://evil.example", url)).toBe(false);
    expect(isAllowedOrigin("not a url", url)).toBe(false);
  });
});

describe("payloadTooLarge", () => {
  it("lets a missing Content-Length through so the handler can reject empty bodies", () => {
    expect(payloadTooLarge(new Request("https://x/", { method: "POST" }), 10)).toBeNull();
  });

  it("rejects a declared size over the cap before we buffer the body", () => {
    const response = payloadTooLarge(
      new Request("https://x/", { method: "POST", headers: { "content-length": "11" } }),
      10,
    );
    expect(response?.status).toBe(413);
  });
});

describe("inspectUpload / filenames", () => {
  it("accepts a PDF", () => {
    const file = new File(["%PDF"], "invoice-a.pdf", { type: "application/pdf" });
    expect(inspectUpload(file)).toBeNull();
  });

  it("rejects an executable even if it is small", () => {
    const file = new File(["MZ"], "tool.exe", { type: "application/octet-stream" });
    expect(inspectUpload(file)).toMatch(/unsupported/i);
  });

  it("strips path components from a supplied filename", () => {
    expect(safeFilename("..\\..\\windows\\invoice.pdf")).toBe("invoice.pdf");
    expect(extensionOf("a/b/c.PDF")).toBe("pdf");
  });
});

describe("isIngestParams", () => {
  it("requires the R2 key to be the content-addressed documents/ path", () => {
    const docId = "abc";
    expect(
      isIngestParams({
        docId,
        sessionId: "session-a",
        r2Key: documentKey(docId),
        filename: "invoice-a.pdf",
        demo: false,
      }),
    ).toBe(true);
    expect(
      isIngestParams({
        docId,
        sessionId: "session-a",
        r2Key: "other/abc",
        filename: "invoice-a.pdf",
        demo: false,
      }),
    ).toBe(false);
  });
});

describe("withSecurity", () => {
  it("stamps CSP and does not reflect a foreign Origin", () => {
    const request = new Request("https://rectify.cloudflare-hackathon.workers.dev/api/health", {
      headers: { origin: "https://evil.example" },
    });
    const stamped = withSecurity(request, Response.json({ ok: true }));
    expect(stamped.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
    expect(stamped.headers.get("x-content-type-options")).toBe("nosniff");
    expect(stamped.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("echoes a same-origin Origin for CORS", () => {
    const request = new Request("https://rectify.cloudflare-hackathon.workers.dev/api/health", {
      headers: { origin: "https://rectify.cloudflare-hackathon.workers.dev" },
    });
    const stamped = withSecurity(request, new Response(null, { status: 204 }));
    expect(stamped.headers.get("access-control-allow-origin")).toBe(
      "https://rectify.cloudflare-hackathon.workers.dev",
    );
  });
});
