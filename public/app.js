/**
 * Rectify — the flag board.
 *
 * Workstream E. Runs with no build step, so Person A only has to point the
 * assets directory at `public/`. That removes the one coupling that reliably
 * bites: a deploy that ships a stale bundle because nobody ran the build.
 *
 * Reads a `ReviewSession` per the frozen contract. Today that comes from a
 * fixture; at integration it comes from D's WebSocket and nothing else here
 * changes.
 */

/**
 * Fixtures, for when there is no live session to read.
 *
 * The board stays demoable on its own: open it with no `?session=` and it
 * still shows a full invoice. That is what let this screen get built before
 * ingest or the standard existed, and it is the fallback if the model
 * misbehaves on stage.
 */
const FIXTURES = ["/fixtures/session-a.json", "./fixtures/session-a.json"];

/** The session id in the URL, when one is being reviewed for real. */
const sessionIdFromUrl = () => new URLSearchParams(location.search).get("session");

/** The sample session, tried in both layouts the page is served from. */
async function loadFixture() {
  for (const url of FIXTURES) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // Expected in one of the two layouts. Try the next.
    }
  }
  throw new Error(
    `Could not load a session fixture. It should be at ${FIXTURES[0]} or ${FIXTURES[1]}.`
  );
}

const state = {
  session: null,
  tab: "board",
  /** lineId -> draft field values while an operator is editing. */
  editing: new Map(),
  /** True once publish is pressed: show what will be written before writing it. */
  confirming: false,
  /** Set when publishing runs, so the page can say what actually happened. */
  published: null,
  /** The line the keyboard is pointed at. Triage is a queue, not a page. */
  cursor: 0,
  /** True when every line is resolved and the cursor has moved to publish. */
  atEnd: false,
  /** Set when a key cannot apply here, so the stall explains itself. */
  blocked: null,
  /** True while a live session's socket is attached. */
  live: false,
  /** True while the publish request is in flight, so it cannot double-send. */
  publishing: false,
  /** True once a publish succeeded: the sheet becomes a receipt, not a form. */
  publishedOk: false,
  /** Figures read back after publishing, so the receipt can say what changed. */
  receipt: null,
  /**
   * Set while a session exists only as a 202: `{ sessionId, since, filename,
   * trouble }`. The upload answered before extraction ran, so the page shows
   * the pipeline's status and polls until the session lands.
   */
  extracting: null,
};

/* ---------- helpers ---------- */

const money = (n, currency) =>
  typeof n === "number"
    ? new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(n)
    : String(n);

/** A value as it should read in a cell. Null means the side has nothing. */
const show = (v) =>
  v === null || v === undefined
    ? `<span class="side__none">nothing on this side</span>`
    : esc(typeof v === "number" ? String(v) : v);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const lineOf = (session, lineId) =>
  session.invoice.lineItems.find((l) => l.lineId === lineId);

/**
 * What this line is worth arguing about.
 *
 * A price flag on 24 units matters more than the same flag on one. Surfacing
 * the money is the difference between a list of differences and a list of
 * decisions.
 */
function exposureOf(review, line) {
  const price = review.flags.find(
    (f) => f.field === "unitPrice" && f.status === "mismatch"
  );
  if (!price || typeof price.documentValue !== "number" || typeof price.standardValue !== "number") {
    return null;
  }
  return (price.documentValue - price.standardValue) * (line?.quantity ?? 1);
}

/** Only lines that still need a person. */
const openLines = (s) => s.lines.filter((l) => l.resolution === "pending");

/* ---------- render ---------- */

function render() {
  const root = document.getElementById("root");
  const bar = document.getElementById("bar");

  /* Extraction has no session to draw yet. The status view is the screen. */
  if (state.extracting) {
    root.innerHTML = extractingView();
    bar.innerHTML = `<span class="bar__n">Nothing to publish yet — the invoice is still being read.</span>`;
    wire();
    drawGuides();
    return;
  }

  const s = state.session;
  if (!s) return;

  root.innerHTML = state.confirming
    ? confirmSheet(s)
    : state.tab === "board"
      ? board(s)
      : standard(s);
  bar.innerHTML = barHtml(s);
  wire();
  drawGuides();
}

function board(s) {
  const inv = s.invoice;
  const open = openLines(s).length;
  const done = s.lines.length - open;
  const pct = s.lines.length ? Math.round((done / s.lines.length) * 100) : 0;

  const totalExposure = s.lines.reduce((sum, r) => {
    const e = exposureOf(r, lineOf(s, r.lineId));
    return sum + (e && e > 0 ? e : 0);
  }, 0);

  return `
    <div class="inv">
      <h1><span class="dim">Reviewing an invoice from</span>${esc(inv.vendor)}</h1>
      <div class="inv__meta">
        <span>${esc(inv.invoiceNumber)}</span><span>·</span>
        <span>${esc(inv.issueDate)}</span><span>·</span>
        <span>${money(inv.totals.total, inv.currency)}</span>
        <span>·</span>
        ${
          sessionIdFromUrl()
            ? `<span class="src src--${state.live ? "live" : "off"}">${state.live ? "live" : "reconnecting"}</span>`
            : `<span class="src src--sample">sample invoice</span>`
        }
      </div>
    </div>

    ${startStrip()}

    <div class="summary">
      <div class="prog">
        <div class="prog__l">
          <span><b>${done}</b> of <b>${s.lines.length}</b> lines resolved</span>
          <span>${pct}%</span>
        </div>
        <div class="prog__t" role="progressbar" aria-valuenow="${done}" aria-valuemin="0"
             aria-valuemax="${s.lines.length}" aria-label="Lines resolved">
          <!-- Width is applied in wire(): the CSP bans style attributes. -->
          <div class="prog__f" data-pct="${pct}"></div>
        </div>
      </div>
      ${
        totalExposure > 0
          ? `<div class="exposure">overcharged by <b>${money(totalExposure, inv.currency)}</b> if the standard is right</div>`
          : ""
      }
    </div>

    ${s.lines.map((r, i) => lineCard(s, r, i === state.cursor)).join("")}
  `;
}

