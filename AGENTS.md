# AGENTS.md

This file orients agents working on **ai-git-guardrails** itself. Read `CONTEXT.md` for load-bearing invariants: user-owned safety, marker-only uninstall, classifier-owned hook state, compose-snippet semantics, and universals-only registry. See `README.md` for the user-facing surface.

## How to work here

- Code edits usually go in `ai-git-guardrails` (bash CLI), `checks/*.sh` (concrete checks), or `checks/registry.sh` (check metadata).
- Keep hook-state logic centralized in `_classify_hook`, `_classify_repo_hooks`, and `_audit_repo`. Do not re-infer ownership or hooksPath state in command renderers.
- Keep generated hook text centralized in `_compose_snippet`; installed hooks, conflict help, doctor help, and README examples must preserve `"$@"`, stdin, and blocking exit behavior.
- Keep universal check metadata in `checks/registry.sh`; update README, `lefthook.yml`, and tests when registry entries change.
- Run `bun test tests/ai-git-guardrails.test.ts` for behavior changes. Run `bash -n ai-git-guardrails checks/registry.sh checks/*.sh` for shell syntax changes.
- Never add a repo-local opt-out marker. Repos must not be able to disable user-owned safety checks by committing a file.
- Never make uninstall delete hooks unless `_classify_hook` returns `ours`.
- Never weaken shipped config baselines in favor of repo-local config.
- Dogfood `ai-trace`: AI-authored PRs must run `ai-trace pr-attach` and carry exactly one `🤖 ai-trace:` marker; direct emergency pushes without a PR must run `ai-trace gist-create` or `ai-trace collect` for local audit evidence.

## Docs index

Manual docs list:

- `README.md` — install, command surface, shipped checks, bypasses, security properties, concise comparison.
- `CONTEXT.md` — architecture map, invariants, real vs hypothetical seams, ADRs.
- `ROADMAP.md` — architecture audit history, target shape, milestones, non-goals.
- `CHANGELOG.md` — release history and migration decisions.
- `docs/COMPARISON.md` — detailed landscape versus hook orchestrators and secret scanners.
- `CONTRIBUTING.md` — contribution workflow.
- `SECURITY.md` — vulnerability reporting.

<!-- INDEX:START -->
<!-- Placeholder for future agents-toc-managed index. Do not hand-edit if this repo installs agents-toc. -->
<!-- INDEX:END -->
