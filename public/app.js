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
 * Person A's fixture is the source of truth. The copy under `public/` only
 * exists so this page still runs when served on its own, before the assets
 * directory is decided.
 */
const FIXTURES = ["/fixtures/session-a.json", "./fixtures/session-a.json"];

/** Where the session comes from. Swapped for D's socket at integration. */
async function loadSession() {
  for (const url of FIXTURES) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // Try the next one. A 404 here is expected in one of the two layouts.
    }
  }
  throw new Error("Could not load a session fixture");
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
  /** True once a key has been used, so the hint can stop taking up room. */
  usedKeys: false,
  /** Set when a key cannot apply here, so the stall explains itself. */
  blocked: null,
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
      </div>
    </div>

    <div class="summary">
      <div class="prog">
        <div class="prog__l">
          <span><b>${done}</b> of <b>${s.lines.length}</b> lines resolved</span>
          <span>${pct}%</span>
        </div>
        <div class="prog__t" role="progressbar" aria-valuenow="${done}" aria-valuemin="0"
             aria-valuemax="${s.lines.length}" aria-label="Lines resolved">
          <div class="prog__f" style="width:${pct}%"></div>
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
        <span class="line__qty">${line?.quantity} × ${money(line?.unitPrice, s.invoice.currency)}</span>
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
      <div class="agrees__list" style="padding:0 var(--s-3) var(--s-2)">
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
      <h2>Before this is written</h2>
      <p>Nothing has changed yet. Publishing does two separate things.</p>

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

      ${state.published ? `<p class="cf__result">${esc(state.published)}</p>` : ""}

      <div class="cf__acts">
        <button class="act act--primary" id="confirm-publish">Publish and write back</button>
        <button class="act" id="confirm-back">Back to the board</button>
      </div>
    </div>
  `;
}

/* ---------- bottom bar ---------- */

function barHtml(s) {
  const open = openLines(s).length;
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
  const pub = document.getElementById("publish");
  if (pub) pub.addEventListener("click", () => { state.confirming = true; render(); });

  const back = document.getElementById("confirm-back");
  if (back) back.addEventListener("click", () => {
    state.confirming = false;
    state.published = null;
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
  const btn = document.getElementById("confirm-publish");
  if (btn) { btn.disabled = true; btn.textContent = "Publishing…"; }

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
    state.published = res.ok
      ? "Published. The corrected invoice is ready and the standard has been updated."
      : `The publish endpoint answered ${res.status}. Workstream D owns POST /api/sessions/:id/publish; until it exists there is nothing for this to call.`;
  } catch (err) {
    state.published = `Could not reach the publish endpoint: ${err instanceof Error ? err.message : String(err)}. Workstream D owns it.`;
  }
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

  host.innerHTML =
    xs.map((x) => `<span class="guides__v" style="inset-inline-start:${x}px"></span>`).join("") +
    ys.map((y) => `<span class="guides__h" style="inset-block-start:${y}px"></span>`).join("") +
    xs
      .flatMap((x) => ys.map((y) => `<span class="guides__node" style="inset-inline-start:${x}px;inset-block-start:${y}px"></span>`))
      .join("");
}

addEventListener("resize", drawGuides);

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
    if (e.key === "Escape") document.querySelector("[data-cancel]")?.click();
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
    state.usedKeys = true;
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
      state.usedKeys = true;
      btn.click();
      document.querySelector(".editor input")?.focus();
    }
    return;
  }

  if (key === "u") {
    const btn = document.querySelector(`[data-undo="${line.lineId}"]`);
    if (btn) { e.preventDefault(); state.usedKeys = true; btn.click(); }
    return;
  }

  if (key === "j" || key === "arrowdown") {
    e.preventDefault();
    state.usedKeys = true;
    state.cursor = Math.min(state.cursor + 1, state.session.lines.length - 1);
    state.atEnd = false;
    render();
    focusCursor();
    return;
  }

  if (key === "k" || key === "arrowup") {
    e.preventDefault();
    state.usedKeys = true;
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
  document.getElementById("tab-board").setAttribute("aria-selected", String(state.tab === "board"));
  document.getElementById("tab-standard").setAttribute("aria-selected", String(state.tab === "standard"));
  render();
}

loadSession()
  .then((s) => {
    state.session = s;
    render();
  })
  .catch((err) => {
    document.getElementById("root").innerHTML =
      `<p class="empty">${esc(err.message)}. The fixture lives at <code>${FIXTURE}</code>.</p>`;
  });