function lineCard(s, r, isCursor) {
  const line = lineOf(s, r.lineId);
  const resolved = r.resolution !== "pending";
  const unmatched = r.matchMethod === "none";
  const exposure = exposureOf(r, line);
  const editing = state.editing.has(r.lineId);

  return `
    <section class="line" data-res="${r.resolution}" data-line-id="${r.lineId}"
             ${isCursor ? 'data-cursor="true"' : ""}>
      <header class="line__head">
        <span class="line__id">${esc(r.lineId)}</span>
        <span class="line__desc">${esc(line?.description ?? "")}</span>
        ${line ? `<span class="line__qty">${line.quantity} × ${money(line.unitPrice, s.invoice.currency)}</span>` : ""}
        <span class="match match--${r.matchMethod}">
          ${r.matchMethod === "none" ? "no match" : esc(r.matchMethod)}
          ${r.matchScore ? `<span class="match__score">${r.matchScore.toFixed(2)}</span>` : ""}
        </span>
        ${resolved ? `<span class="line__done">✓ ${esc(resolutionLabel(r.resolution))}</span>` : ""}
      </header>

      <p class="raw">${esc(line?.rawText ?? "")}</p>

      <div class="flags">
        ${
          unmatched
            ? unmatchedCard(r, line)
            : r.flags.filter((f) => f.status !== "match").map((f) => flagCard(f, r)).join("") + agreements(r)
        }
      </div>

      ${editing ? editor(s, r) : resolutionRow(r, unmatched, exposure, s.invoice.currency, isCursor)}
    </section>
  `;
}

/**
 * A line nothing matched.
 *
 * The matcher flags every field as `unmatched`, which is correct as data and
 * unreadable as a screen: seven rows all saying the same thing, each comparing
 * a value against nothing. There is one fact here, not seven, so it is stated
 * once and the document's values are listed plainly beneath it.
 */
function unmatchedCard(r, line) {
  const why = r.flags.find((f) => f.reason)?.reason ?? "Nothing in the standard corresponds to this line.";
  const shown = ["sku", "description", "quantity", "unitPrice", "uom", "lineTotal"];
  return `
    <div class="flag">
      <div class="flag__bar">
        <span class="flag__field">whole line</span>
        <span class="st st--unmatched">unmatched</span>
      </div>
      <p class="why">${esc(why)}</p>
      <div class="agrees__list">
        ${shown
          .map((f) => `<div class="agrees__row"><b>${esc(f)}</b><span>${show(line?.[f] ?? null)}</span></div>`)
          .join("")}
      </div>
    </div>
  `;
}

/**
 * The fields that agreed, folded away.
 *
 * A reviewer needs to see that most of the line was fine without reading it.
 * Left inline they outnumber the decisions and the board stops looking like
 * a list of things to do.
 */
function agreements(r) {
  const ok = r.flags.filter((f) => f.status === "match");
  if (ok.length === 0) return "";
  return `
    <details class="agrees">
      <summary>${ok.length} ${ok.length === 1 ? "field agrees" : "fields agree"}</summary>
      <div class="agrees__list">
        ${ok
          .map(
            (f) => `<div class="agrees__row"><b>${esc(f.field)}</b><span>${show(f.documentValue)}</span></div>`
          )
          .join("")}
      </div>
    </details>
  `;
}

function flagCard(f, r) {
  const resolved = r.resolution !== "pending";
  const docWon = resolved && r.resolution === "accept_document";
  const stdWon = resolved && r.resolution === "accept_standard";
  const differs = f.status !== "match";

  return `
    <div class="flag ${f.status === "match" ? "flag--match" : ""}">
      <div class="flag__bar">
        <span class="flag__field">${esc(f.field)}</span>
        <span class="st st--${f.status}">${f.status === "match" ? "agrees" : f.status === "mismatch" ? "differs" : "unmatched"}</span>
        ${
          f.confidence < 1
            ? `<span class="conf">confidence ${f.confidence.toFixed(2)}</span>`
            : ""
        }
      </div>
      <div class="pair">
        <div class="side side--doc ${differs && docWon ? "side--won" : ""} ${differs && stdWon ? "side--lost" : ""}">
          <div class="side__l">Invoice</div>
          <div class="side__v">${show(f.documentValue)}</div>
        </div>
        <div class="side ${differs && stdWon ? "side--won" : ""} ${differs && docWon ? "side--lost" : ""}">
          <div class="side__l">Standard</div>
          <div class="side__v">${show(f.standardValue)}</div>
        </div>
      </div>
      ${differs ? `<p class="why">${esc(f.reason)}</p>` : ""}
    </div>
  `;
}

