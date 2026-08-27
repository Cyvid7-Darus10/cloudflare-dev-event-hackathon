# C. Match, diff, and write-back

**Michelle owns this.**

**You own:** matching each invoice line to a SKU, the field-by-field diff that
produces flags, and the functions that write a reviewer's decision back into
the standard.

This is the centre of the project. The demo's payoff — invoice B auto-matches
because invoice A taught the catalogue an alias — is this file.

The standard does **not** live in a Durable Object. It lives in D1, with a KV
snapshot on the hot path and Vectorize for names that hit no SKU and no alias.
Zuriel's DO holds the review session and *calls* your write-back functions.

## Deliver

- Pure matcher: `(ExtractedInvoice, standard) → LineReview[]`. No network in
  the diff half. Unit-test this against `fixtures/`.
- Match order, first hit wins — see `contract.md`.
- Diff rules — see `contract.md`. A stale price, a UOM difference, an
  arithmetic error, and an unmatched line must each produce the expected flag.
- Vectorize seed script for the catalogue (or the in-Worker cosine fallback
  if Siva calls Vectorize cut).
- Write-back functions Zuriel will call on resolution. They, and only they,
  mutate D1 / Vectorize / KV.

## The interface you must honour

In: an `ExtractedInvoice` from Bryan, plus the catalogue.
Out: `LineReview[]` for Zuriel to seed the DO.
Write-back in: a resolved `LineReview` (and the flag actions that built
`finalValues`). Out: updated D1 row, alias, audit, Vectorize upsert, KV purge.

## What you can stub

Bryan entirely. `fixtures/invoice-a.json` plus `fixtures/standard.json` are
enough. Zuriel and Cyrus are not your problem until T+70.

## First stretch (T+10–70)

The diff, against the two fixtures. No D1 yet, just functions. That function
is the product. Then seed D1 from `standard.json` once Siva's migration lands.

## Watch for

- **Do not let anything except `accept_document` or `edited` write to the
  standard.** Not extraction, not the model, not a convenience path at T+100.
  `accept_standard` only fills `finalValues` for the published PDF.
- **Accepting a `description` mismatch is the learning loop.** Insert the
  vendor's wording into `standard_aliases` and upsert the embedding. If you
  skip the alias, invoice B will flag again and the demo has no punchline.
- **Price mismatch reason must mention money.** Delta and `delta × quantity`.
  Judges read the reason string.
- **KV snapshot is a cache.** Write-back purges it. Stale KV is a silent
  wrong match on invoice B.
- **Fallback:** if Vectorize is cut, cosine-similarity over ~40 embeddings in
  the Worker. Same 0.82 threshold. Exact and alias still carry the demo.

## Done when

- Fixture A produces a stale price flag, a UOM flag, an arithmetic flag, and
  an unmatched-name flag.
- `accept_document` on the name writes an alias; a second pass over invoice B
  (same odd wording) returns `matchMethod: "alias"` and no description flag.
- `accept_standard` leaves D1 untouched.
- Both mutating paths insert a `standard_versions` row.
