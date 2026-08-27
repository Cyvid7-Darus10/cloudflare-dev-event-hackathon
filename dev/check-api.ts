/**
 * Exercises the session API without the Workers runtime.
 *
 * `wrangler dev` will not start in this environment (workerd aborts with a
 * libuv assertion on Windows before the server binds, on both 4.86 and 4.126),
 * so this drives `handleSessions` against a stand-in for the Durable Object
 * that implements the same RPC surface.
 *
 * What this proves: routing, fixture seeding, resolve, idempotency, publish,
 * and the JSON shape the verification script will assert on.
 *
 * What this does NOT prove, and what Siva has to check over the wire after the
 * first deploy: that the DO class binds, that storage persists across
 * hibernation, and the whole WebSocket path. Those are runtime behaviours and a
 * stand-in cannot speak to them.
 *
 *   node dev/check-api.ts
 */

import { handleSessions } from "../src/api/sessions.ts";
import { recordResolution, type AuditRow } from "../src/session/writeback.ts";
import type { LineReview, ReviewSession } from "../src/shared/contracts.ts";
import fixture from "../fixtures/session-a.json" with { type: "json" };

/** The same contract as ReviewSessionDO, minus anything needing workerd. */
class StubSession {
  private session: ReviewSession | null = null;
  private audit: AuditRow[] = [];
  broadcasts = 0;

  async getSession() { return this.session; }
  async getAudit() { return this.audit; }
  async seed(s: ReviewSession) { this.session = s; this.broadcasts++; return s; }

  async resolve(
    lineId: string,
    resolution: Exclude<LineReview["resolution"], "pending">,
    finalValues?: Record<string, unknown>,
  ) {
    if (!this.session) return { ok: false as const, error: "No session." };
    const i = this.session.lines.findIndex((l) => l.lineId === lineId);
    if (i === -1) return { ok: false as const, error: `No line ${lineId}.` };

    const before = this.session.lines[i];
    const same = before.resolution === resolution
      && JSON.stringify(before.finalValues ?? null) === JSON.stringify(finalValues ?? null);
    if (same) return { ok: true as const, line: before };

    const line: LineReview = { ...before, resolution, ...(finalValues ? { finalValues } : {}) };
    const at = Date.now();
    this.session = { ...this.session, lines: this.session.lines.with(i, line), updatedAt: at };

    const row = await recordResolution({} as Env, {
      sessionId: this.session.sessionId, docId: this.session.docId,
      lineId, resolution, line, at,
    });
    if (row) this.audit.push(row);
    this.broadcasts++;
    return { ok: true as const, line };
  }
}

const stub = new StubSession();
const env = { REVIEW_SESSION: { getByName: () => stub } } as unknown as Env;
const id = (fixture as ReviewSession).sessionId;

const call = (path: string, init?: RequestInit) =>
  handleSessions(new Request(`https://x${path}`, init), env, path.split("?")[0]);

const post = (path: string, body: unknown) =>
  call(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `\n          expected ${JSON.stringify(expected)}\n          actual   ${JSON.stringify(actual)}`}`);
}

console.log("\nsession API\n");

const unknown = await call("/api/sessions/nope");
check("unknown session is a 404", unknown?.status, 404);

const got = await call(`/api/sessions/${id}`);
check("GET seeds from the fixture", got?.status, 200);
const seeded = await got!.clone().json<ReviewSession>();
check("seeded session carries every line", seeded.lines.length, (fixture as ReviewSession).lines.length);
check("every line starts pending", seeded.lines.every((l) => l.resolution === "pending"), true);

const before = await (await call(`/api/sessions/${id}/publish?format=json`))!.json<Record<string, number>>();
check("nothing corrected before review", before.changedLineCount, 0);
check("published total equals the invoiced total", before.correctedTotal, before.originalTotal);

const r1 = await post(`/api/sessions/${id}/resolve`, {
  lineId: "L1", resolution: "accept_standard", finalValues: { unitPrice: 68.4, lineTotal: 820.8 },
});
check("resolve succeeds", r1?.status, 200);

const broadcastsAfterFirst = stub.broadcasts;
await post(`/api/sessions/${id}/resolve`, {
  lineId: "L1", resolution: "accept_standard", finalValues: { unitPrice: 68.4, lineTotal: 820.8 },
});
check("the same decision twice does not write twice", stub.broadcasts, broadcastsAfterFirst);

const after = await (await call(`/api/sessions/${id}/publish?format=json`))!.json<Record<string, number | string>>();
check("one line is now corrected", after.changedLineCount, 1);
check("the corrected total dropped by 54.00", (after.originalTotal as number) - (after.correctedTotal as number), 5886);
check("the content hash moved", after.contentHash !== before.contentHash, true);

await post(`/api/sessions/${id}/resolve`, { lineId: "L3", resolution: "accept_document" });
const audit = await (await call(`/api/sessions/${id}`))!.json<ReviewSession>();
check("accept_document is recorded on the line", audit.lines.find((l) => l.lineId === "L3")?.resolution, "accept_document");
check("only catalogue-teaching decisions write audit rows", (await stub.getAudit()).length, 1);

const bad = await post(`/api/sessions/${id}/resolve`, { lineId: "L99", resolution: "accept_standard" });
check("resolving a line that does not exist is a 400", bad?.status, 400);

// The flag board's own shape: every decision in one POST at publish time.
const batch = await post(`/api/sessions/${id}/publish?format=json`, {
  sessionId: id,
  resolutions: [
    { lineId: "L2", resolution: "accept_standard", finalValues: { uom: "CTN" } },
    { lineId: "L4", resolution: "accept_standard", finalValues: { lineTotal: 240 } },
    { lineId: "L0", resolution: "pending" },
  ],
});
const batched = await batch!.json<Record<string, number>>();
check("a batched publish applies every resolution", batched.changedLineCount, 3);
check("a pending line in the batch is skipped, not rejected", batch?.status, 200);

const publishHtml = await call(`/api/sessions/${id}/publish`);
check("publish serves HTML", publishHtml?.headers.get("content-type"), "text/html; charset=utf-8");
check("publish is never cached", publishHtml?.headers.get("cache-control"), "no-store");
const html = await publishHtml!.text();
check("live publish carries no sample banner", html.includes("Sample data"), false);

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