/**
 * The three ways to end a line.
 *
 * `accept_standard` is disabled when nothing matched, because there is no
 * standard to accept. Offering it would be a button that cannot mean anything.
 */
function resolutionRow(r, unmatched, exposure, currency, isCursor) {
  if (r.resolution !== "pending") {
    return `<div class="res"><button class="act act--undo" data-undo="${r.lineId}">Undo <kbd>u</kbd></button></div>`;
  }
  return `
    <div class="res">
      <button class="act" data-resolve="accept_standard" data-line="${r.lineId}" ${unmatched ? "disabled" : ""}>
        Correct the invoice <kbd>1</kbd>
      </button>
      <button class="act act--doc" data-resolve="accept_document" data-line="${r.lineId}" ${unmatched ? "disabled" : ""}>
        Update the standard <kbd>2</kbd>
      </button>
      <button class="act" data-edit="${r.lineId}">
        ${unmatched ? "Assign a SKU" : "Enter different values"} <kbd>3</kbd>
      </button>
      ${
        isCursor && state.blocked
          ? `<p class="hint hint--blocked" role="status">${esc(state.blocked)}</p>`
          : ""
      }
      ${
        unmatched
          ? `<p class="hint"><b>Nothing in the standard matches this line.</b> There is no standard value to accept and no invoice value to trust, so assign a SKU to teach it or leave the line for a buyer.</p>`
          : exposure && exposure > 0
            ? `<p class="hint">Accepting the invoice here costs ${money(exposure, currency)} more than the contracted price.</p>`
            : ""
      }
    </div>
  `;
}

/**
 * Field-level correction. The only route to a third value.
 *
 * Widths say what a field is. A four-character price in a full-width box reads
 * as a mistake, and it costs a reviewer a beat to work out that the box is not
 * expecting a sentence.
 */
const FIELD_WIDTH = {
  sku: "sm",
  uom: "xs",
  taxCode: "sm",
  quantity: "xs",
  unitPrice: "sm",
  lineTotal: "sm",
  description: "full",
};

function editor(s, r) {
  const draft = state.editing.get(r.lineId) ?? {};
  const line = lineOf(s, r.lineId);
  const unmatched = r.matchMethod === "none";
  const fields = unmatched
    ? ["sku", "description", "unitPrice", "uom"]
    : r.flags.filter((f) => f.status !== "match").map((f) => f.field);

  return `
    <div class="editor">
      <p class="editor__lead">
        ${
          unmatched
            ? `Give this line a SKU from the standard. That is what teaches the match, so the next invoice with this wording finds it on its own.`
            : `Enter the values that should stand. They replace both sides and update the standard.`
        }
      </p>

      <div class="editor__fields">
        ${fields
          .map((f) => {
            const required = unmatched && f === "sku";
            return `
          <div class="editor__row">
            <label for="ed-${r.lineId}-${f}">
              ${esc(f)}${required ? `<span class="editor__req" aria-hidden="true">needed</span>` : ""}
            </label>
            <input id="ed-${r.lineId}-${f}" data-draft="${r.lineId}" data-field="${f}"
                   data-w="${FIELD_WIDTH[f] ?? "full"}"
                   ${required ? 'placeholder="SKU-0000" required' : ""}
                   value="${esc(draft[f] ?? line?.[f] ?? "")}" />
          </div>`;
          })
          .join("")}
      </div>

      <div class="editor__acts">
        <button class="act act--primary" data-save="${r.lineId}">
          ${unmatched ? "Assign and teach the standard" : "Save and update the standard"}
        </button>
        <button class="act" data-cancel="${r.lineId}">Cancel</button>
      </div>
    </div>
  `;
}

const resolutionLabel = (res) =>
  res === "accept_document"
    ? "standard updated"
    : res === "accept_standard"
      ? "invoice corrected"
      : "edited";

/* ---------- the standard tab ---------- */

function standard(s) {
  const learned = s.lines.filter((l) => l.resolution === "accept_document" || l.resolution === "edited");
  return `
    <div class="panel">
      <h2>What this document taught the standard</h2>
      <p>
        Every line resolved with <em>Update the standard</em> writes back: the corrected
        value, the vendor's wording kept as an alias, and a row in the audit trail. The
        next invoice from this vendor matches without asking.
      </p>
      ${
        learned.length === 0
          ? `<p class="empty">Nothing yet. Resolve a line with “Update the standard” and it appears here.</p>`
          : `<div class="tw"><table>
              <thead><tr><th>SKU</th><th>Field</th><th>Was</th><th>Now</th><th>Learned from</th></tr></thead>
              <tbody>${learned.flatMap((r) => auditRows(s, r)).join("")}</tbody>
            </table></div>`
      }
    </div>
    <div class="panel">
      <h2>Not wired up yet</h2>
      <p>
        These rows are derived from decisions held in this page. At integration they come
        from <code>GET /api/audit</code> and include who made each change and when.
      </p>
    </div>
  `;
}

