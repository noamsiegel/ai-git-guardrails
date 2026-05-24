# git-guardrails Roadmap

> Current architecture history and next deepening opportunities. Load-bearing
> invariants live in `CONTEXT.md`; release history lives in `CHANGELOG.md`.

## Current state (v0.9.x)

`git-guardrails` is a single-file Bash CLI plus shipped assets:

- `git-guardrails` — CLI, hook install/uninstall/run/doctor flows
- `checks/registry.sh` — shell-readable shipped safety-check registry
- `checks/*.sh` — concrete safety checks used by the shipped baseline
- `lefthook.yml` — internal execution adapter for shipped hook checks
- `gitleaks.toml`, `commitlint.config.cjs` — shipped tool baselines
- `tests/git-guardrails.test.ts` — fixture tests over real temp repos

The product boundary is a user-owned safety baseline. Repo-specific lint,
format, typecheck, and test policy belongs in repo-owned hook config or CI.

## Architecture already delivered

### v0.4.0 — Hook-state classifier

- Introduced `_classify_hook` and `_classify_repo_hooks` as the source of hook ownership state.
- Routed install, uninstall, and doctor behavior through stable state words.
- Added classifier coverage for absent, owned, non-owned, opt-out, and hooksPath-shadowed states.

### v0.5.0 — Doctor unification and lifecycle coverage

- Made `_audit_repo` emit structured records consumed by both current-repo `doctor` and `doctor --all`.
- Added lifecycle coverage for install, uninstall, force install, skipped hooks, doctor agreement, and global template generation.

### v0.6.0 — Compose-shim contract

- Centralized embedded, standalone, and bypass-help snippets in `_compose_snippet`.
- Preserved `"$@"`, stdin, and blocking exit behavior across generated and pasted hooks.
- Added adapter tests for argument forwarding, pre-push stdin, and non-zero propagation.

### v0.7.0 — Universal checks registry

- Added `checks/registry.sh` as the source of shipped check metadata.
- Built doctor reachability and bypass-help from registry entries.
- Added parity tests for registry field shape, skip envs, and doctor tool output.

### v0.9.x — Clean product boundary

- Completed the `git-guardrails` naming cutover.
- Removed Python and TS/JS language gates from the shipped default baseline.
- Documented per-repo language hook patterns in `docs/PER_REPO_HOOKS.md`.
- Renamed the all-check bypass env to `GIT_GUARDRAILS_SKIP`.

## Current target shape

### Domain layer

```text
_classify_hook <hooks_dir> <hook>       → absent | ours | non-ours | shadowed | opt-out
_classify_repo_hooks <repo>             → normalized hook-state records
_audit_repo <repo>                      → one normalized repo audit record
_compose_snippet <hook> <mode>          → canonical hook shim text
checks/registry.sh                      → shipped safety-check metadata
```

### Adapter layer

- Filesystem hook inspection stays behind `_classify_*`.
- `git config core.hooksPath` inspection stays behind `_classify_repo_hooks` / `_audit_repo`.
- External tools (`lefthook`, `gitleaks`, `commitlint`, `fallow`) are invoked only through `cmd_run` and concrete check scripts.
- Repo-owned language/toolchain hooks are documented examples, not shipped adapters.

### CLI layer

`cmd_install`, `cmd_uninstall`, `cmd_doctor`, `cmd_doctor_all`, and
`cmd_global_template` should render or mutate from domain records instead of
re-inferring hook state or check metadata.

## Next deepening candidates

### 1. Record codec locality

**Problem**: Unit-separator records are load-bearing, but emit/parse logic is still manual in several call sites.

**Direction**: Add tiny private helpers for classifier/audit record emit and parse. Keep Bash and the current separator; do not introduce a broad serialization layer.

**Acceptance**:

- Empty fields round-trip without shifting columns.
- Field counts are asserted in tests.
- Current classifier and doctor tests still pass.

### 2. Discovery/render split

**Problem**: Some command functions still mix discovery, category decisions, and output rendering.

**Direction**: Make `_audit_repo` produce complete normalized facts once; make install/doctor renderers consume those facts.

**Acceptance**:

- Current-repo doctor and `doctor --all` classification cannot drift for the same fixture.
- Install conflict guidance consumes classifier/audit state instead of ad hoc hooksPath checks.
- Lifecycle tests remain fixture-based.

### 3. Registry execution contract

**Problem**: `checks/registry.sh` owns metadata, while execution details still live across `lefthook.yml`, `cmd_run`, README, and tests.

**Direction**: Deepen the registry just enough to express shipped safety-check execution mode, such as `lefthook` versus direct pre-push stdin handling. Keep it universal-only; do not add plugin behavior.

**Acceptance**:

- Branch-guard's direct pre-push stdin path is represented as registry data.
- README rows and lefthook command coverage have parity tests against the registry.
- Adding/removing a shipped safety check has one obvious edit point plus generated/parity artifacts.

### 4. Documentation routing

**Problem**: Architecture facts are split across `CONTEXT.md`, `ROADMAP.md`, README, and changelog. Drift can mislead future agents.

**Direction**: Keep `CONTEXT.md` as invariants/ADRs, `CHANGELOG.md` as release history, README as user surface, and this file as current target shape plus next candidates.

**Acceptance**:

- No stale version-labeled “current state” sections.
- No completed milestone listed as future work.
- Architecture candidates cite current files and current public API names.

## Non-goals

- No project-specific lint, format, typecheck, test suites, or plugin-defined checks in the shipped baseline.
- No plugin system inside git-guardrails; git-guardrails is itself a plugin into hook orchestrators.
- No repo-local opt-out marker.
- No shared cross-repo Bash helper library until a second concrete consumer needs the same API.

## Open questions

- Should Homebrew-core graduation still matter after the tap-based workflow is stable?
- Should `fallow` remain a universal safety gate or move to per-repo guidance like other JS/TS quality tools?
