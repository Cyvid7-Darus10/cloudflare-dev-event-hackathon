import type { StandardProduct } from "../shared/contracts";

type ProductRow = {
  sku: string;
  canonical_name: string;
  uom: string;
  list_price: number;
  currency: string;
  tax_code: string;
  version: number;
  aliases: string | null;
};

export async function listStandard(db: D1Database): Promise<StandardProduct[]> {
  const result = await db
    .prepare(
      `SELECT p.sku, p.canonical_name, p.uom, p.list_price, p.currency, p.tax_code, p.version,
              GROUP_CONCAT(a.alias, char(31)) AS aliases
       FROM standard_products p
       LEFT JOIN standard_aliases a ON a.sku = p.sku
       GROUP BY p.sku
       ORDER BY p.sku`,
    )
    .all<ProductRow>();

  return (result.results ?? []).map((row) => ({
    sku: row.sku,
    canonicalName: row.canonical_name,
    uom: row.uom,
    listPrice: row.list_price,
    currency: row.currency,
    taxCode: row.tax_code,
    version: row.version,
    aliases: row.aliases ? row.aliases.split("\u001f") : [],
  }));
}

export async function listAudit(db: D1Database, limit = 50) {
  const result = await db
    .prepare(
      `SELECT id, sku, field, old_value, new_value, session_id, actor, created_at
       FROM standard_versions
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all();
  return result.results ?? [];
}