function auditRows(s, r) {
  const line = lineOf(s, r.lineId);
  const draft = r.finalValues ?? {};
  return r.flags
    .filter((f) => f.status !== "match")
    .map(
      (f) => `<tr>
        <td class="n">${esc(r.matchedSku ?? draft.sku ?? "—")}</td>
        <td>${esc(f.field)}</td>
        <td>${show(f.standardValue)}</td>
        <td class="n">${show(draft[f.field] ?? f.documentValue)}</td>
        <td>${esc(line?.description ?? "")}</td>
      </tr>`
    );
}

/* ---------- publish ---------- */

/**
 * What publishing will do, before it does it.
 *
 * Two different things happen and they deserve separating: this invoice gets
 * corrected, and the standard gets taught. A reviewer should see which of their
 * decisions change the catalogue for everyone else before any of it is written.
 */
function confirmSheet(s) {
  const corrected = s.lines.filter((l) => l.resolution === "accept_standard");
  const taught = s.lines.filter(
    (l) => l.resolution === "accept_document" || l.resolution === "edited"
  );

  const row = (r) => {
    const line = lineOf(s, r.lineId);
    const diffs = r.flags.filter((f) => f.status !== "match").map((f) => f.field);
    return `<div class="cf__row">
      <b>${esc(line?.description ?? r.lineId)}</b>
      <span>${diffs.length ? esc(diffs.join(", ")) : "no field differences"}</span>
    </div>`;
  };

  return `
    <div class="panel">
      <h2>${state.publishedOk ? "Written" : "Before this is written"}</h2>
      <p>${
        state.publishedOk
          ? "The standard has been updated and the corrected invoice is ready."
          : "Nothing has changed yet. Publishing does two separate things."
      }</p>

      <div class="cf">
        <section class="cf__half">
          <h3>${corrected.length} ${corrected.length === 1 ? "line" : "lines"} corrected on this invoice</h3>
          <p class="cf__note">The standard was right. Corrected values go into the published PDF and the catalogue is untouched.</p>
          ${corrected.length ? corrected.map(row).join("") : `<p class="empty">None.</p>`}
        </section>
        <section class="cf__half cf__half--teach">
          <h3>${taught.length} ${taught.length === 1 ? "change" : "changes"} to the standard</h3>
          <p class="cf__note">These affect every future invoice, not just this one. The vendor's wording is kept as an alias so the next document matches without asking.</p>
          ${taught.length ? taught.map(row).join("") : `<p class="empty">None.</p>`}
        </section>
      </div>

      ${state.published ? `<p class="cf__result ${state.publishedOk ? "cf__result--ok" : ""}" role="status">${esc(state.published)}</p>` : ""}
      ${state.publishedOk ? receipt(s) : ""}

      <div class="cf__acts">
        ${
          state.publishedOk
            ? `<a class="act act--primary" href="/api/sessions/${encodeURIComponent(s.sessionId)}/publish"
                  target="_blank" rel="noopener">Open the corrected invoice</a>
               <button class="act" id="confirm-back">Back to the board</button>`
            : `<button class="act act--primary" id="confirm-publish" ${state.publishing ? "disabled" : ""}>
                 ${state.publishing ? "Publishing…" : "Publish and write back"}
               </button>
               <button class="act" id="confirm-back">Back to the board</button>`
        }
      </div>
    </div>
  `;
}

/**
 * What publishing actually did.
 *
 * A sentence saying it worked is not a result. These are the figures the
 * publish endpoint hands back, so a reviewer can see the money move and check
 * it against what they decided before anyone sends the document on.
 */
function receipt(s) {
  const r = state.receipt;
  if (!r) return "";

  const cur = s.invoice.currency;
  const delta = (r.correctedTotal ?? 0) - (r.originalTotal ?? 0);
  const minor = (n) => money((n ?? 0) / 100, cur);

  return `
    <dl class="rc">
      <div><dt>Invoice</dt><dd>${esc(r.invoiceNumber ?? "")}</dd></div>
      <div><dt>As billed</dt><dd>${minor(r.originalTotal)}</dd></div>
      <div><dt>As corrected</dt><dd class="rc__now">${minor(r.correctedTotal)}</dd></div>
      <div><dt>Difference</dt><dd class="${delta === 0 ? "" : "rc__delta"}">
        ${delta === 0 ? "none" : `${delta > 0 ? "+" : "−"}${minor(Math.abs(delta))}`}
      </dd></div>
      <div><dt>Lines changed</dt><dd>${r.changedLineCount ?? 0}</dd></div>
      ${
        (r.unresolvedCount ?? 0) > 0
          ? `<div><dt>Left unresolved</dt><dd class="rc__delta">${r.unresolvedCount}</dd></div>`
          : ""
      }
    </dl>
  `;
}

/* ---------- bottom bar ---------- */

