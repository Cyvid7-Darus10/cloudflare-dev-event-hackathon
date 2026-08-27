/**
 * One Durable Object per review session.
 *
 * It holds the session, serialises resolutions, and broadcasts them to every
 * browser watching. The object is the session; it is not the catalogue. Two
 * reviewers racing on the same line is a problem this class solves. Two
 * reviewers updating the same SKU is a D1 write problem and belongs to
 * Michelle's write-back.
 *
 * Sockets use the Hibernation API. A DO holding an open connection never
 * hibernates, which bills for idle time and eventually drops the socket anyway.
 * `ctx.acceptWebSocket` hands the socket to the runtime so this object can
 * sleep between messages and still wake to deliver one.
 */

import { DurableObject } from "cloudflare:workers";
import type { LineReview, ReviewSession as Session } from "../shared/contracts.ts";
import { decidedValues, InvalidDecision, sameValues } from "./decide.ts";
import { isResolveMessage, type ServerMessage } from "./protocol.ts";
import { recordResolution, type AuditRow } from "./writeback.ts";

const SESSION_KEY = "session";
const AUDIT_KEY = "audit";

export class ReviewSessionDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.openSocket();
    }
    return Response.json({ error: "This object speaks WebSocket or RPC." }, { status: 400 });
  }

  private async openSocket(): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);

    const session = await this.load();
    if (session) this.sendTo(server, { type: "session", session });

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- RPC, called from the API layer -------------------------------------

  /** Put a session in, or replace the one that is here. Bryan's workflow calls this. */
  async seed(session: Session): Promise<Session> {
    await this.ctx.storage.put(SESSION_KEY, session);
    this.broadcast({ type: "session", session });
    return session;
  }

  async getSession(): Promise<Session | null> {
    return this.load();
  }

  async getAudit(): Promise<AuditRow[]> {
    return (await this.ctx.storage.get<AuditRow[]>(AUDIT_KEY)) ?? [];
  }

  /**
   * Apply one reviewer's decision.
   *
   * Order matters and is the whole point of this method. Persist, then write
   * back, then broadcast. If we broadcast first, the other browser is told a
   * thing landed that may not have; Cyrus would show a lie and invoice B would
   * not learn.
   *
   * Resolving a line that already carries the same decision is a no-op. Two
   * reviewers clicking accept on the same line must not bump the catalogue
   * version twice.
   */
  async resolve(
    lineId: string,
    resolution: Exclude<LineReview["resolution"], "pending">,
    finalValues?: Record<string, unknown>,
    requestId?: string,
  ): Promise<{ ok: true; line: LineReview } | { ok: false; error: string }> {
    const session = await this.load();
    if (!session) return { ok: false, error: "No session has been seeded here." };

    const index = session.lines.findIndex((l) => l.lineId === lineId);
    if (index === -1) return { ok: false, error: `No line ${lineId} on this session.` };

    const before = session.lines[index];
    const item = session.invoice.lineItems.find((l) => l.lineId === lineId);
    if (!item) return { ok: false, error: `Session has no invoice line ${lineId}.` };

    let values: Record<string, unknown> | undefined;
    try {
      values = decidedValues(before, item, resolution, finalValues);
    } catch (cause) {
      if (cause instanceof InvalidDecision) return { ok: false, error: cause.message };
      throw cause;
    }

    if (before.resolution === resolution && sameValues(before.finalValues, values)) {
      return { ok: true, line: before };
    }

    // Assigned rather than spread, so changing to accept_document clears the
    // values an earlier decision wrote instead of leaving them applied.
    const line: LineReview = { ...before, resolution, finalValues: values };

    const updatedAt = Date.now();
    const next: Session = {
      ...session,
      lines: session.lines.map((l, i) => (i === index ? line : l)),
      updatedAt,
    };

    // 1. Persist first. A DO can hibernate between any two awaits.
    await this.ctx.storage.put(SESSION_KEY, next);

    // 2. Then the catalogue write-back, and its audit row.
    const row = await recordResolution(this.env, {
      sessionId: next.sessionId,
      docId: next.docId,
      lineId,
      resolution,
      line,
      at: updatedAt,
    });
    if (row) {
      const audit = await this.getAudit();
      await this.ctx.storage.put(AUDIT_KEY, [...audit, row]);
    }

    // 3. Only now tell the other browsers.
    this.broadcast({ type: "resolved", lineId, line, updatedAt, requestId });
    return { ok: true, line };
  }

  // ---- Hibernation handlers ------------------------------------------------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return this.sendTo(ws, { type: "error", message: "Message was not JSON." });
    }

    if (!isResolveMessage(parsed)) {
      return this.sendTo(ws, { type: "error", message: "Expected a resolve message." });
    }

    const result = await this.resolve(
      parsed.lineId, parsed.resolution, parsed.finalValues, parsed.requestId,
    );
    if (!result.ok) {
      this.sendTo(ws, { type: "error", message: result.error, requestId: parsed.requestId });
    }
    // The success path already reached this socket through the broadcast.
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // 1006 is "abnormal closure" and the runtime rejects it as a close code.
    ws.close(code === 1006 ? 1000 : code, reason);
  }

  async webSocketError(): Promise<void> {
    // Nothing to clean up: the runtime drops the socket from getWebSockets().
  }

  // ---- internals -----------------------------------------------------------

  private async load(): Promise<Session | null> {
    return (await this.ctx.storage.get<Session>(SESSION_KEY)) ?? null;
  }

  private sendTo(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // A socket that closed between the broadcast and here is not an error.
    }
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Same: a dead socket must not stop the live ones being told.
      }
    }
  }
}
