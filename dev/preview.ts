/**
 * Local preview for the published invoice. Not part of the Worker.
 *
 * Renders through the exact same code path the Worker uses, so what you see
 * here is what publish emits. Reload to re-render; edit the fixture and reload
 * to watch a decision change the document.
 *
 *   node dev/preview.ts     ->  http://localhost:8788
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { publishInvoice } from "../src/api/publish/index.ts";
import { reviewedSession } from "./demo-session.ts";
import type { ReviewSession } from "../src/shared/contracts.ts";

const PORT = 8788;

createServer(async (req, res) => {
  try {
    const raw = await readFile(new URL("../fixtures/session-a.json", import.meta.url), "utf8");
    // `?raw` shows the canonical all-pending fixture, so the unresolved state is
    // reachable without editing anything.
    const showRaw = new URL(req.url ?? "/", "http://x").searchParams.has("raw");
    const base = JSON.parse(raw) as ReviewSession;
    const session = showRaw ? base : reviewedSession(base);
    const { html, hash } = await publishInvoice(session, {
      dataSource: "fixture",
      sourceNote: "Served by dev/preview.ts from fixtures/session-a.json.",
    });
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-hash": hash,
    });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`preview failed\n\n${(err as Error).stack}`);
  }
}).listen(PORT, () => console.log(`preview on http://localhost:${PORT}`));
