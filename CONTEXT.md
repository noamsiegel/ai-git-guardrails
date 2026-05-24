# ai-git-guardrails CONTEXT

Architecture context for agents (human and AI) working on ai-git-guardrails itself.
For user documentation see `README.md`, `docs/*`, and `ROADMAP.md`.

## Load-bearing invariants

These do not change without a major version bump.

1. **User-owned safety layer**: repo contents must not be able to disable ai-git-guardrails. Runtime opt-out is read from `~/.config/ai-git-guardrails/.opt-out` (`AI_GIT_GUARDRAILS_OPT_OUT`) in `_repo_is_opted_out` and `cmd_run`; there is deliberately no in-repo opt-out marker.
2. **Ownership-marker uninstall**: uninstall removes only hooks classified as ours. `_classify_hook` recognizes the current marker `# ai-git-guardrails-managed: ai-git-guardrails.v0` and the legacy `# guardrails-managed: guardrails.v0`; `cmd_uninstall` deletes only the `ours` state.
3. **Conflict-aware install**: `cmd_install` refuses unsafe local `core.hooksPath` overrides and non-owned hook files unless `--force` is explicit. Existing Husky, lefthook, pre-commit framework, and custom `.githooks/` surfaces are detected by `_detect_hook_systems` and receive compose guidance instead of silent clobbering.
4. **Classifier is the source of hook state truth**: `_classify_hook`, `_classify_repo_hooks`, and `_audit_repo` define absent / ours / non-ours / shadowed / opt-out. Install, uninstall, current-repo doctor, and `doctor --all` must route through those records instead of re-inferring hook state ad hoc.
5. **Compose snippets preserve Git hook semantics**: `_compose_snippet` owns embedded, standalone, and bypass-help hook text. Embedded snippets preserve `"$@"`, do not consume stdin, and exit non-zero when ai-git-guardrails blocks. This is required for `commit-msg` file paths and `pre-push` ref streams.
6. **Universals-only registry**: `checks/registry.sh` is the shell-readable source of truth for shipped checks, skip env vars, required tools, optional tools, and rationale. README, `lefthook.yml`, doctor output, and tests should stay in parity with it.
7. **Shipped security baselines beat repo-local weakening**: `cmd_run` invokes lefthook with the shipped `lefthook.yml`; the gitleaks check uses the shipped `gitleaks.toml`. A repo-local `.gitleaks.toml` must not weaken the baseline.
8. **Staged data, not mutable worktree data**: large-file checks inspect staged blobs, not later worktree bytes. Keep this invariant in `checks/large-files.sh` behavior and tests.
9. **Backward compatibility is explicit and temporary**: v0.8.0 compatibility for legacy markers, `GUARDRAILS_*` env vars, and `~/.config/guardrails/` lives in the binary so old installs can be uninstalled or migrated safely. Remove only through a documented deprecation cycle.

## Module map

```
ai-git-guardrails          bash CLI binary and dispatch
  constants/env            version, marker strings, template/config path resolution
  repo introspection       _repo_toplevel, _repo_hooks_dir, hooksPath helpers, opt-out
  classifier               _classify_hook, _classify_repo_hooks, _audit_repo
  compose snippets         _compose_snippet, _generate_shim
  commands                 cmd_install, cmd_uninstall, cmd_run, cmd_doctor,
                           cmd_doctor_all, cmd_global_template, cmd_migrate
checks/registry.sh         shell-readable universal check registry
checks/*.sh                concrete check implementations used by lefthook.yml
lefthook.yml               shipped hook orchestration config
commitlint.config.cjs      shipped Conventional Commits config
gitleaks.toml              shipped secret-scanning baseline
tests/ai-git-guardrails.test.ts
                           Bun/TypeScript lifecycle + behavior tests over real temp repos
README.md                  user-facing install, commands, scope, comparison
ROADMAP.md                 architecture audit history and non-goals
CHANGELOG.md               release decisions and migration notes
docs/COMPARISON.md         detailed product landscape
```

The intended dependency shape is: commands render and mutate; classifier owns hook-state facts; registry owns check facts; lefthook executes checks. Avoid new code paths that read hook state or check metadata by hand when these seams already exist.

## Real seams

- **Hook-state classifier** (`_classify_hook`, `_classify_repo_hooks`, `_audit_repo`): real seam. Multiple commands consume the same state machine, and v0.4.0/v0.5.0 changelog entries show it removed drift between install, uninstall, and doctor.
- **Compose-snippet generator** (`_compose_snippet`): real seam. Installed hooks, conflict guidance, doctor bypass help, and README examples all need the same args/stdin/exit contract.
- **Universal-check registry** (`checks/registry.sh`): real seam. Doctor reachability, bypass hints, README check list, and lefthook parity tests all depend on the same check metadata.
- **Shipped config assets** (`lefthook.yml`, `gitleaks.toml`, `commitlint.config.cjs`): real adapter boundary between the bash CLI and external tools.

## Hypothetical seams (do not introduce yet)

- **Shared bash helper library across repos**: ai-git-guardrails and git-wt both use TSV record streams, but no second concrete consumer needs the exact same helper API. Extracting a shared library would add release coupling before the interface is proven.
- **Plugin system for checks**: universals-only is the product. A plugin interface would move policy into repo/user extension points and weaken the clarity of the baseline.
- **Hook-manager writers by default**: default install should remain user-owned `.git/hooks` plus conflict-aware refusal. Manager-specific mutation can exist only as an explicit feature with tests for Husky/lefthook/pre-commit surfaces.
- **Full Go rewrite**: Bash is still adequate for the current macOS/Homebrew personal CLI. Revisit only when shell quoting/TSV invariants or cross-platform distribution cost starts dominating feature work.

## Public API stability

There is no library API. The contract is the `ai-git-guardrails` binary, generated hook marker/version, supported subcommands, skip/bypass environment variables, config locations, and shipped check behavior.

Breaking changes include changing marker semantics, removing legacy marker recognition, changing config directory precedence, changing skip env names, changing hook names, or making previously accepted installs unsafe/refused without migration guidance.

## ADRs

ADR-001 — per-repo binary install over legacy global `core.hooksPath`: v0.3.0 replaced the old global-hooksPath directory with a real CLI binary and per-repo `ai-git-guardrails install`. Decision: install ownership-marked hooks per repo and set local `core.hooksPath` so global hook setups such as wt do not shadow the baseline.

ADR-002 — marker-only uninstall: v0.3.0 introduced stable ownership markers and uninstall that removes only marked hooks. Decision: preserving non-owned hooks beats aggressive cleanup.

ADR-003 — classifier as hook-state source of truth: v0.4.0 centralized absent / ours / non-ours / shadowed / opt-out classification. Decision: commands consume classifier output instead of duplicating hook-state inference.

ADR-004 — doctor unification through structured records: v0.5.0 made `_audit_repo` emit one TSV record rendered by both `doctor` and `doctor --all`. Decision: current-repo and multi-repo audit must not drift.

ADR-005 — compose-snippet contract: v0.6.0 centralized embedded, standalone, and bypass-help snippets in `_compose_snippet`. Decision: every shim must preserve `"$@"`, respect stdin, and propagate blocking failures consistently.

ADR-006 — universals registry: v0.7.0 added `checks/registry.sh` as the source of truth for universal checks and tool reachability. Decision: adding/removing a check should be one registry edit plus parity updates, not scattered prose/code changes.

ADR-007 — rename with compatibility bridge: v0.8.0 renamed the project/binary to `ai-git-guardrails` while retaining legacy marker/env/config fallbacks. Decision: fresh installs use new names; old installs remain classifiable and removable during migration.