function barHtml(s) {
  const open = openLines(s).length;
  /* The confirm sheet carries its own publish button. Two on screen at once
     would leave the reviewer guessing which one is armed. */
  if (state.confirming) {
    return `<span class="bar__n">${
      state.publishedOk
        ? "Written. Open the corrected invoice above, or go back to the board."
        : "Review what will be written, then publish from the sheet above."
    }</span>`;
  }
  return `
    <span class="bar__n">
      ${
        open > 0
          ? `<b>${open}</b> ${open === 1 ? "line" : "lines"} still to review. Nothing is written until you publish.`
          : `All <b>${s.lines.length}</b> lines resolved. Publishing writes back to the standard and produces the corrected invoice.`
      }
    </span>
    <button class="cta" id="publish" ${open > 0 ? "disabled" : ""}>Publish corrected invoice</button>
  `;
}

/* ---------- events ---------- */

function wire() {
  /* The CSP has no unsafe-inline, so widths land through the CSSOM. */
  const fill = document.querySelector(".prog__f");
  if (fill) fill.style.width = `${fill.dataset.pct}%`;

  document.querySelectorAll("[data-resolve]").forEach((b) =>
    b.addEventListener("click", () => resolve(b.dataset.line, b.dataset.resolve))
  );
  document.querySelectorAll("[data-undo]").forEach((b) =>
    b.addEventListener("click", () => resolve(b.dataset.undo, "pending"))
  );
  document.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      state.editing.set(b.dataset.edit, {});
      render();
    })
  );
  document.querySelectorAll("[data-cancel]").forEach((b) =>
    b.addEventListener("click", () => {
      state.editing.delete(b.dataset.cancel);
      render();
    })
  );
  document.querySelectorAll("[data-draft]").forEach((i) =>
    i.addEventListener("input", () => {
      const d = state.editing.get(i.dataset.draft) ?? {};
      d[i.dataset.field] = i.value;
      state.editing.set(i.dataset.draft, d);
    })
  );
  const up = document.getElementById("upload");
  if (up) up.addEventListener("change", () => {
    if (up.files?.[0]) void startReview(up.files[0]);
  });

  const demo = document.getElementById("demo-run");
  if (demo) demo.addEventListener("click", () => void startReview(null));

  /* The whole strip accepts a dragged file. `dragleave` fires on every child
     crossed, so only clear the highlight when the pointer truly leaves. */
  const drop = document.getElementById("drop");
  if (drop) {
    for (const type of ["dragenter", "dragover"]) {
      drop.addEventListener(type, (e) => {
        e.preventDefault();
        drop.classList.add("start--drag");
      });
    }
    drop.addEventListener("dragleave", (e) => {
      if (!(e.relatedTarget instanceof Node) || !drop.contains(e.relatedTarget)) {
        drop.classList.remove("start--drag");
      }
    });
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("start--drag");
      const file = e.dataTransfer?.files?.[0];
      if (file) void startReview(file);
    });
  }

  /* On the extraction screen: abandon the wait and go back to the start. */
  const restart = document.getElementById("ex-restart");
  if (restart) restart.addEventListener("click", () => {
    state.extracting = null;
    location.search = "";
  });

  const pub = document.getElementById("publish");
  if (pub) pub.addEventListener("click", () => { state.confirming = true; render(); });

  const back = document.getElementById("confirm-back");
  if (back) back.addEventListener("click", () => {
    state.confirming = false;
    state.published = null;
    state.publishedOk = false;
    render();
  });

  const go = document.getElementById("confirm-publish");
  if (go) go.addEventListener("click", publish);

  document.querySelectorAll("[data-save]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.save;
      const draft = state.editing.get(id) ?? {};
      state.editing.delete(id);
      resolve(id, "edited", draft);
    })
  );
}

/**
 * Record a decision.
 *
 * Local only. Nothing reaches the standard until publish, so every decision
 * stays reversible: operators misclick, and the standard is the thing that
 * must not be corrupted.
 */
function resolve(lineId, resolution, finalValues) {
  state.session = {
    ...state.session,
    lines: state.session.lines.map((l) =>
      l.lineId === lineId
        ? { ...l, resolution, finalValues: resolution === "pending" ? undefined : finalValues }
        : l
    ),
  };
  /* Deciding a line is the signal to move on. Undo is the exception: staying
     put is the whole point of pressing it. */
  if (resolution !== "pending") advance(lineId);
  render();
  focusCursor();
}

/**
 * Move to the next line that still needs a person.
 *
 * Wraps back to the top, because a reviewer who skipped one early should not
 * have to scroll up to find it. Lands on the publish button when nothing is
 * left, so the last decision flows straight into finishing.
 */
function advance(fromLineId) {
  const lines = state.session.lines;
  const from = lines.findIndex((l) => l.lineId === fromLineId);
  const order = [
    ...lines.slice(from + 1),
    ...lines.slice(0, from + 1),
  ];
  const next = order.find((l) => l.resolution === "pending");
  state.cursor = next ? lines.findIndex((l) => l.lineId === next.lineId) : from;
  state.atEnd = !next;
}

/** Bring the pointed-at line into view without yanking the page around. */
function focusCursor() {
  if (state.confirming) return;
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (state.atEnd) {
    document.getElementById("publish")?.focus({ preventScroll: true });
    document.getElementById("publish")?.scrollIntoView({
      block: "center",
      behavior: smooth ? "smooth" : "auto",
    });
    return;
  }
  const el = document.querySelector('[data-cursor="true"]');
  el?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
}

