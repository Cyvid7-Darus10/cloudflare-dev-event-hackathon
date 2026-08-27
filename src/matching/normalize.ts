/**
 * One normaliser for the matcher and the alias writer. If they ever drift,
 * a name we just taught will miss on the next invoice.
 */

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
