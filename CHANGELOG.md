# Changelog

All notable changes to this project will be documented in this file.

## [0.8.1] — doctor path + opt-out hotfix + architecture docs

### Added
- `CONTEXT.md` with load-bearing invariants, module map, real vs hypothetical seams, public CLI stability, and ADRs.
- `AGENTS.md` orienting agents working on this repo itself.
- `docs/COMPARISON.md` with full narrative competitor analysis (pre-commit, lefthook, Husky, Githooks, Overcommit, Gitleaks, TruffleHog).

### Changed
- `README.md` competitor section reformatted to the agents-toc-style table (`Tool | Verb | What it writes | When it runs`) and links to the new comparison doc.
- Added explicit `## What it doesn’t do` section.

### Fixed
- `_find_git_repos` now uses null-delimited `find` output so `doctor --all` preserves repo paths containing spaces instead of splitting them around line 645.
- `cmd_run` now calls `_repo_is_opted_out` around line 420, preserving canonical-path opt-out behavior for symlinked or otherwise non-canonical repo paths.

## [0.8.0] — ai-git-guardrails rename

### Breaking
- CLI binary is now `ai-git-guardrails`; generated hooks now call `ai-git-guardrails run <hook>`.
- Fresh installs use marker `# ai-git-guardrails-managed: ai-git-guardrails.v0`, config dir `~/.config/ai-git-guardrails/`, and `AI_GIT_GUARDRAILS_*` env vars.

### Changed
- Renamed in-repo source, tests, docs, workflow references, lefthook defaults, and registry variables from the old name to `ai-git-guardrails`.
- `checks/registry.sh` now exports `AI_GIT_GUARDRAILS_CHECKS`, `AI_GIT_GUARDRAILS_REQUIRED_TOOLS`, and `AI_GIT_GUARDRAILS_OPTIONAL_TOOLS`.

### Migration
- Existing hooks with legacy marker `# guardrails-managed: guardrails.v0` are still classified as ours, so `ai-git-guardrails uninstall` can remove old installs safely instead of reporting non-ours conflicts.
- `GUARDRAILS_TEMPLATES` and `GUARDRAILS_PATH` remain backward-compatible fallbacks when the new `AI_GIT_GUARDRAILS_*` env vars are absent.
- If `~/.config/guardrails/` exists and `~/.config/ai-git-guardrails/` does not, the CLI reads the old config dir and warns to move it.

## [0.7.0] — universals registry

### Added
- `checks/registry.sh` is the shell-readable source of truth for universal checks, skip env vars, required tools, optional tools, and rationale.
- Registry tests cover loadability, field shape, lefthook skip-env cross-checks, required tool reachability, and doctor reachability output parity.

### Changed
- `guardrails doctor` builds tool reachability from the registry instead of a hardcoded list.
- `_compose_snippet <hook> bypass-help` builds per-check skip-env hints from the registry.
- `lefthook.yml` and README now cross-reference the registry-backed universal check list.

## [0.6.0] — compose-shim contract

### Added
- `_compose_snippet <hook> <mode>` centralizes embedded, standalone, and bypass-help hook snippets.
- Compose-snippet tests cover argument forwarding, pre-push stdin preservation, exit-code propagation, bypass-help shell syntax, and invalid modes.

### Changed
- Installed hooks, install conflict guidance, doctor bypass guidance, and README examples now share the same canonical compose contract.

## [0.5.0] — doctor unification + lifecycle coverage

### Added
- `_audit_repo` now emits one structured TSV record consumed by both current-repo `doctor` and `doctor --all`.
- Lifecycle tests cover install, uninstall, force install, skipped hooks, migration dry-run/apply, doctor detail/summary agreement, and global template generation.

### Changed
- `doctor --all` uses the same classifier-derived categories as `doctor`: installed, not-installed, bypass-other, and opt-out.
- `guardrails install` always sets local `core.hooksPath` to the repo hooks directory it manages.
- Branch guard, large-file, and commitlint checks are table-driven where behavior was redundant.

## [0.4.0] — stale-ref cleanup + hook classifier

### Added
- `_classify_hook` and `_classify_repo_hooks` centralize hook ownership state for install, uninstall, and doctor audit flows.
- Classifier coverage for absent, guardrails-owned, non-guardrails, opt-out, and hooksPath-shadowed hooks.

### Changed
- `lefthook.yml` now resolves shipped assets through `${GUARDRAILS_TEMPLATES:-$HOME/.config/guardrails/templates}` instead of the legacy personal-hooks path.
- Tests now exercise `guardrails doctor --all --root <tmpdir>` directly for worktree detection and use hermetic XDG config directories.
## [0.3.4] — hotfix: trap unbound-variable in pre-push