/**
 * Send the review.
 *
 * D's endpoint does not exist yet. Rather than a button that looks like it
 * worked, this reports what it tried and what came back, so the gap is visible
 * rather than silent.
 */
async function publish() {
  if (state.publishing || state.publishedOk) return;
  state.publishing = true;
  render();

  const body = {
    sessionId: state.session.sessionId,
    resolutions: state.session.lines.map((l) => ({
      lineId: l.lineId,
      resolution: l.resolution,
      finalValues: l.finalValues,
    })),
  };

  try {
    const res = await fetch(`/api/sessions/${state.session.sessionId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    state.publishedOk = res.ok;

    if (res.ok) {
      /* The POST answers with the corrected invoice as HTML, and this was
         reading res.ok and dropping the body. A reviewer resolved every line,
         pressed publish, and got a sentence saying it worked while the
         document itself, the point of the whole exercise, went in the bin.
         Read the figures back so the sheet can say what changed, and offer
         the document. */
      state.receipt = await fetch(
        `/api/sessions/${state.session.sessionId}/publish?format=json`
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      state.published = null;
    } else {
      state.published = `The publish endpoint answered ${res.status}.`;
    }
  } catch (err) {
    state.published = `Could not reach the publish endpoint: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
  state.publishing = false;
  render();
}

/**
 * The drawing layer.
 *
 * Two vertical guides on the content's own margins and a horizontal one under
 * the header, with a small square where they cross. Measured from the rendered
 * shell rather than hardcoded, so it follows the layout at any width instead of
 * drifting away from it.
 */
function drawGuides() {
  const host = document.querySelector(".guides");
  const shell = document.querySelector(".shell");
  if (!host || !shell) return;

  const r = shell.getBoundingClientRect();
  const inset = 22;
  const xs = [r.left - inset, r.right + inset];
  const ys = [96, window.innerHeight - 84];

  /* Built with the CSSOM, not style attributes: the CSP has no unsafe-inline,
     so a style attribute in markup is silently dropped and the layer vanishes. */
  const span = (className, styles) => {
    const el = document.createElement("span");
    el.className = className;
    for (const [prop, value] of Object.entries(styles)) el.style[prop] = value;
    return el;
  };

  host.replaceChildren(
    ...xs.map((x) => span("guides__v", { insetInlineStart: `${x}px` })),
    ...ys.map((y) => span("guides__h", { insetBlockStart: `${y}px` })),
    ...xs.flatMap((x) =>
      ys.map((y) => span("guides__node", { insetInlineStart: `${x}px`, insetBlockStart: `${y}px` }))
    ),
  );
}

addEventListener("resize", drawGuides);

/* ---------- starting a real review ---------- */

/** What the server will accept — mirrors ALLOWED_EXT in src/platform/safety.ts. */
const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".docx", ".xlsx"];

/** The server's cap, mirrored so a too-big file costs a sentence, not a 413. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Why a file cannot be uploaded, or null if it can.
 *
 * Checked here rather than left to the server so a wrong file costs a
 * sentence, not a round trip and a raw 400.
 */
function uploadProblem(file) {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `Cannot read ${file.name}. Use a PDF, image, DOCX, or XLSX.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `${file.name} is ${mb} MB. The limit is 10 MB.`;
  }
  return null;
}

/*
 * The filename survives the navigation to `?session=<id>` via sessionStorage,
 * so the extraction screen can say what it is reading. Best effort only:
 * private windows may refuse storage, and the flow must not care.
 */
const UPLOAD_STASH_KEY = "rectify:upload";

function stashUpload(sessionId, filename) {
  try {
    sessionStorage.setItem(UPLOAD_STASH_KEY, JSON.stringify({ sessionId, filename }));
  } catch {
    // Storage refused. The status screen just will not name the file.
  }
}

function stashedFilename(sessionId) {
  try {
    const raw = sessionStorage.getItem(UPLOAD_STASH_KEY);
    const stash = raw ? JSON.parse(raw) : null;
    return stash && stash.sessionId === sessionId ? (stash.filename ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Start a review from a document.
 *
 * `POST /api/documents` answers 202 with a sessionId before extraction has
 * finished, so this hands off to `?session=<id>` and lets the extraction
 * screen follow the work as it lands rather than blocking on the model.
 */
async function startReview(file) {
  /* Written straight into the node. attr() only reads an element's own
     attribute, so styling it off a parent's data-msg would never render. */
  const say = (m) => {
    const strip = document.querySelector(".start");
    const slot = document.querySelector(".start__msg");
    if (strip) strip.dataset.msg = m;
    if (slot) slot.textContent = m;
  };

  if (file) {
    const problem = uploadProblem(file);
    if (problem) {
      say(problem);
      return;
    }
  }

  say(file ? `Uploading ${file.name}…` : "Seeding the demo invoice…");
  try {
    let res;
    if (file) {
      const form = new FormData();
      form.append("file", file);
      res = await fetch("/api/documents", { method: "POST", body: form });
    } else {
      // Bryan's stage escape hatch: seeds from the fixture, no model involved.
      res = await fetch("/api/documents?demo=1", { method: "POST" });
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      say(body.error ?? `Upload failed (${res.status}).`);
      render();
      return;
    }

    const { sessionId } = await res.json();
    stashUpload(sessionId, file?.name ?? null);
    location.search = `?session=${encodeURIComponent(sessionId)}`;
  } catch (err) {
    say(`Could not reach the upload endpoint: ${err instanceof Error ? err.message : String(err)}`);
    render();
  }
}

/**
 * The first part of the page: where a document comes in.
 *
 * Offered only on the sample board — a real session is already under review.
 * The whole strip is a drop target, because dragging a PDF out of an email is
 * how an invoice actually arrives.
 */
function startStrip() {
  if (sessionIdFromUrl()) return "";
  return `
    <div class="start" id="drop" data-msg="">
      <span class="start__lead">
        <b>You are looking at a sample invoice.</b>
        Drop a real one here to review it — PDF, image, DOCX, or XLSX up to 10&nbsp;MB.
      </span>
      <label class="act act--doc start__file">
        Upload an invoice
        <!-- sr-only, not hidden: a display:none input can never take keyboard focus. -->
        <input type="file" id="upload" class="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.docx,.xlsx" />
      </label>
      <button class="act" id="demo-run">Use the demo invoice</button>
      <span class="start__msg" role="status"></span>
    </div>
  `;
}

/* ---------- extraction status ---------- */

const POLL_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Seconds as a reviewer reads them: `41s`, then `1m 12s`. */
function elapsedLabel(since) {
  const secs = Math.max(0, Math.round((Date.now() - since) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/**
 * What the pipeline is doing, told honestly.
 *
 * The Workflow reports nothing until it seeds the session, so the steps after
 * upload are shown as one piece of work in progress, not as checkmarks the
 * page cannot actually observe.
 */
function extractingView() {
  const ex = state.extracting;
  const secs = Math.round((Date.now() - ex.since) / 1000);

  return `
    <div class="panel extract" aria-busy="true">
      <h2>
        <span class="extract__spin" aria-hidden="true"></span>
        Reading ${ex.filename ? `<b>${esc(ex.filename)}</b>` : "the document"}…
      </h2>
      <p>
        The document is uploaded and a Workflow is turning it into a reviewable
        invoice. This page checks every couple of seconds and opens the flag
        board the moment the session lands.
      </p>
      <ol class="extract__steps">
        <li class="extract__step extract__step--done">Uploaded and queued</li>
        <li class="extract__step extract__step--busy">Converting the document to text</li>
        <li class="extract__step extract__step--busy">Extracting the line items</li>
        <li class="extract__step extract__step--busy">Matching each line against the standard</li>
      </ol>
      <p class="extract__meta">
        <span class="src src--off">extracting</span>
        <span>session <code>${esc(ex.sessionId)}</code></span>
        <span>${esc(elapsedLabel(ex.since))} elapsed</span>
      </p>
      ${ex.trouble ? `<p class="hint hint--blocked" role="status">${esc(ex.trouble)}</p>` : ""}
      ${
        secs >= 150
          ? `<p class="extract__slow">Longer than a couple of minutes usually means the extraction failed. Starting over is safe — nothing has been written anywhere.</p>`
          : secs >= 45
            ? `<p class="extract__slow">Model extraction can take a minute on a busy gateway. Leaving this page is safe — the link in the address bar comes back to this session.</p>`
            : ""
      }
      <div class="extract__acts">
        <button class="act" id="ex-restart">Start over with a different document</button>
      </div>
    </div>
  `;
}

/**
 * Wait for the Workflow to seed the session, then open the board on it.
 *
 * `GET /api/sessions/:id` answers 404 until the last ingest step runs — that
 * is the API's whole signal, so polling it is the honest implementation. A
 * poll that errors keeps trying and says so: extraction still running is not
 * a failure, and giving up on a blip would strand a session that is seconds
 * from ready.
 */
async function awaitExtraction(sessionId) {
  state.extracting = {
    sessionId,
    since: Date.now(),
    filename: stashedFilename(sessionId),
    trouble: null,
  };
  render();

  while (state.extracting && state.extracting.sessionId === sessionId) {
    await sleep(POLL_MS);
    if (!state.extracting) return;

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const session = await res.json();
        if (session.status !== "extracting") {
          state.extracting = null;
          state.session = session;
          render();
          follow();
          return;
        }
        state.extracting = { ...state.extracting, trouble: null };
      } else if (res.status === 404) {
        // Not seeded yet. The expected answer mid-extraction.
        state.extracting = { ...state.extracting, trouble: null };
      } else {
        state.extracting = {
          ...state.extracting,
          trouble: `The session API answered ${res.status}. Still checking.`,
        };
      }
    } catch (err) {
      state.extracting = {
        ...state.extracting,
        trouble: `Could not reach the API: ${err instanceof Error ? err.message : String(err)}. Still checking.`,
      };
    }

    /* Re-render the whole view each poll: it holds no inputs to disturb, and
       it is what moves the elapsed time and surfaces the slow notes. */
    if (state.extracting) render();
  }
}

/* ---------- live ---------- */

/**
 * Follow the session over a WebSocket.
 *
 * The Durable Object broadcasts to every open socket, so two reviewers on one
 * invoice see the same board. Only runs against a real session: there is
 * nothing to follow on a fixture.
 *
 * Deliberately does not touch `state.cursor`. Someone else resolving a line
 * must not move the line you are pointed at out from under you mid-keystroke.
 */
function follow() {
  const id = sessionIdFromUrl();
  if (!id) return;

  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}` +
    `/api/sessions/${encodeURIComponent(id)}/ws`;

  let socket;
  try {
    socket = new WebSocket(url);
  } catch {
    return; // The board still works; it just will not update on its own.
  }

  socket.addEventListener("open", () => {
    state.live = true;
    render();
  });

  socket.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "session" && msg.session) {
      state.session = msg.session;
      state.live = true;
      render();
      return;
    }

    /* A single line changed elsewhere. Patch that one rather than replacing
       the session, so an editor open on another line is not thrown away. */
    if (msg.type === "resolved" && msg.lineId && msg.line) {
      state.session = {
        ...state.session,
        lines: state.session.lines.map((l) => (l.lineId === msg.lineId ? msg.line : l)),
      };
      state.live = true;
      render();
    }
  });

  /* The badge says "reconnecting", so reconnect. A DO evicting its socket or
     a network blip should cost a few seconds, not the rest of the review. */
  socket.addEventListener("close", () => {
    state.live = false;
    render();
    setTimeout(follow, 3000);
  });
}

