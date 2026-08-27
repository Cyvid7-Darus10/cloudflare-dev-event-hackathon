/**
 * Reliability, safety, and security that sit in front of every route.
 *
 * Feature workstreams own their handlers. This file owns the envelope: what
 * we will even look at, how large it may be, which origins may talk to us,
 * and which headers leave with the response. The model still does not decide;
 * this just keeps a hostile or accidental request from taking the Worker down
 * or writing somewhere it should not.
 */

import type { IngestParams } from "../ingest/upload";
import { documentKey } from "../ingest/hash";

/** Workers will buffer the whole upload; 10 MB is enough for a scanned invoice. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Resolve/publish bodies are JSON, not PDFs. */
export const MAX_JSON_BYTES = 1_000_000;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
]);

const ALLOWED_EXT = new Set([
  "pdf",
  "docx",
  "xlsx",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "tif",
  "tiff",
]);

export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
  "cache-control": "no-store",
};

const json = (body: unknown, status: number): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Session ids we mint are UUIDs; the fixture board also uses `session-a`. */
export function isSafeSessionId(id: string): boolean {
  return id.length >= 1 && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id);
}

export function isAllowedOrigin(origin: string, requestUrl: URL): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.host === requestUrl.host) return true;
  return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(origin, new URL(request.url))) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("access-control-max-age", "86400");
  }
  return headers;
}

export function withSecurity(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  const cors = corsHeaders(request);
  cors.forEach((value, key) => {
    if (!headers.has(key)) headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function payloadTooLarge(request: Request, maxBytes: number): Response | null {
  const raw = request.headers.get("Content-Length");
  if (raw === null) return null;
  const size = Number(raw);
  if (!Number.isFinite(size) || size < 0) {
    return json({ error: "invalid Content-Length" }, 400);
  }
  if (size > maxBytes) {
    return json({ error: `payload too large (max ${maxBytes} bytes)` }, 413);
  }
  return null;
}

export function extensionOf(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function safeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop()?.trim() || "document";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
  return cleaned || "document";
}

/** Null when the file is acceptable; otherwise a 400/413 reason. */
export function inspectUpload(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return `file too large (max ${MAX_UPLOAD_BYTES} bytes)`;
  const type = file.type.toLowerCase();
  const ext = extensionOf(file.name);
  if (type && ALLOWED_TYPES.has(type)) return null;
  if (ext && ALLOWED_EXT.has(ext)) return null;
  return "unsupported file type; upload a PDF, Office document, or image";
}

export function isIngestParams(value: unknown): value is IngestParams {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.docId !== "string" || v.docId.length < 1 || v.docId.length > 128) return false;
  if (typeof v.sessionId !== "string" || !isSafeSessionId(v.sessionId)) return false;
  if (typeof v.r2Key !== "string" || v.r2Key !== documentKey(v.docId)) return false;
  if (typeof v.filename !== "string" || v.filename.length > 180) return false;
  if (typeof v.demo !== "boolean") return false;
  return true;
}

export function websocketOriginDenied(request: Request): Response | null {
  const origin = request.headers.get("Origin");
  if (!origin) return json({ error: "WebSocket origin required" }, 403);
  if (!isAllowedOrigin(origin, new URL(request.url))) {
    return json({ error: "WebSocket origin not allowed" }, 403);
  }
  return null;
}

export async function rateLimited(
  limiter: { limit(options: { key: string }): Promise<{ success: boolean }> } | undefined,
  key: string,
): Promise<Response | null> {
  if (!limiter) return null;
  const { success } = await limiter.limit({ key });
  if (success) return null;
  return json({ error: "Too many requests" }, 429);
}

export function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "anon";
}
