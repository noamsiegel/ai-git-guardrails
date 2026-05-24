# git-guardrails Roadmap

> Target architecture and quarterly milestones, derived from the
> `improve-codebase-architecture` audit on 2026-05-23.

## Current state (v0.3.4)

Single-file bash CLI (~700 LOC) + shipped assets in `checks/`, `lefthook.yml`,
`commitlint.config.cjs`, `gitleaks.toml`. The 2026-05 audit found these
structural issues (ordered by leverage):

1. **Hook state inferred 4 different ways** across `cmd_install` (lines 177–191), `cmd_uninstall` (lines 223–247), `_audit_repo` (lines 469–480), and `_is_ai_git_guardrails_hook`. Same domain concept (absent/ours/non-ours/shadowed/opt-out), four implementations.
2. **`doctor --all` duplicates `doctor`** logic with a coarser classifier — invites drift where current-repo doctor says `present (not ours)` while `--all` buckets the same repo as `bypass`.
3. **Stale legacy personal-hooks references** in `lefthook.yml`, `tests/git-guardrails.test.ts`, and `tests/git-guardrails.test.ts:303-310` (which shells out to the renamed PAI doctor path that no longer exists).
4. **Compose-shim contract scattered** — `_generate_shim`, install help text, doctor `--all` bypass help, and the wt global hook bridge all emit slightly different paste-snippets with different `"$@"` / stdin / abort semantics.
5. **Universals-only boundary is prose-only** — README + lefthook.yml + `cmd_doctor` tool list duplicate the same set of checks; no single registry.
6. **Tests over-cover checks, under-cover lifecycle** — 8 branch-guard cases, near-zero coverage of install/uninstall/migrate/global-template.

## Target architecture

### Domain layer

```
_classify_hook <hooks_dir> <hook>  → one of: absent | ours | non-ours | shadowed | opt-out
_classify_repo_hooks <repo>        → TSV: hook owner path hooksPath opt-out
_compose_snippet <hook> <mode>     → canonical paste shim (one source of truth)
_universal_check_registry          → tiny data file consumed by lefthook + doctor + README
```

### Adapter layer

- Filesystem: only `_classify_*` reads hook files
- `git config`: only `_classify_repo_hooks` reads `core.hooksPath`
- lefthook/gitleaks/commitlint: only `cmd_run` invokes them

### CLI layer

`cmd_install` / `cmd_uninstall` / `cmd_doctor` / `cmd_doctor_all` / `cmd_migrate`
all consume classifier records and render. `doctor --all` is
`for repo in $(_find_git_repos); do _classify_repo_hooks "$repo"; done`
with a summary renderer over the same data.

## Milestones

### v0.4.0 — Stale-ref cleanup + hook classifier (Q1)

**Goals**

Part A (mechanical):
- Remove legacy personal-hooks defaults from `lefthook.yml` (legacy stays only in `cmd_migrate` README section).
- Fix `tests/git-guardrails.test.ts:303-310` to call `git-guardrails doctor --all` instead of the renamed PAI path.
- Update legacy test fixtures to use `XDG_CONFIG_HOME` + temp dirs, not legacy personal-hooks state.

Part B (foundation):
- Introduce `_classify_hook` and `_classify_repo_hooks` returning stable state words.
- `cmd_install`, `cmd_uninstall`, `_audit_repo`, `_is_ai_git_guardrails_hook` all route through the classifier.
- Add table-style tests for each classifier state.

**Files**
- `git-guardrails` (the binary)
- `lefthook.yml`
- `tests/git-guardrails.test.ts`

**Acceptance**
- All existing 22 tests still pass.
- New classifier returns correct state for: absent / git-guardrails-marked / non-ours / opt-out / local-hooksPath-bypass / global-hooksPath-bypass.
- The legacy personal-hooks path string appears only in migration help text.
- `git-guardrails --version` reports 0.4.0.

### v0.5.0 — Doctor unification + lifecycle tests (Q2)

**Goals**
- `_audit_repo` returns a structured record; both `cmd_doctor` and `cmd_doctor_all` render from it.
- Rebalance tests: collapse redundant branch-guard cases into table tests; add install/uninstall/migrate/global-template lifecycle fixtures.

**Acceptance**
- Per-repo doctor and `doctor --all` always agree on classification for the same repo.
- Lifecycle test count ≥ check test count.

### v0.6.0 — Compose-shim contract (Q3)

**Goals**
- `_compose_snippet <hook> <mode>` becomes the single source for paste-shims.
- Install warnings, doctor help, README examples, generated globals all call it.
- Document the contract: blocking vs advisory, `"$@"` preserved, stdin preserved for pre-push.

**Acceptance**
- All shim text in the repo (binary, README, generated globals) emits from `_compose_snippet`.
- Adapter fixture proves a non-zero `git-guardrails run` aborts by default and pre-push stdin reaches `branch-guard`.

### v0.7.0 — Universals registry (Q4)

**Goals**
- Tiny shell-readable data file naming each check: hook, command, skip env, required tools, rationale.
- `cmd_doctor` tool reachability list and lefthook.yml comments generated from / cross-checked against it.

**Acceptance**
- Adding/removing a universal check is one registry edit.
- Test asserts every skip env in registry exists in lefthook config (no orphans).

## Non-goals

- **No per-repo lint/format/typecheck.** The universals-only boundary IS the product.
- **No plugin system inside guardrails.** git-guardrails IS a plugin into other hook orchestrators (the compose-shim).
- **No migration of legacy hooks framework** beyond what `cmd_migrate` does today.

## Open questions

- **bats vs TypeScript tests**: README claims bats; suite is TypeScript. Decide one for v0.5.0 lifecycle work.
- **Homebrew-core graduation**: candidate after v0.5.0 if adoption signal exists.
