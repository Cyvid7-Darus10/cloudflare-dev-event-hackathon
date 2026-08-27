# Review UI

Workstream 3. Owner: Cyrus.

The screen where a person triages the differences between a customer's document
and our standard.

```bash
cd ui
npm install
npm run dev     # http://localhost:5180
```

Vite binds IPv6 first, so use `localhost` rather than `127.0.0.1`.

## It runs on a fixture

`src/fixture.ts` holds one realistic review: 8 products, 20 flags, 18 matching
fields. Nothing here calls a server, so this screen is finished and demoable
before extraction or the standard exist.

The mix is deliberate. Real reconciliation is mostly agreement with a handful of
boring disagreements: a unit written two ways, a trailing space, a rounded
number. A fixture full of dramatic conflicts would produce a screen designed for
a case that does not happen.

## Wiring it up

`src/types.ts` is this screen's reading of `plan/contract.md`. It is a proposal,
not a decision. If the team lands on different field names, change them there
and the compiler will point at everything that follows.

To go live, replace the `useState(fixture.flags)` in `App.tsx` with state from
owner 2 and send `Decision` objects back. Nothing else changes.

## Three decisions worth keeping

**Values are mono.** `12.5 cm` and `12.5cm` differ by one character. In a
proportional face a reviewer cannot see which, and has to open the original
document. That is the tool failing.

**Both values are always shown.** A flag that says "mismatch" without showing
what arrived is a prompt to go and look somewhere else.

**Nothing commits until the review is sent.** Every decision has an Undo, and
the send button stays disabled while anything is unresolved. Reviewers misclick,
and the standard is the thing that must not be corrupted.

## Not done yet

- No connection to owner 2. Decisions live in component state.
- `Send review` is inert. It needs owner 2's endpoint.
- Matching fields are listed but not searchable. Fine at 18, wrong at 500.
- No keyboard shortcuts. Worth it if a reviewer works through 40 flags.