### Fixed
- `cmd_run pre-push` set `trap 'rm -f $tmp' EXIT` with single quotes, deferring expansion. When the trap fired (after the function returned), `$tmp` was out of scope and `set -u` aborted with "tmp: unbound variable". Now double-quoted to expand at trap-set time.

## [0.3.3] — guardrails doctor --all (multi-repo audit)

### Added
- `guardrails doctor --all [--root <path>]` walks a root and reports per-repo install state (installed / not-installed / bypass / opt-out) with a suggested fix for bypass repos.
- `pai-hooks doctor` is now a deprecation shim that forwards to `guardrails doctor --all`.

## [0.3.2] — version-sync hotfix

Bump GUARDRAILS_VERSION constant to match tag (was stuck at 0.3.0).

## [0.3.1] — stale state cleanup

### Removed
- Obsolete v0.2.x entry shim files: `pre-commit`, `pre-push`, `commit-msg` (replaced by the `guardrails` binary).
- `package.json` + `bun.lock` (no longer needed; the binary ships its own commitlint config from `pkgshare`).
- `skill/` subdirectory (the multi-repo audit skill lives in `~/.pai/skills/guardrails/` on the user's machine, not in the public repo).

### Changed
- README rewritten to reflect the binary install model (per-repo `guardrails install` only).

## [0.3.0] — real CLI binary (per-repo install, ownership marker)

### Breaking
- guardrails is now a proper CLI binary, not a directory you point `core.hooksPath` at.
- The previous global-hooksPath install model is replaced by per-repo `guardrails install`.

### Added
- **`guardrails install`** — installs hooks into the current repo's `.git/hooks/` with ownership marker. Sets local `core.hooksPath` to override any global setting (e.g. wt). Detects existing hook systems (Husky, lefthook, pre-commit framework, custom `.githooks/`) and prints a one-line compose snippet instead of clobbering.
- **`guardrails uninstall`** — removes only guardrails-managed hooks (marker-based). Restores `core.hooksPath` to global default if no other hooks remain.
- **`guardrails run <hook>`** — the actual hook logic, invoked by installed shims. Delegates to `lefthook run` with shipped config.
- **`guardrails doctor`** — audits the current repo + tool reachability under sanitized PATH.
- **`guardrails migrate [--apply]`** — migrates from legacy global-hooksPath install. Defaults to dry-run; `--apply` performs the migration.
- **`guardrails --global-template`** — wires `git init.templateDir` so new clones auto-install guardrails hooks.
- **`--force` flag** on install to override conflicts.
- **`--skip <hook>` flag** to install a subset.

### Security
- Generated hooks contain a stable ownership marker (`# guardrails-managed: guardrails.v0`).
- Install uses `rm -f` before write to prevent symlink-target overwrites (a destructive pattern from the legacy install model).
- `core.hooksPath`-conflict detection refuses install by default with a useful error.

## [0.2.0] — integration + portability + governance

### Added
- XDG `init.sh` support in entry shims (asdf/mise/nvm/volta compatibility).
- `branch-guard` reads `protected_refs` from wt config when running inside a wt-managed repo.
- OSS governance: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, ISSUE_TEMPLATE, PR template, CODEOWNERS.
- Release CI workflows (test on PR + workflow_dispatch semver release).

## [0.1.0] — initial public release

### Added
- Universal `pre-commit` checks: gitleaks, actionlint (on workflow files), large-files (staged-blob).
- `commit-msg`: commitlint with Conventional Commits.
- `pre-push` checks: branch-guard (list or regex), fallow audit (JS/TS only).
- Portable lefthook config that consumers can `extends:` via `GUARDRAILS_HOME` env var.
- `pai-hooks doctor` skill (Bun/TS) audits coverage across all local repos.
- 22-test bun-test suite.

### Security hardening (vs naive lefthook setups)
- User-owned gitleaks baseline that defeats hostile repo `.gitleaks.toml`.
- `git cat-file -s` staged-blob check (no worktree-truncation bypass).
- No in-repo opt-out marker — repos cannot disable user-level checks.
- PATH sanitization at hook entry; override via `GUARDRAILS_PATH`.
- Env-var bypass requires explicit `SKIP_*` per check (not ambient state).

### Known limitations
- macOS-tested. Linux probably works but untested in CI.
- bash >= 4 required.
- `commitlint` requires `@commitlint/config-conventional` resolvable from the lefthook config. Local install via `bun install` in this directory creates `node_modules/` for that.
