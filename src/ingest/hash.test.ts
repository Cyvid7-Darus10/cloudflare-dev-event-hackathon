import { describe, expect, it } from "vitest";
import { documentId } from "./hash";

/**
 * The docId is the SHA-256 of the uploaded bytes.
 *
 * Content-addressing it means re-uploading the same invoice is recognisably
 * the same document rather than a second one with a fresh id.
 */
describe("documentId", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it("is the SHA-256 of the bytes, lowercase hex", async () => {
    await expect(documentId(bytes("hello"))).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("gives the same id for the same invoice uploaded twice", async () => {
    const a = await documentId(bytes("invoice bytes"));
    const b = await documentId(bytes("invoice bytes"));
    expect(a).toBe(b);
  });

  it("depends on content only, so a rename is still the same document", async () => {
    expect(await documentId(bytes("same"))).toBe(await documentId(bytes("same")));
  });

  it("changes when a single byte changes", async () => {
    expect(await documentId(bytes("42.50"))).not.toBe(await documentId(bytes("42.51")));
  });
});
