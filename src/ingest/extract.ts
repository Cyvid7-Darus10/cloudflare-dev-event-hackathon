import { z } from "zod";
import type { ExtractedInvoice } from "../shared/contracts";
import { ExtractedInvoiceObject, parseExtractedInvoice } from "./schema";

/**
 * Document to markdown, markdown to `ExtractedInvoice`.
 *
 * Two easy steps instead of one hard one: `env.AI.toMarkdown()` does the PDF
 * parsing, then a JSON-mode call turns the markdown into the contract shape.
 *
 * The extraction call goes over REST to the account's `/ai/run` endpoint with
 * `cf-aig-gateway-id`, rather than through the `env.AI` binding, so every call
 * lands in the hackathon AI Gateway. Caching and the token dashboard are the
 * point of it, not a nice-to-have.
 */

const ACCOUNT_ID = "1b37bb1b7821a80f6e683adb438a9b63";

export const GATEWAY_ID = "hackathon";
export const AI_RUN_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run`;

/**
 * Confirm this id through the gateway before the demo — model ids drift, and a
 * deprecated one fails with nothing useful in the response.
 */
export const EXTRACTION_MODEL = "@cf/zai-org/glm-5.3-flash";

/** The slice of the `Ai` binding used for markdown conversion. */
export interface AiLike {
  toMarkdown(
    file: { name: string; blob: Blob },
    options?: unknown,
  ): Promise<
    | { id: string; name: string; mimeType: string; format: string; tokens: number; data: string }
    | { id: string; name: string; mimeType: string; format: "error"; error: string }
  >;
}

/**
 * How the extractor reaches the model.
 *
 * Injected rather than reaching for global `fetch`, so the tests can answer in
 * the real `/ai/run` envelope without an account or a token.
 */
export interface ChatTransport {
  fetch: typeof fetch;
  apiToken: string;
}

/** Generated from the zod schema, so the constraint and the check cannot drift. */
const INVOICE_JSON_SCHEMA = z.toJSONSchema(ExtractedInvoiceObject, { io: "input" });

const SYSTEM_PROMPT = [
  "You extract supplier invoices into JSON matching the given schema exactly.",
  "",
  "Rules you must not break:",
  "- Copy values from the document. Never calculate, correct, or infer one.",
  "- If the document does not give a SKU for a line, set sku to null. Never invent one.",
  "- If the document does not give a unit of measure, set uom to null.",
  "- Numbers must be JSON numbers, not strings. No currency symbols, no thousands separators.",
  "- lineId is the line's position: L0 for the first line item, L1 for the second, and so on.",
  "- rawText is the line exactly as it appears in the document.",
  "- Return only the JSON object.",
].join("\n");

/** Convert an uploaded document to markdown. Throws if conversion failed. */
export async function documentToMarkdown(ai: AiLike, name: string, blob: Blob): Promise<string> {
  const result = await ai.toMarkdown({ name, blob }, { gateway: { id: GATEWAY_ID } });

  // An empty document extracts to zero lines and looks like a blank invoice.
  // Failing here is the difference between a retryable step and a silent lie.
  if (result.format === "error") {
    throw new Error(`toMarkdown failed for ${name}: ${(result as { error: string }).error}`);
  }

  return (result as { data: string }).data;
}

/** Strip a markdown code fence, which small models add even in JSON mode. */
function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Pull the model's answer out of the `/ai/run` envelope.
 *
 * The result key varies across model families, so accept the ones that occur
 * rather than pinning one and failing opaquely on a model swap.
 */
function answerFrom(payload: unknown): unknown {
  const result = (payload as { result?: unknown })?.result ?? payload;
  if (typeof result === "string") return result;

  const candidate = result as Record<string, unknown>;
  for (const key of ["response", "output", "output_text", "text"]) {
    if (candidate?.[key] !== undefined) return candidate[key];
  }

  // OpenAI-shaped, if the gateway is fronting a compat endpoint.
  const choices = candidate?.choices as { message?: { content?: unknown } }[] | undefined;
  return choices?.[0]?.message?.content;
}

function asJson(answer: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (answer === undefined || answer === null) {
    return { ok: false, error: "the model returned no response" };
  }
  if (typeof answer !== "string") return { ok: true, value: answer };
  try {
    return { ok: true, value: JSON.parse(unfence(answer)) };
  } catch {
    return { ok: false, error: "the model did not return JSON" };
  }
}

export interface ExtractArgs {
  markdown: string;
  /** Ours, from the uploaded bytes. The model's docId is never trusted. */
  docId: string;
}

/**
 * Extract one invoice, with a single repair retry.
 *
 * On the second failure this throws, so the Workflow step fails and can be
 * resumed from here rather than from the upload. A confident wrong line is
 * worse than a failed parse.
 */
export async function extractInvoice(
  transport: ChatTransport,
  args: ExtractArgs,
): Promise<ExtractedInvoice> {
  const { markdown, docId } = args;
  let complaint: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Extract this invoice:\n\n${markdown}` },
      ...(complaint
        ? [
            {
              role: "user",
              content:
                `Your previous answer did not match the schema:\n${complaint}\n` +
                `Return the corrected JSON object only.`,
            },
          ]
        : []),
    ];

    const response = await transport.fetch(AI_RUN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${transport.apiToken}`,
        "cf-aig-gateway-id": GATEWAY_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        input: {
          messages,
          response_format: { type: "json_schema", json_schema: INVOICE_JSON_SCHEMA },
          // Extraction is copying, not writing. Leave no room for flourish.
          temperature: 0,
        },
      }),
    });

    const payload = (await response.json()) as { success?: boolean; errors?: { message: string }[] };

    // A transport or model failure is not something a repair prompt can fix,
    // so it fails the step immediately rather than burning the retry.
    if (!response.ok || payload.success === false) {
      const detail = payload.errors?.map((e) => e.message).join("; ") ?? `HTTP ${response.status}`;
      throw new Error(`AI Gateway call failed: ${detail}`);
    }

    const json = asJson(answerFrom(payload));
    if (!json.ok) {
      complaint = json.error;
      continue;
    }

    // Our docId wins: it is the hash of the bytes we stored, and the rest of
    // the system keys on it.
    const parsed = parseExtractedInvoice({ ...(json.value as object), docId });
    if (parsed.ok) return parsed.invoice;

    complaint = parsed.errors.join("\n");
  }

  throw new Error(`extraction failed after one repair retry: ${complaint}`);
}
