import { useState } from "react";
import type { Decision, Flag } from "../types";
import { winningValue } from "../types";

interface FlagRowProps {
  flag: Flag;
  onDecide: (decision: Decision) => void;
  onUndo: (flagId: string) => void;
}

const KIND_LABEL: Record<Flag["kind"], string> = {
  mismatch: "differs",
  "unknown-field": "new field",
  missing: "not in document",
};

/** Both sides of one disagreement, and the three ways to end it. */
export function FlagRow({ flag, onDecide, onUndo }: FlagRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    flag.customerValue ?? flag.standardValue ?? ""
  );

  const resolved = flag.state !== "pending";
  const won = winningValue(flag);

  /* Which box won, so the other can be struck through. An edited value beat
     both, so neither box wins outright. */
  const customerWon = resolved && flag.state === "accepted";
  const standardWon = resolved && flag.state === "rejected";

  const commitEdit = () => {
    const value = draft.trim();
    if (!value) return;
    onDecide({ flagId: flag.id, state: "edited", value });
    setEditing(false);
  };

  return (
    <div className="flag" data-state={flag.state}>
      <div className="flag__top">
        <span className="flag__field">{flag.field}</span>
        <span className={`kind kind--${flag.kind}`}>{KIND_LABEL[flag.kind]}</span>
        {resolved && (
          <span className="flag__done">
            ✓ {flag.state === "edited" ? "corrected" : "resolved"}
            {flag.state === "edited" && won ? `: ${won}` : ""}
          </span>
        )}
      </div>

      <div className="values">
        <Value
          label="Their document"
          value={flag.customerValue}
          emptyNote="not mentioned"
          incoming
          won={customerWon}
          lost={resolved && !customerWon}
        />
        <Value
          label="Our standard"
          value={flag.standardValue}
          emptyNote="never held this field"
          won={standardWon}
          lost={resolved && !standardWon}
        />
      </div>

      {!resolved && !editing && (
        <div className="actions">
          {flag.customerValue !== null && (
            <button
              className="act act--take"
              onClick={() =>
                onDecide({ flagId: flag.id, state: "accepted", value: flag.customerValue })
              }
            >
              Use theirs
            </button>
          )}
          <button
            className="act"
            onClick={() =>
              onDecide({ flagId: flag.id, state: "rejected", value: flag.standardValue })
            }
          >
            Keep ours
          </button>
          <button className="act" onClick={() => setEditing(true)}>
            Write a correction
          </button>
        </div>
      )}

      {!resolved && editing && (
        <div className="editor">
          <input
            autoFocus
            value={draft}
            aria-label={`Corrected value for ${flag.field}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button className="act act--take" onClick={commitEdit} disabled={!draft.trim()}>
            Save
          </button>
          <button className="act" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      )}

      {resolved && (
        <div className="actions">
          {/* Reviewers misclick. Nothing commits until the whole review is
              sent, so every decision stays reversible until then. */}
          <button className="act act--undo" onClick={() => onUndo(flag.id)}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

interface ValueProps {
  label: string;
  value: string | null;
  emptyNote: string;
  incoming?: boolean;
  won?: boolean;
  lost?: boolean;
}

/** One side of the comparison. Mono, so a trailing space is visible. */
function Value({ label, value, emptyNote, incoming, won, lost }: ValueProps) {
  const cls = [
    "value",
    incoming ? "value--incoming" : "",
    won ? "value--won" : "",
    lost ? "value--lost" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className="value__label">{label}</div>
      <div className="value__text">
        {value === null ? <span className="value__empty">{emptyNote}</span> : value}
      </div>
    </div>
  );
}