/* ---------- keyboard ---------- */

/**
 * Triage from the keyboard.
 *
 * Forty lines is a lot of mouse travel, and the decision itself takes under a
 * second. Deliberately single keys with no modifier: this screen has one job
 * and nothing else is competing for them.
 */
const KEYS = {
  "1": "accept_standard",
  "2": "accept_document",
};

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  /* Never steal a key from someone typing a correction. */
  const t = e.target;
  const typing =
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  if (typing) {
    /* Cancel the editor being typed in, not whichever one appears first in
       the DOM — more than one line can be open for editing at a time. */
    if (e.key === "Escape") t.closest(".editor")?.querySelector("[data-cancel]")?.click();
    return;
  }

  if (state.confirming || !state.session) return;

  const line = state.session.lines[state.cursor];
  if (!line) return;

  const key = e.key.toLowerCase();

  if (KEYS[key]) {
    const btn = document.querySelector(
      `[data-resolve="${KEYS[key]}"][data-line="${line.lineId}"]`
    );
    e.preventDefault();
    if (btn && !btn.disabled) {
      state.blocked = null;
      btn.click();
      return;
    }
    /* Silence here reads as a broken keyboard. Nothing matched this line, so
       there is no standard to accept and no invoice value to trust: say that
       and point at the key that does apply. */
    state.blocked =
      "Nothing in the standard matches this line, so there is no value to accept either way. Press 3 to assign a SKU.";
    render();
    focusCursor();
    return;
  }

  state.blocked = null;

  if (key === "3" || key === "e") {
    const btn = document.querySelector(`[data-edit="${line.lineId}"]`);
    if (btn) {
      e.preventDefault();
      btn.click();
      /* click() re-rendered the board, so find this line's editor afresh. */
      document
        .querySelector(`[data-line-id="${line.lineId}"] .editor input`)
        ?.focus();
    }
    return;
  }

  if (key === "u") {
    const btn = document.querySelector(`[data-undo="${line.lineId}"]`);
    if (btn) { e.preventDefault(); btn.click(); }
    return;
  }

  if (key === "j" || key === "arrowdown") {
    e.preventDefault();
    state.cursor = Math.min(state.cursor + 1, state.session.lines.length - 1);
    state.atEnd = false;
    render();
    focusCursor();
    return;
  }

  if (key === "k" || key === "arrowup") {
    e.preventDefault();
    state.cursor = Math.max(state.cursor - 1, 0);
    state.atEnd = false;
    render();
    focusCursor();
  }
});

