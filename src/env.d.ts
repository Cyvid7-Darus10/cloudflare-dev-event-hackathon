/**
 * Bindings that `wrangler types` cannot see.
 *
 * `HACKATHON_AI_TOKEN` is set as a Worker secret in the dashboard rather than
 * in `wrangler.jsonc`, so it never lands in git and never appears in the
 * generated types. Declared here so extraction can be typed against it.
 */
declare global {
  interface Env {
    HACKATHON_AI_TOKEN: string;
  }
}

export {};
