/**
 * Ask Rectify: a small grounded assistant on the flag board.
 *
 * A judge walks up while nobody is standing next to the laptop. This answers
 * what the product does, how the pipeline is put together, and what did not get
 * finished, without anyone having to be there.
 *
 * The model is the one `src/ingest/extract.ts` already proved works on this
 * account and this plan. Several ids in the catalogue error here, so picking a
 * fresh one to be more literally "small" would trade a known-good model for an
 * unknown one.
 *
 * It goes through the `env.AI` binding with the gateway option rather than over
 * REST to `/ai/run`. Same gateway, same caching and token logs, but no API
 * token secret, which is the most likely way this breaks once deployed.
 */

import { EXTRACTION_MODEL, GATEWAY_ID } from "../ingest/extract";

/** Long enough for a real question, short enough that nobody pastes a book. */
const MAX_CHARS = 600;
/** Three exchanges of context. The assistant does not need to remember more. */
const MAX_TURNS = 6;
const MAX_TOKENS = 320;

/**
 * What the assistant is allowed to believe.
 *
 * This is the audited state of the repository, not the pitch. `architecture.md`
 * claims eleven load-bearing services and a learning loop that closes; the code
 * does not support either claim today, and the slide deck says so.
 *
 * A bot that tells a judge "yes, we use Vectorize" is worse than no bot,
 * because the deck now says the opposite and the contradiction is the thing
 * they would remember.
 */
const BRIEF = `
You are the assistant on Rectify's own website. Rectify was built at the Cloudflare
Singapore Developers Day hackathon on 27 August 2026 by Bryan, Cyrus, Michelle, Siva and
Zuriel, in about two hours.

WHAT IT DOES
A supplier sends an invoice as a PDF. Somebody normally opens it next to a price list and
checks it line by line: right SKU, contracted price, right unit of measure. Rectify does
that check. Upload an invoice, it is parsed to structured JSON, every line is matched
against a canonical product standard, and every field difference is flagged with the money
at stake. A person accepts, rejects or edits each flag. Accepted corrections write back
into the standard, including the vendor's odd product wording kept as an alias, so the next
invoice from that vendor matches on its own. Then a corrected invoice is published.

THE RULE THAT DOES NOT BEND
The model reads, extracts and compares. It never decides. Only a human resolution changes
the standard.

THE THREE DECISIONS
"Correct the invoice" means the standard was right: the corrected value goes into the
published invoice and the catalogue is untouched. "Update the standard" means the standard
was stale: the catalogue changes, the version bumps, the vendor's wording is stored as an
alias. "Enter different values" means neither side was right and a person types a third
value.

THE MATCHING LADDER, first hit wins
1. Exact SKU. 2. A known vendor alias. 3. Description similarity above 0.82.
4. No match, which needs a person, and assigning a SKU there teaches tier 2.

WHAT IS ACTUALLY WIRED
Workers, Workers Static Assets, Workers AI (toMarkdown parses the PDF), AI Gateway (every
model call routed through it), Durable Objects (one review session with WebSocket
Hibernation, plus the ingesting agent), D1 (the catalogue, aliases, version history, audit
log), R2 (original uploads and published PDFs), Queues (ingest retries), Browser Run
(HTML to PDF), Vectorize and KV (semantic match and the catalogue snapshot).

WHAT IS ATTACHED BUT NOT DOING WORK
Nothing on the health-check list is decoration. If Browser Run fails or is rate-limited,
publish still serves the corrected invoice as HTML and that page has a print stylesheet,
so Ctrl+P remains a PDF.

WHAT DID NOT GET FINISHED, and you must be straight about this too
Live PDF generation depends on Browser Run remaining available on the account; if that
call fails the HTML is the document and the download link falls back to the same page.
Ask the team about anything this brief does not cover.

OTHER DETAILS
Extraction uses Mistral Small, not Llama, whatever the architecture document says. Money is
held in integer cents end to end. The published invoice carries a SHA-256 over its own
corrected content, excluding the timestamp, so re-rendering with nothing decided gives an
identical digest and correcting a line moves it. There is a technical walkthrough deck at
/slide.

HOW TO ANSWER
Two or three sentences. Plain, specific, no bullet lists, no markdown. If you are asked
something this brief does not cover, say you do not know and suggest asking the team.
Never invent a number, a service, a person or a feature. If someone asks what is broken or
unfinished, tell them: the honesty is the point, not something to manage around.
`.trim();

type Turn = { role: "user" | "assistant"; content: string };

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Keep the shape we expect and drop everything else. */
function clean(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  const turns: Turn[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const { role, content } = raw as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const text = content.trim().slice(0, MAX_CHARS);
    if (text) turns.push({ role, content: text });
  }
  return turns.slice(-MAX_TURNS);
}

export async function handleChat(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only." }, 405);

  const body = await request.json<{ messages?: unknown }>().catch((): { messages?: unknown } => ({}));
  const turns = clean(body.messages);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return json({ error: "Send a question." }, 400);
  }

  const ai = env.AI as { run?: (m: string, i: unknown, o?: unknown) => Promise<unknown> };
  if (typeof ai?.run !== "function") {
    return json({ reply: "The assistant is not available right now. The AI binding is not attached." });
  }

  try {
    const result = await ai.run(
      EXTRACTION_MODEL,
      {
        messages: [{ role: "system", content: BRIEF }, ...turns],
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
      },
      { gateway: { id: GATEWAY_ID } },
    ) as { response?: unknown };

    const reply = typeof result?.response === "string" ? result.response.trim() : "";
    if (!reply) {
      return json({ reply: "I did not get an answer back that time. Try asking again." });
    }
    return json({ reply, model: EXTRACTION_MODEL });
  } catch (cause) {
    // The detail goes to `wrangler tail`. The visitor gets a sentence, never a
    // stack trace, because this renders in front of a judge.
    console.error("chat: model call failed", cause);
    return json({ reply: "The assistant could not reach the model just now. Everything else on the page still works." });
  }
}
