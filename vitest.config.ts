import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Tests run inside workerd, not Node, so what passes here is what the deployed
 * Worker does: the same Web Crypto, the same R2 semantics.
 *
 * Deliberately NOT `wrangler: { configPath }`. Binding AI makes even a local
 * run open a remote proxy session and demand CLOUDFLARE_API_TOKEN, because
 * Workers AI is remote even locally. Tests pass their own AI double in, so the
 * binding is not wanted here — only R2, which miniflare simulates properly.
 *
 * The real model is verified over the wire against a deployed URL, which is
 * the only place that proves anything about it anyway.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-03-24",
        compatibilityFlags: ["nodejs_compat"],
        r2Buckets: ["DOCS"],
      },
    }),
  ],
});
