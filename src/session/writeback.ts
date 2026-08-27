/**
 * The seam between the session and the catalogue.
 *
 * The learning loop belongs to Michelle (`src/matching/`): updating
 * `standard_products`, inserting the vendor's wording as an alias, upserting the
 * embedding, writing the audit row, purging the KV snapshot. This file does not
 * reimplement any of it. It decides *whether* a decision should reach her, and
 * calls her when it should.
 */

import { applyWriteBack } from "../matching/index.ts";
import type { LineReview } from "../shared/contracts.ts";

/** Shaped to match the `standard_versions` table in `architecture.md`. */
export type AuditRow = {
  sku: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  sessionId: string;
  docId: string;
  lineId: string;
  actor: string;
  createdAt: number;
  /** True only after `applyWriteBack` returns. A thrown write must not claim a persist. */
  persisted: boolean;
};

export type ResolutionEvent = {
  sessionId: string;
  docId: string;
  lineId: string;
  resolution: Exclude<LineReview["resolution"], "pending">;
  line: LineReview;
  at: number;
};

/**
 * Only two of the three resolutions touch the catalogue.
 *
 * `accept_standard` means the invoice was wrong and the standard was right, so
 * the corrected value goes on the published invoice and the catalogue is left
 * alone. `accept_document` and `edited` are the ones that teach it. Getting this
 * backwards would have the system learn from invoices it just rejected.
 */
export function teachesTheCatalogue(resolution: ResolutionEvent["resolution"]): boolean {
  return resolution === "accept_document" || resolution === "edited";
}

export async function recordResolution(
  env: Env,
  event: ResolutionEvent,
): Promise<AuditRow | null> {
  if (!teachesTheCatalogue(event.resolution)) return null;

  const { line } = event;
  const field = firstDisagreeingField(line);
  const row: AuditRow = {
    sku: line.matchedSku,
    field,
    oldValue: stringify(standardValueOf(line, field)),
    newValue: stringify(
      (line.finalValues as Record<string, unknown> | undefined)?.[field]
        ?? documentValueOf(line, field),
    ),
    sessionId: event.sessionId,
    docId: event.docId,
    lineId: event.lineId,
    actor: "reviewer",
    createdAt: event.at,
    persisted: false,
  };

  await applyWriteBack(env, { ...event, actor: row.actor });
  row.persisted = true;

  return row;
}

function firstDisagreeingField(line: LineReview): string {
  return line.flags.find((f) => f.status !== "match")?.field ?? "description";
}

function standardValueOf(line: LineReview, field: string): unknown {
  return line.flags.find((f) => f.field === field)?.standardValue ?? null;
}

function documentValueOf(line: LineReview, field: string): unknown {
  return line.flags.find((f) => f.field === field)?.documentValue ?? null;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}