/* ---------- boot ---------- */

document.getElementById("tab-board").addEventListener("click", () => {
  state.tab = "board";
  syncTabs();
});
document.getElementById("tab-standard").addEventListener("click", () => {
  state.tab = "standard";
  syncTabs();
});

function syncTabs() {
  document.getElementById("tab-board").setAttribute("aria-pressed", String(state.tab === "board"));
  document.getElementById("tab-standard").setAttribute("aria-pressed", String(state.tab === "standard"));
  render();
}

/**
 * Where the page starts.
 *
 * Without `?session=`, the sample board with the upload strip: the first part
 * of the page. With one, the live session — and a 404 there means extraction
 * has not landed yet, not a dead link, so the page waits on it rather than
 * erroring. A reviewer who followed a link to a real document is never shown
 * someone else's sample data as a silent fallback.
 */
async function boot() {
  const id = sessionIdFromUrl();
  if (!id) {
    state.session = await loadFixture();
    render();
    return;
  }

  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (res.ok) {
    const session = await res.json();
    if (session.status !== "extracting") {
      state.session = session;
      render();
      follow();
      return;
    }
  } else if (res.status !== 404) {
    throw new Error(`The session API answered ${res.status}.`);
  }

  await awaitExtraction(id);
}

boot().catch((err) => {
  document.getElementById("root").innerHTML =
    `<p class="empty">${esc(err instanceof Error ? err.message : String(err))}</p>`;
});
