import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  getOrCreatePublishedPdf,
  htmlWithInlinedCss,
  pdfFilename,
  publishedPdfKey,
} from "./pdf.ts";

const env = workerEnv as unknown as Env;

describe("published PDF keys and names", () => {
  it("stores next to originals, keyed by session and content hash", () => {
    expect(publishedPdfKey("session-a", "abc")).toBe("published/session-a/abc.pdf");
  });

  it("turns an invoice number into a downloadable filename", () => {
    expect(pdfFilename("INV-1007")).toBe("INV-1007-corrected.pdf");
    expect(pdfFilename("Acme / 12")).toBe("Acme-12-corrected.pdf");
    expect(pdfFilename("")).toBe("invoice-corrected.pdf");
  });
});

describe("htmlWithInlinedCss", () => {
  it("leaves HTML alone when the stylesheet link is absent", async () => {
    const html = "<html><body>no sheet</body></html>";
    await expect(htmlWithInlinedCss(env, html, "https://example.test")).resolves.toBe(html);
  });
});

describe("getOrCreatePublishedPdf", () => {
  it("returns the object already in R2 without calling Browser Run", async () => {
    const hash = "cache-hit-hash";
    const key = publishedPdfKey("session-a", hash);
    await env.DOCS.put(key, "%PDF-1.4 cached");

    const result = await getOrCreatePublishedPdf(
      {
        ...env,
        BROWSER: {
          quickAction() {
            throw new Error("Browser Run must not run on a cache hit");
          },
        } as unknown as Env["BROWSER"],
      },
      {
        sessionId: "session-a",
        hash,
        html: "<html></html>",
        origin: "https://example.test",
      },
    );

    expect(result?.key).toBe(key);
    expect(new TextDecoder().decode(result?.bytes)).toBe("%PDF-1.4 cached");
  });

  it("returns null when Browser Run is unbound and R2 has no object", async () => {
    const result = await getOrCreatePublishedPdf(
      { ...env, BROWSER: undefined as unknown as Env["BROWSER"] },
      {
        sessionId: "session-a",
        hash: "missing-hash",
        html: "<html></html>",
        origin: "https://example.test",
      },
    );
    expect(result).toBeNull();
  });
});
