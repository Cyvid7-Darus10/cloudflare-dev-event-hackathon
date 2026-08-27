import { documentId, documentKey } from "./hash";
import { inspectUpload, MAX_UPLOAD_BYTES, safeFilename } from "../platform/safety";

/**
 * `POST /api/documents` — the front door.
 *
 * Bytes to R2, a row in `documents`, a Workflow started, a sessionId back. The
 * response does not wait for extraction: the Workflow owns that, and the review
 * screen opens on a session that is still `extracting`.
 */

export interface IngestParams {
  docId: string;
  sessionId: string;
  r2Key: string;
  filename: string;
  /** Skip the LLM and seed from `fixtures/invoice-a.json`. The stage escape hatch. */
  demo: boolean;
}

/** The slice of the environment this handler needs. */
export interface UploadEnv {
  DOCS: R2Bucket;
  DB: D1Database;
  INGEST: { create(options: { id: string; params: IngestParams }): Promise<{ id: string }> };
}

const DEMO_DOC_ID = "demo-invoice-a";

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export async function handleUpload(request: Request, env: UploadEnv): Promise<Response> {
  const demo = new URL(request.url).searchParams.get("demo") === "1";
  const sessionId = crypto.randomUUID();

  // The demo path takes no file. It exists so the stage does not depend on
  // conference wifi or on the model behaving, and it must work when the rest
  // of the pipeline does not.
  if (demo) {
    const params: IngestParams = {
      docId: DEMO_DOC_ID,
      sessionId,
      r2Key: documentKey(DEMO_DOC_ID),
      filename: "invoice-a.pdf",
      demo: true,
    };
    await recordDocument(env, params);
    await env.INGEST.create({ id: sessionId, params });
    return Response.json({ sessionId }, { status: 202 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("expected a multipart form with a file field");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("no file field in the upload");

  const unsafe = inspectUpload(file);
  if (unsafe) {
    const status = unsafe.startsWith("file too large") ? 413 : 400;
    return Response.json({ error: unsafe }, { status });
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) return badRequest("the uploaded file is empty");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `file too large (max ${MAX_UPLOAD_BYTES} bytes)` },
      { status: 413 },
    );
  }

  // Content-addressed: the same invoice twice is the same docId, which keeps
  // R2 from filling up with byte-identical copies.
  const docId = await documentId(bytes);
  const r2Key = documentKey(docId);

  await env.DOCS.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const params: IngestParams = {
    docId,
    sessionId,
    r2Key,
    filename: safeFilename(file.name),
    demo: false,
  };

  await recordDocument(env, params);

  // The session is the Workflow instance id, so a stuck run is traceable from
  // the id the UI is already holding.
  await env.INGEST.create({ id: sessionId, params });

  return Response.json({ sessionId }, { status: 202 });
}

async function recordDocument(env: UploadEnv, params: IngestParams): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO documents (doc_id, r2_key, filename, vendor, status, created_at)
     VALUES (?, ?, ?, NULL, 'extracting', ?)
     ON CONFLICT(doc_id) DO UPDATE SET status = 'extracting'`,
  )
    .bind(params.docId, params.r2Key, params.filename, Date.now())
    .run();
}
