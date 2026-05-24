# Per-repo Python and TS/JS hooks

`git-guardrails` owns user-level safety checks. Language and toolchain checks belong to each repository because they depend on that repo's workspace roots, package manager, virtual environment, generated-file policy, and CI contract.

Use these snippets as repo-owned examples. Keep `git-guardrails` first so safety checks block before project quality checks run.

## Compose git-guardrails first

### lefthook

```yaml
pre-commit:
  commands:
    git-guardrails:
      run: git-guardrails run pre-commit "$@"
```

```yaml
pre-push:
  commands:
    git-guardrails:
      run: git-guardrails run pre-push "$@"
```

### Husky or raw hooks

```bash
if command -v git-guardrails >/dev/null 2>&1; then
  git-guardrails run pre-commit "$@" || exit $?
fi
```

```bash
if command -v git-guardrails >/dev/null 2>&1; then
  git-guardrails run pre-push "$@" || exit $?
fi
```

### pre-commit framework

```yaml
repos:
  - repo: local
    hooks:
      - id: git-guardrails
        name: git-guardrails
        entry: git-guardrails run pre-commit
        language: system
        pass_filenames: false
```

## Python examples

### Staged Ruff lint

Run on staged Python files only. Keep Ruff's own exclude logic active.

```yaml
pre-commit:
  commands:
    ruff:
      glob:
        - "*.py"
        - "*.pyi"
      run: ruff check --force-exclude -- {staged_files}
```

### Optional non-mutating format enforcement

Only add this if the repository wants format checks in hooks. Do not auto-format from a shared safety hook.

```yaml
pre-commit:
  commands:
    ruff-format:
      glob:
        - "*.py"
        - "*.pyi"
      run: ruff format --check --force-exclude -- {staged_files}
```

### Workspace-scoped ty check

Run type checks from the Python workspace root, not necessarily the Git root.

```yaml
pre-push:
  commands:
    ty-app:
      root: services/api
      glob:
        - "*.py"
        - "*.pyi"
      run: ty check
```

If a repo uses `uv`, `poetry`, `pixi`, or another environment manager, invoke the repo's own command instead:

```yaml
pre-push:
  commands:
    python-types:
      root: services/api
      run: uv run ty check
```

## TS/JS examples

### Biome-configured projects

Only use Biome where the repo already owns Biome config.

```yaml
pre-commit:
  commands:
    biome:
      glob:
        - "*.js"
        - "*.jsx"
        - "*.ts"
        - "*.tsx"
        - "*.mjs"
        - "*.cjs"
        - "*.json"
        - "*.jsonc"
      run: biome check --no-errors-on-unmatched --files-ignore-unknown=true -- {staged_files}
```

### Existing project scripts

Prefer the commands the repo already supports over introducing Biome globally.

```yaml
pre-push:
  commands:
    typecheck:
      run: bun run typecheck
    test:
      run: bun test
```

Other valid repo-owned choices include `eslint`, `prettier --check`, `tsc --noEmit`, `vitest`, package-manager scripts, or CI-only enforcement.

## Monorepos

- Split commands by path or workspace.
- Set the working directory per workspace.
- Do not run `ruff`, `ty`, `biome`, `tsc`, or tests from the Git root unless the monorepo already owns a root command designed for that.
- Prefer staged-file checks for `pre-commit` and changed-workspace checks for `pre-push`.
- Exclude generated, vendored, fixture, and third-party paths through the repo's own tool config.

Example:

```yaml
pre-commit:
  commands:
    api-ruff:
      root: services/api
      glob:
        - "*.py"
        - "*.pyi"
      run: ruff check --force-exclude -- {staged_files}
    web-biome:
      root: apps/web
      glob:
        - "*.ts"
        - "*.tsx"
        - "*.json"
      run: biome check --no-errors-on-unmatched --files-ignore-unknown=true -- {staged_files}
```

## Non-goal

`git-guardrails` will not generate, install, or mutate repo-owned hook-manager config by default. Repositories opt into these language hooks explicitly.
