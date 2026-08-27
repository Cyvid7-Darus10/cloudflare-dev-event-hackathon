/**
 * SHA-256 of the uploaded bytes, lowercase hex.
 *
 * Content-addressed on purpose: the same invoice uploaded twice is the same
 * `docId`, so a repeat upload is recognisable rather than a second document
 * with a fresh id. It depends on the bytes and nothing else — not the
 * filename, not the upload time.
 */
export async function documentId(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Where the original upload lives in R2. Zuriel writes published PDFs alongside. */
export function documentKey(docId: string): string {
  return `documents/${docId}`;
}
