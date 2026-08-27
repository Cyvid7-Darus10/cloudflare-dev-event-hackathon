---
name: checking-team-updates
description: Use when resuming work on this repo, before starting a work session, before committing or opening a PR, or when the user says teammates are pushing — any point where the frozen contract or your workstream brief may have moved under you.
---

# Checking team updates

## Overview

Five people push to `main` during a two-hour build. The contract in
`plan/contract.md` and `src/shared/contracts.ts` is what everyone codes
against, and it has already been rewritten once mid-build.

**Core principle: check what moved before you write, not after.** Code built
against a dead contract is deleted, not adapted.

## When to use

- Starting or resuming a session
- Before your first edit of a stretch of work
- Before commit, push, or PR
- The user says "the team is pushing" / "check the repo"
- Anything that reads `plan/`, `architecture.md`, or `src/shared/contracts.ts`

## The check

```bash
git fetch --all --prune
git log --oneline HEAD..origin/main          # what landed
git diff --stat HEAD origin/main             # which files moved
```

Then, before anything else, read the diff of the files that redefine the work:

```bash
git diff HEAD origin/main -- plan/contract.md architecture.md src/shared/contracts.ts
```

## Triage what you find

| What moved | What it means |
|---|---|
| `architecture.md` | Highest authority. Read it first — it outranks the contract. |
| `plan/contract.md` or `src/shared/contracts.ts` | Cross-workstream shapes changed. Stop and re-read before writing. |
| `plan/0N-*.md` for **your** workstream | Your deliverables or file ownership changed. |
| Someone else's `src/` directory | Usually safe. Check only if you call into it. |
| `wrangler.jsonc`, `migrations/` | Siva. Never edit; rebase onto it. |

## Then sync

```bash
git pull --ff-only            # on main
git rebase origin/main        # on a feature branch
```

## Common mistakes

**Fetching but not reading the diff.** "2 commits behind" says nothing about
whether your contract still exists. Read the diff of the shape files.

**Adapting code built on the old contract.** If the shape changed, delete and
rebuild from tests. Adapted code keeps the old assumptions in the corners.

**Checking only at the start.** A two-hour build means checking again before
you commit. The pivot lands while you are typing.

**Editing another owner's file to unblock yourself.** Transcribe what you need,
say so in the PR, and let the owner's version win on conflict.

## Red flags

- "I'll just finish this function first"
- "The contract probably didn't change"
- "I'm only 2 commits behind"

All three mean: fetch and read the diff now.
