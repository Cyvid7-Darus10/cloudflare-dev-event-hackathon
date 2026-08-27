/**
 * Catalogue learning. Nothing except a human resolution reaches here.
 *
 * The five steps have to happen together: bump the product, insert the alias,
 * write the audit row, upsert the embedding, purge the KV snapshot. Miss the
 * alias and invoice B still flags. Miss the snapshot delete and it matches
 * yesterday's catalogue.
 */

import type { FlaggedField, LineReview } from "../shared/contracts.ts";
import { embedTexts } from "./embeddings.ts";
import { SNAPSHOT_KEY } from "./keys.ts";
import { normalize } from "./normalize.ts";

export type WriteBackEvent = {
  sessionId: string;
  docId: string;
  lineId: string;
  resolution: Exclude<LineReview["resolution"], "pending">;
  line: LineReview;
  at: number;
  actor: string;
};

const PRODUCT_COLUMNS: Partial<Record<FlaggedField, string>> = {
  unitPrice: "list_price",
  uom: "uom",
  taxCode: "tax_code",
};

export type WriteBackPlan = {
  sku: string;
  field: FlaggedField;
  oldValue: unknown;
  newValue: unknown;
  /** Normalised vendor wording, unique on `idx_alias`. */
  alias?: string;
  column?: { sql: string; value: string | number };
};

/**
 * Prefer a description mismatch — that is the teaching that makes invoice B
 * auto-match. Otherwise take the first flag that is not a match.
 */
export function teachingField(line: LineReview): FlaggedField {
  const description = line.flags.find(
    (flag) => flag.field === "description" && flag.status === "mismatch",
  );
  if (description) return "description";
  return line.flags.find((flag) => flag.status !== "match")?.field ?? "description";
}

export function planWriteBack(event: WriteBackEvent): WriteBackPlan | null {
  if (event.resolution === "accept_standard") return null;
  const sku = event.line.matchedSku;
  if (!sku) return null;
  if (event.line.flags.every((flag) => flag.status === "match")) return null;

  const field = teachingField(event.line);
  const flag = event.line.flags.find((item) => item.field === field);
  const newValue = newValueFor(event, field);
  const plan: WriteBackPlan = {
    sku,
    field,
    oldValue: flag?.standardValue ?? null,
    newValue,
  };

  if (field === "description" && typeof newValue === "string" && newValue.trim()) {
    plan.alias = normalize(newValue);
  }

  const column = PRODUCT_COLUMNS[field];
  if (column && newValue !== null && newValue !== undefined) {
    if (column === "list_price") {
      const n = typeof newValue === "number" ? newValue : Number(newValue);
      if (Number.isFinite(n)) plan.column = { sql: column, value: n };
    } else if (typeof newValue === "string" && newValue.length > 0) {
      plan.column = { sql: column, value: newValue };
    }
  }

  return plan;
}

export async function applyWriteBack(env: Env, event: WriteBackEvent): Promise<void> {
  const plan = planWriteBack(event);
  if (!plan) return;

  const db = env.DB;
  const statements: D1PreparedStatement[] = [];

  if (plan.column) {
    statements.push(
      db
        .prepare(
          `UPDATE standard_products SET ${plan.column.sql} = ?, version = version + 1, updated_at = ? WHERE sku = ?`,
        )
        .bind(plan.column.value, event.at, plan.sku),
    );
  } else {
    statements.push(
      db
        .prepare(`UPDATE standard_products SET version = version + 1, updated_at = ? WHERE sku = ?`)
        .bind(event.at, plan.sku),
    );
  }

  if (plan.alias) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO standard_aliases (sku, alias, source_doc_id, created_at) VALUES (?, ?, ?, ?)`,
        )
        .bind(plan.sku, plan.alias, event.docId, event.at),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO standard_versions (sku, field, old_value, new_value, session_id, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        plan.sku,
        plan.field,
        stringify(plan.oldValue),
        stringify(plan.newValue),
        event.sessionId,
        event.actor,
        event.at,
      ),
  );

  await db.batch(statements);
  // Purge before the embedding so a Vectorize blip cannot leave invoice B on a stale snapshot.
  await env.STANDARD_KV.delete(SNAPSHOT_KEY);
  await upsertProductEmbedding(env, plan, event);
}

function newValueFor(event: WriteBackEvent, field: FlaggedField): unknown {
  if (event.resolution === "edited") {
    const typed = event.line.finalValues?.[field as keyof typeof event.line.finalValues];
    if (typed !== undefined) return typed;
  }
  return event.line.flags.find((flag) => flag.field === field)?.documentValue ?? null;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function upsertProductEmbedding(
  env: Env,
  plan: WriteBackPlan,
  event: WriteBackEvent,
): Promise<void> {
  const descriptionFlag = event.line.flags.find((flag) => flag.field === "description");
  const text =
    (typeof plan.alias === "string" && plan.alias) ||
    (typeof descriptionFlag?.standardValue === "string" && descriptionFlag.standardValue) ||
    plan.sku;
  const [vector] = await embedTexts(env, [text]);
  if (!vector) return;
  await env.PRODUCTS.upsert([{ id: plan.sku, values: vector, metadata: { sku: plan.sku } }]);
}
