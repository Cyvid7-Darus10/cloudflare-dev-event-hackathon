/**
 * The WebSocket envelope, between the flag board (E) and the session DO (D).
 *
 * `contracts.ts` defines the shapes that cross workstreams but not the messages
 * that carry them, and `plan/d-session-api.md` calls that out as the one gap in
 * the contract. This file is that gap closed. It is deliberately three message
 * types: anything richer is a protocol nobody has time to debug at T+70.
 *
 * Cyrus: import from here rather than hand-rolling the JSON, and neither of us
 * has to guess at integration.
 */

import type { LineReview, ReviewSession } from "../shared/contracts.ts";

/** Client to server. The only thing a reviewer can do. */
export type ResolveMessage = {
  type: "resolve";
  lineId: string;
  resolution: Exclude<LineReview["resolution"], "pending">;
  /** Required for `edited`, ignored otherwise. */
  finalValues?: Record<string, unknown>;
  /**
   * Echoed back on the matching `resolved`, so a client can tell its own
   * action from another reviewer's without diffing state.
   */
  requestId?: string;
};

export type ClientMessage = ResolveMessage;

/** Server to client. */
export type ServerMessage =
  /** Sent once on connect, and after any change a client may have missed. */
  | { type: "session"; session: ReviewSession }
  /** One line changed. Sent to every socket, including the one that asked. */
  | { type: "resolved"; lineId: string; line: LineReview; updatedAt: number; requestId?: string }
  /** The request was not applied. The session is unchanged. */
  | { type: "error"; message: string; requestId?: string };

export function isResolveMessage(value: unknown): value is ResolveMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return m.type === "resolve"
    && typeof m.lineId === "string"
    && (m.resolution === "accept_standard"
      || m.resolution === "accept_document"
      || m.resolution === "edited");
}
