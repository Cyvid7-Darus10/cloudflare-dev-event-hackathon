CREATE TABLE standard_products (
  sku TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  uom TEXT NOT NULL,
  list_price REAL NOT NULL,
  currency TEXT NOT NULL,
  tax_code TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE standard_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  alias TEXT NOT NULL,
  source_doc_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_alias ON standard_aliases(alias);

CREATE TABLE standard_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  session_id TEXT,
  actor TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE documents (
  doc_id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  filename TEXT,
  vendor TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
