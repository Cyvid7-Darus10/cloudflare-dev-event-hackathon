/**
 * HTML → Browser Run → R2.
 *
 * The corrected invoice is a page first. This file is the one extra call that
 * turns that page into a file a reviewer can download, stored next to the
 * original upload. If Browser Run is unbound or errors, callers fall back to
 * the HTML — that is the drop-ladder order, not a gap.
 */

export function publishedPdfKey(sessionId: string, hash: string): string {
  return `published/${sessionId}/${hash}.pdf`;
}

/** A Content-Disposition filename. Invoice numbers are not always filesystem-safe. */
export function pdfFilename(invoiceNumber: string): string {
  const stem =
    invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "invoice";
  return `${stem}-corrected.pdf`;
}

const STYLESHEET = '<link rel="stylesheet" href="/invoice.css">';

/**
 * Browser Run loads `html` as a document, not our origin, so `/invoice.css`
 * would 404. Inline the sheet for the PDF pass only — the page served to a
 * browser still links it, because CSP forbids `unsafe-inline`.
 */
export async function htmlWithInlinedCss(env: Env, html: string, origin: string): Promise<string> {
  if (!html.includes(STYLESHEET) || !env.ASSETS) return html;
  const cssRes = await env.ASSETS.fetch(new Request(new URL("/invoice.css", origin)));
  if (!cssRes.ok) return html;
  const css = await cssRes.text();
  return html.replace(STYLESHEET, `<style>${css}</style>`);
}

export type StoredPdf = {
  key: string;
  bytes: ArrayBuffer;
};

/**
 * Return the PDF already in R2, or render one and put it there.
 *
 * Same content hash → same object, so republishing an unchanged invoice does
 * not spend another Browser Run second.
 */
export async function getOrCreatePublishedPdf(
  env: Env,
  args: { sessionId: string; hash: string; html: string; origin: string },
): Promise<StoredPdf | null> {
  const key = publishedPdfKey(args.sessionId, args.hash);
  const existing = await env.DOCS?.get(key);
  if (existing) return { key, bytes: await existing.arrayBuffer() };

  const browser = env.BROWSER;
  if (!browser) return null;

  const html = await htmlWithInlinedCss(env, args.html, args.origin);
  let rendered: Response;
  try {
    rendered = await browser.quickAction("pdf", {
      html,
      pdfOptions: {
        format: "a4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      },
    });
  } catch (cause) {
    console.error("rectify: browser pdf failed", cause);
    return null;
  }

  const contentType = rendered.headers.get("content-type") ?? "";
  if (!rendered.ok || !contentType.includes("pdf")) {
    console.error("rectify: browser pdf status", rendered.status, contentType);
    return null;
  }

  const bytes = await rendered.arrayBuffer();
  if (bytes.byteLength < 5) return null;

  await env.DOCS?.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { sessionId: args.sessionId, contentHash: args.hash },
  });
  return { key, bytes };
}
