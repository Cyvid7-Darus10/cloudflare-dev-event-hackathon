import type { Decision, Flag, Match } from "../types";
import { FlagRow } from "./FlagRow";

interface ProductGroupProps {
  sku: string;
  productName: string;
  flags: Flag[];
  matches: Match[];
  onDecide: (decision: Decision) => void;
  onUndo: (flagId: string) => void;
}

/**
 * One product's flags, with its agreements folded away underneath.
 *
 * The matches are present but quiet. A reviewer needs to see that most fields
 * agreed, without reading them.
 */
export function ProductGroup({
  sku,
  productName,
  flags,
  matches,
  onDecide,
  onUndo,
}: ProductGroupProps) {
  const open = flags.filter((f) => f.state === "pending").length;

  return (
    <section className="product">
      <header className="product__head">
        <span className="product__sku">{sku}</span>
        <span className="product__name">{productName}</span>
        <span className="product__tally">
          {open === 0 ? "all resolved" : `${open} to review`}
        </span>
      </header>

      {flags.map((flag) => (
        <FlagRow key={flag.id} flag={flag} onDecide={onDecide} onUndo={onUndo} />
      ))}

      {matches.length > 0 && (
        <details className="matches">
          <summary>
            {matches.length} {matches.length === 1 ? "field agrees" : "fields agree"}
          </summary>
          <div className="matches__list">
            {matches.map((m) => (
              <div className="matches__row" key={`${m.sku}-${m.field}`}>
                <b>{m.field}</b>
                <span>{m.value}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
