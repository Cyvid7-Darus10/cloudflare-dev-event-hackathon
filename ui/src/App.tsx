import { useMemo, useState } from "react";
import { fixture } from "./fixture";
import type { Decision, Flag } from "./types";
import { ProductGroup } from "./components/ProductGroup";

type Filter = "open" | "all" | "done";

export default function App() {
  /* The fixture stands in for owner 2. When the standard is live, this state
     comes from it and decisions go back over the wire. Nothing else here
     changes. */
  const [flags, setFlags] = useState<Flag[]>(fixture.flags);
  const [filter, setFilter] = useState<Filter>("open");

  const decide = ({ flagId, state, value }: Decision) =>
    setFlags((prev) =>
      prev.map((f) =>
        f.id === flagId
          ? { ...f, state, resolvedValue: state === "edited" ? value ?? undefined : undefined }
          : f
      )
    );

  const undo = (flagId: string) =>
    setFlags((prev) =>
      prev.map((f) =>
        f.id === flagId ? { ...f, state: "pending", resolvedValue: undefined } : f
      )
    );

  const open = flags.filter((f) => f.state === "pending").length;
  const done = flags.length - open;
  const pct = flags.length === 0 ? 0 : Math.round((done / flags.length) * 100);

  const visible = useMemo(() => {
    if (filter === "open") return flags.filter((f) => f.state === "pending");
    if (filter === "done") return flags.filter((f) => f.state !== "pending");
    return flags;
  }, [flags, filter]);

  /* Grouped by product, in the order the products first appear, so the list
     does not reshuffle as decisions land. */
  const groups = useMemo(() => {
    const order: string[] = [];
    const bySku = new Map<string, Flag[]>();
    for (const f of visible) {
      if (!bySku.has(f.sku)) {
        bySku.set(f.sku, []);
        order.push(f.sku);
      }
      bySku.get(f.sku)!.push(f);
    }
    return order.map((sku) => ({
      sku,
      productName: bySku.get(sku)![0].productName,
      flags: bySku.get(sku)!,
      matches: fixture.matches.filter((m) => m.sku === sku),
    }));
  }, [visible]);

  const received = new Date(fixture.receivedAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="shell">
      <header className="masthead">
        <p className="masthead__doc">
          <span>{fixture.documentName}</span>
          <span>·</span>
          <span>{received}</span>
        </p>
        <h1>{fixture.customerName}</h1>
        <p>
          We compared this document against the standard. Everything that matched
          passed through. What did not is below, with both values shown. Nothing
          changes the standard until you send the review.
        </p>
      </header>

      <div className="summary">
        <div className="progress">
          <div className="progress__label">
            <span>
              <b>{done}</b> of <b>{flags.length}</b> resolved
            </span>
            <span>{pct}%</span>
          </div>
          <div
            className="progress__track"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={flags.length}
            aria-label="Flags resolved"
          >
            <div className="progress__fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="filters">
          <button aria-pressed={filter === "open"} onClick={() => setFilter("open")}>
            To review <span className="count">{open}</span>
          </button>
          <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="count">{flags.length}</span>
          </button>
          <button aria-pressed={filter === "done"} onClick={() => setFilter("done")}>
            Resolved <span className="count">{done}</span>
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <b>{filter === "open" ? "Nothing left to review" : "Nothing here yet"}</b>
          {filter === "open"
            ? "Every flag on this document has been resolved. Send the review to update the standard."
            : "Resolve a flag and it will appear here."}
        </div>
      ) : (
        groups.map((g) => (
          <ProductGroup key={g.sku} {...g} onDecide={decide} onUndo={undo} />
        ))
      )}

      <div className="bar">
        <div className="bar__inner">
          <span className="bar__note">
            {open > 0 ? (
              <>
                <b>{open}</b> still to review. Decisions are reversible until you send.
              </>
            ) : (
              <>
                All <b>{flags.length}</b> resolved. Sending updates the standard and
                produces the document.
              </>
            )}
          </span>
          <button className="bar__cta" disabled={open > 0}>
            Send review
          </button>
        </div>
      </div>
    </div>
  );
}
