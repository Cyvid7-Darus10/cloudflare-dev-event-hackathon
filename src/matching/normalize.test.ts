import { describe, expect, it } from "vitest";
import { normalize } from "./normalize.ts";

describe("normalize", () => {
  it("collapses case, punctuation, and whitespace", () => {
    expect(normalize("  Widget-Pro  2K!! ")).toBe("widget pro 2k");
    expect(normalize("Sanitiser 5 Litre")).toBe("sanitiser 5 litre");
    expect(normalize("Stainless steel mixing bowl, 28 cm")).toBe(
      "stainless steel mixing bowl 28 cm",
    );
  });

  it("is stable, so the matcher and the alias writer agree", () => {
    const vendor = "Widget Pro 2K";
    expect(normalize(vendor)).toBe(normalize("widget  pro  2k."));
    expect(normalize(vendor)).toBe("widget pro 2k");
  });
});
