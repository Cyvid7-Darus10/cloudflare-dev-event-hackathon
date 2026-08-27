/**
 * The stylesheet, inlined into the published invoice.
 *
 * Colour and spacing values are lifted from `ui/src/styles/tokens.css` on
 * purpose. The flag board and the invoice a supplier receives should read as
 * one product, and a second palette invented here would be a second design
 * system to keep in sync.
 *
 * The register is different from the screen, though. That is a tool somebody
 * stares at for an hour; this is a business document that gets printed and
 * forwarded to a supplier who is being told they overcharged. So: more white,
 * heavier rules, tabular figures everywhere money appears.
 *
 * No webfont link. Conference wifi is called out as a real risk in
 * `plan/05-platform.md`, and a document that reflows when a font fails to load
 * is worse than one that always used the system stack.
 */

export const STYLES = `
:root {
  --ground: #f5f6f8;
  --paper: #ffffff;
  --paper-2: #fafbfc;
  --ink: #171a21;
  --ink-2: #4a5160;
  --ink-3: #767e8e;
  --ink-4: #a2a9b6;
  --rule: #e2e5ea;
  --rule-2: #eef0f4;
  --incoming: #2f6fb2;
  --incoming-soft: #eaf2fa;
  --incoming-edge: #b9d3ea;
  --resolved: #2c7a5b;
  --resolved-soft: #e9f4ef;
  --pending: #b0731c;
  --pending-soft: #fbf3e6;
  --ui: "Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --r-sm: 5px; --r-md: 8px; --r-lg: 12px;
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 18px; --s-5: 28px; --s-6: 44px;
  --t-2xs: 11px; --t-xs: 12.5px; --t-sm: 13.5px; --t-md: 15px; --t-lg: 18px; --t-xl: 25px;
  --lift-2: 0 18px 48px -28px rgba(23,26,33,.30);
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--ground); color: var(--ink);
  font-family: var(--ui); font-size: var(--t-sm); line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, p, dl, dd, figure { margin: 0; }
table { border-collapse: collapse; width: 100%; }

.wrap { padding: var(--s-6) var(--s-4); }
.sheet {
  max-width: 940px; margin: 0 auto; background: var(--paper);
  border: 1px solid var(--rule); border-radius: var(--r-lg);
  box-shadow: var(--lift-2); overflow: hidden;
}

/* Sample-data banner. Deliberately loud: an invoice rendered from a fixture
   that does not say so is a document the room believes is real. */
.sample {
  display: flex; gap: var(--s-3); align-items: baseline; flex-wrap: wrap;
  padding: var(--s-3) var(--s-5);
  background: var(--pending-soft); border-bottom: 1px solid #ecd9b4;
  color: #7d5214; font-size: var(--t-xs);
}
.sample b { font-size: var(--t-2xs); letter-spacing: .09em; text-transform: uppercase; }

.pad { padding: var(--s-5); }
@media (min-width: 720px) { .pad { padding: var(--s-6); } }

.masthead {
  display: flex; flex-wrap: wrap; gap: var(--s-4);
  justify-content: space-between; align-items: flex-start;
  padding-bottom: var(--s-4); border-bottom: 2px solid var(--ink);
}
.issuer { font-size: var(--t-lg); font-weight: 620; letter-spacing: -.015em; }
.issuer p { color: var(--ink-3); font-size: var(--t-2xs); margin-top: 2px; letter-spacing: .02em; font-weight: 450; }
.docid { text-align: right; }
.doctype {
  font-size: var(--t-2xs); letter-spacing: .11em; text-transform: uppercase;
  color: var(--ink-3); font-weight: 600;
}
.docno { font-family: var(--mono); font-size: var(--t-xl); letter-spacing: -.02em; margin-top: 2px; }

.meta {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--s-4) var(--s-5); padding: var(--s-4) 0;
  border-bottom: 1px solid var(--rule);
}
.meta dt {
  font-size: var(--t-2xs); letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-3); font-weight: 600; margin-bottom: 3px;
}
.meta dd { font-size: var(--t-md); overflow-wrap: anywhere; }

.stamp { display: flex; flex-wrap: wrap; gap: var(--s-2); padding: var(--s-4) 0 0; }
.chip {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 5px 10px; border-radius: 100px;
  background: var(--paper-2); border: 1px solid var(--rule);
  font-size: var(--t-2xs); color: var(--ink-2);
}
.chip b { font-weight: 600; color: var(--ink-3); letter-spacing: .06em; text-transform: uppercase; font-size: 10px; }
.chip code { font-family: var(--mono); font-size: var(--t-2xs); color: var(--ink); }
.chip.fixture { background: var(--pending-soft); border-color: #ecd9b4; color: #7d5214; }
.chip.fixture b { color: #9a6a1d; }

.headline {
  margin-top: var(--s-5); padding: var(--s-4) var(--s-5);
  background: var(--paper-2); border: 1px solid var(--rule); border-radius: var(--r-md);
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--s-4);
}
.fig dt {
  font-size: var(--t-2xs); letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-3); font-weight: 600; margin-bottom: 4px;
}
.fig dd { font-family: var(--mono); font-size: var(--t-xl); letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.fig.was dd { color: var(--ink-3); text-decoration: line-through; text-decoration-thickness: 1px; }
.fig.delta dd { color: var(--resolved); }
.fig.delta.up dd { color: var(--pending); }
.fig small { display: block; margin-top: 4px; font-size: var(--t-2xs); color: var(--ink-3); letter-spacing: 0; font-family: var(--ui); }

.sec { margin-top: var(--s-6); }
.sec > h2 {
  font-size: var(--t-2xs); letter-spacing: .11em; text-transform: uppercase;
  color: var(--ink-3); font-weight: 600; padding-bottom: var(--s-2);
  border-bottom: 1px solid var(--rule);
}

.lines { margin-top: var(--s-2); font-size: var(--t-xs); }
.lines th {
  text-align: left; padding: var(--s-3) var(--s-2); font-size: var(--t-2xs);
  letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); font-weight: 600;
  border-bottom: 1px solid var(--rule); white-space: nowrap;
}
.lines td { padding: var(--s-3) var(--s-2); border-bottom: 1px solid var(--rule-2); vertical-align: top; }
.lines tbody tr { break-inside: avoid; }
.num { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
th.num { text-align: right; }
.sku { font-family: var(--mono); color: var(--ink-2); white-space: nowrap; }
.desc { min-width: 180px; overflow-wrap: anywhere; }
.desc .raw { display: block; color: var(--ink-4); font-size: var(--t-2xs); margin-top: 2px; overflow-wrap: anywhere; }

/* A row the review changed. The accent is the only colour on the table. */
tr.changed > td:first-child { box-shadow: inset 3px 0 0 var(--incoming); }
tr.changed { background: linear-gradient(90deg, var(--incoming-soft), transparent 62%); }
tr.open > td:first-child { box-shadow: inset 3px 0 0 var(--pending); }
tr.open { background: var(--pending-soft); }

.was { display: block; margin-top: 3px; color: var(--ink-3); font-size: var(--t-2xs); overflow-wrap: anywhere; }
.was s { color: var(--ink-4); text-decoration-thickness: 1px; }

.tag {
  display: inline-block; padding: 1px 7px; border-radius: 100px;
  font-size: 10px; letter-spacing: .06em; text-transform: uppercase; font-weight: 600;
  border: 1px solid transparent; white-space: nowrap;
}
.tag.corrected { background: var(--incoming-soft); color: var(--incoming); border-color: var(--incoming-edge); }
.tag.learned { background: var(--resolved-soft); color: var(--resolved); border-color: #bfe0d0; }
.tag.open { background: var(--pending-soft); color: var(--pending); border-color: #ecd9b4; }
.tag.clean { background: var(--paper-2); color: var(--ink-3); border-color: var(--rule); }

.totals { margin-top: var(--s-4); margin-left: auto; width: min(380px, 100%); font-size: var(--t-xs); }
.totals td { padding: var(--s-2); }
.totals td.num { width: 130px; }
.totals tr.grand td { border-top: 2px solid var(--ink); font-size: var(--t-md); padding-top: var(--s-3); }
.totals .lbl { color: var(--ink-2); }
.totals .prev { color: var(--ink-4); text-decoration: line-through; text-decoration-thickness: 1px; font-size: var(--t-2xs); display: block; }

.corr { margin-top: var(--s-2); font-size: var(--t-xs); }
.corr td, .corr th { padding: var(--s-3) var(--s-2); border-bottom: 1px solid var(--rule-2); vertical-align: top; }
.corr th {
  text-align: left; font-size: var(--t-2xs); letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-3); font-weight: 600; border-bottom: 1px solid var(--rule);
}
.corr tr { break-inside: avoid; }
.corr .why { color: var(--ink-2); overflow-wrap: anywhere; }
.corr .mv { font-family: var(--mono); overflow-wrap: anywhere; }
.corr .mv s { color: var(--ink-4); }

.empty {
  margin-top: var(--s-4); padding: var(--s-6) var(--s-5); text-align: center;
  border: 1px dashed var(--rule); border-radius: var(--r-md); background: var(--paper-2);
}
.empty h3 { font-size: var(--t-md); font-weight: 600; margin-bottom: var(--s-2); }
.empty p { color: var(--ink-3); font-size: var(--t-xs); max-width: 46ch; margin: 0 auto; }
.warn {
  margin-top: var(--s-4); padding: var(--s-3) var(--s-4);
  background: var(--pending-soft); border: 1px solid #ecd9b4; border-radius: var(--r-md);
  color: #7d5214; font-size: var(--t-xs);
}

.foot {
  margin-top: var(--s-6); padding-top: var(--s-4); border-top: 1px solid var(--rule);
  color: var(--ink-3); font-size: var(--t-2xs); display: flex; flex-wrap: wrap;
  gap: var(--s-2) var(--s-4); justify-content: space-between;
}
.foot code { font-family: var(--mono); overflow-wrap: anywhere; }

.legend { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-3); font-size: var(--t-2xs); color: var(--ink-3); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; border: 1px solid rgba(0,0,0,.06); }

@media print {
  @page { size: A4; margin: 13mm; }
  html, body { background: #fff; }
  body { font-size: 10pt; }
  .wrap { padding: 0; }
  .sheet { max-width: none; border: 0; border-radius: 0; box-shadow: none; }
  .pad { padding: 0; }
  /* Keep every mark that carries meaning. A printout that drops the change
     accents is a printout that no longer shows what changed. */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .sec, .headline, .empty, .warn { break-inside: avoid; }
  .sec { margin-top: 8mm; }
  thead { display: table-header-group; }
}
`;
