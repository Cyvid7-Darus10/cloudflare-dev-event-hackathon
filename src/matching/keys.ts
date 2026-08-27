/** KV snapshot of the catalogue. Write-back must delete this or invoice B matches stale data. */
export const SNAPSHOT_KEY = "standard:snapshot";

/** Set after a successful Vectorize seed so we do not re-embed 40 products on every invoice. */
export const VECTORIZE_SEEDED_KEY = "vectorize:seeded";

export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const SEMANTIC_FLOOR = 0.82;
export const PRICE_TOLERANCE = 0.005;
