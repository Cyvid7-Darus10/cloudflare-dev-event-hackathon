/**
 * A content hash over the corrected invoice, so the version stamp is a claim
 * anybody can check rather than decoration.
 *
 * Two rules make this evidence instead of theatre:
 *
 * 1. Hash the DATA, never the rendered HTML. Hashing the HTML hashes our own
 *    template, so the number moves when someone nudges a margin, which tells a
 *    reader nothing about whether the invoice changed.
 * 2. Exclude anything that moves on its own. `generatedAt` is excluded by
 *    construction, since it is never passed in. Re-render with no decision
 *    changed and the hash is identical; resolve one flag and it moves.
 *
 * The digest is the easy part. Canonicalisation is where this goes wrong: keys
 * must be sorted recursively or the hash flaps on property order and becomes a
 * checkable claim that fails when checked.
 */

export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
}

/** Full lowercase hex SHA-256. Web Crypto, identical in Workers and in node. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function contentHash(value: unknown): Promise<string> {
  return sha256Hex(canonicalise(value));
}
