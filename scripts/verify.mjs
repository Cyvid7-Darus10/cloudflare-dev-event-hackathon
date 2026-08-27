#!/usr/bin/env node
/**
 * Over-the-wire checks against a deployed (or wrangler-dev) URL.
 *   npm run verify -- https://rectify.<account>.workers.dev
 */
const base = (process.argv[2] || process.env.RECTIFY_URL || "http://127.0.0.1:8787").replace(/\/$/, "");

async function main() {
  const failures = [];

  const healthRes = await fetch(`${base}/api/health`);
  const health = await healthRes.json();
  check(healthRes.ok && (health.ok === true || health.status === "ok"), "GET /api/health", failures, health);
  check(
    (health.standardCount ?? health.bindings?.DB) !== undefined,
    "health payload",
    failures,
    health,
  );
  for (const [name, present] of Object.entries(health.bindings ?? {})) {
    check(present === true, `binding ${name}`, failures, present);
  }

  const standardRes = await fetch(`${base}/api/standard`);
  const standard = await standardRes.json();
  check(standardRes.ok && standard.count >= 40, "GET /api/standard", failures, standard.count);
  const stale = (standard.products ?? []).find((p) => p.sku === "SKU-1104");
  check(stale != null, "SKU-1104 is in the catalogue", failures, stale);
  const widget = (standard.products ?? []).find((p) => p.sku === "SKU-4471");
  check(
    Array.isArray(widget?.aliases) && widget.aliases.length === 0,
    "SKU-4471 has no alias yet (learning bait)",
    failures,
    widget,
  );

  const demoRes = await fetch(`${base}/api/documents?demo=1`, { method: "POST" });
  const demo = await demoRes.json();
  check(
    (demoRes.ok || demoRes.status === 202) && typeof demo.sessionId === "string",
    "POST /api/documents?demo=1",
    failures,
    demo,
  );

  if (demo.sessionId) {
    let session = null;
    for (let i = 0; i < 15; i++) {
      const sessionRes = await fetch(`${base}/api/sessions/${demo.sessionId}`);
      session = await sessionRes.json();
      if (sessionRes.ok && session.status === "ready") break;
      await new Promise((r) => setTimeout(r, 400));
    }
    check(session?.status === "ready", "GET /api/sessions/:id is ready", failures, session?.status);
    const flags = (session.lines ?? []).flatMap((line) => line.flags ?? []);
    check(
      flags.some((flag) => flag.status === "mismatch"),
      "session has at least one mismatch",
      failures,
      flags.map((flag) => flag.field),
    );
  }

  if (failures.length) {
    console.error(`FAILED ${failures.length} check(s) against ${base}`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log(`OK  ${base}`);
}

function check(pass, label, failures, detail) {
  if (pass) {
    console.log(`ok   ${label}`);
    return;
  }
  failures.push(label);
  console.error(`fail ${label}`, detail ?? "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
