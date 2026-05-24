# Changelog

All notable changes to this project will be documented in this file.

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
