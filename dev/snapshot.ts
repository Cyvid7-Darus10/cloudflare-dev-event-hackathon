/**
 * Write the published invoice to a static file.
 *
 * Two uses: looking at the document without a server, and the demo fallback.
 * If the Worker is down or conference wifi dies, this file still opens and
 * still prints. `dist/` is already gitignored.
 *
 *   node dev/snapshot.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { publishInvoice } from "../src/api/publish/index.ts";
import { reviewedSession } from "./demo-session.ts";
import base from "../fixtures/session-a.json" with { type: "json" };
import type { ReviewSession } from "../src/shared/contracts.ts";

const session = base as ReviewSession;
const out = new URL("../dist/", import.meta.url);
await mkdir(out, { recursive: true });

for (const [name, s] of [
  ["corrected-invoice.html", reviewedSession(session)],
  ["corrected-invoice-unresolved.html", session],
] as const) {
  const { html, hash } = await publishInvoice(s, {
    dataSource: "fixture",
    sourceNote: "Static snapshot from dev/snapshot.ts.",
  });
  await writeFile(new URL(name, out), html, "utf8");
  console.log(`${name}  ${hash.slice(0, 12)}  ${html.length} bytes`);
}
