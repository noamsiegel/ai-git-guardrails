# Contributing to git-guardrails

Thanks for improving `git-guardrails`. This repo is a user-owned security and quality layer; keep changes portable, explicit, and hostile-repo-aware.

## How to report a bug

Open a [bug report](./.github/ISSUE_TEMPLATE/bug.md) with reproduction steps, expected behavior, actual behavior, and your environment.

## How to propose a feature

Open a [feature request](./.github/ISSUE_TEMPLATE/feature.md) with the problem, proposed solution, and alternatives considered.

## Development setup

`git-guardrails` is a portable lefthook config plus bash helpers for cross-repo personal hooks.

Dependencies:

```bash
brew install bash yq actionlint gitleaks lefthook
bun install -g @commitlint/cli
bun install
```

Use the local checkout as a hook fixture when possible; avoid weakening user-level checks based on repo-local configuration.

## Running tests

```bash
bun test tests/git-guardrails.test.ts
```

## Commit message format

Conventional Commits are recommended but not strictly required:

```text
fix: defend gitleaks config from repo allowlists
feat: add doctor check for hook overrides
```

## Pull request checklist

- [ ] Tests pass with `bun test tests/git-guardrails.test.ts`.
- [ ] Lint/security checks are clean.
- [ ] Documentation is updated when behavior changes.
- [ ] `CHANGELOG.md` is updated for user-visible changes.
