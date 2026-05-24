# guardrails

> Personal git-hook quality layer. Installs per-repo with safe ownership marker.

`guardrails` is a small CLI that installs a curated set of universal quality
checks into each repo you opt in, without conflicting with the repo's own
lint/format/typecheck setup. It composes cleanly with Husky, lefthook, the
pre-commit framework, or no other hook system at all.

## What it runs

Universal checks only — the kind every repo benefits from, none of which
duplicate what the repo's own tooling does:

| Hook | Check | Tool |
|---|---|---|
| `pre-commit` | secrets | [gitleaks](https://github.com/gitleaks/gitleaks) (user-owned baseline; repo cannot weaken via `.gitleaks.toml`) |
| `pre-commit` | workflow lint | [actionlint](https://github.com/rhysd/actionlint) (only on `.github/workflows/*.yml`) |
| `pre-commit` | large files | `git cat-file -s` on staged blobs (>5MB; closes staged-blob-vs-worktree bypass) |
| `commit-msg` | message format | [commitlint](https://commitlint.js.org/) with `@commitlint/config-conventional` |
| `pre-push` | branch protection | bash — refuses direct pushes to `main`/`master`/`trunk`/`release/*` (configurable; also reads `protected_refs` from wt config when in a wt-managed repo) |
| `pre-push` | code quality | [fallow](https://github.com/fallow-rs/fallow) on JS/TS repos |

Deliberately NOT in scope: `eslint`, `prettier`, `ruff`, `biome`, `tsc`,
`mypy`, project tests. Those belong to each repo's own CI.

## Install

```bash
brew tap noamsiegel/tap
brew install noamsiegel/tap/guardrails
```

That puts `guardrails` on `PATH` at `/opt/homebrew/bin/guardrails`. Then in
each repo you want enrolled:

```bash
cd <some-repo>
guardrails install
```

That writes hook shims into `.git/hooks/{pre-commit,pre-push,commit-msg}`
with an ownership marker (`# guardrails-managed: guardrails.v0`) and sets
local `core.hooksPath` to point at them. The shims invoke `guardrails run
<hook>` which delegates to `lefthook` with the shipped config.

To enroll **new** clones automatically:

```bash
guardrails --global-template
```

That wires `git config --global init.templateDir` so every subsequent
`git init` / `git clone` installs guardrails hooks.

## Commands

```bash
guardrails install [--force] [--skip <hook>]   # install hooks in current repo
guardrails uninstall                            # remove only ours-marked hooks
guardrails doctor                               # audit current repo + tool reachability
guardrails run <hook>                           # invoked by installed shims
guardrails migrate [--apply]                    # migrate from legacy global-hooksPath install
guardrails --global-template                    # auto-install on new clones
guardrails --version
```

`guardrails install` is conflict-aware: it refuses to clobber non-guardrails
hooks unless you pass `--force`, and it detects Husky/lefthook/pre-commit
configs in the repo and prints a one-line compose snippet if you'd rather
chain than override.

## Bypass

| Goal | How |
|---|---|
| Skip one check, once | `SKIP_GITLEAKS=1 git commit ...` (also `SKIP_ACTIONLINT`, `SKIP_LARGE_FILES`, `SKIP_COMMITLINT`, `SKIP_BRANCH_GUARD`, `SKIP_FALLOW`) |
| Allow push to protected branch (one-time) | `ALLOW_PROTECTED_PUSH=1 git push ...` |
| Raise large-file threshold | `LARGE_FILE_LIMIT_MB=20 git commit ...` |
| Pin fallow to a different version | `FALLOW_VERSION=2.45.0 git push ...` |
| Skip all guardrails for one invocation | `SKIP_PERSONAL_HOOKS=1 git commit ...` |
| Opt out a repo permanently | Add canonical path to `~/.config/guardrails/.opt-out`, one per line |
| Override PATH for non-standard tool locations | Drop a file at `~/.config/guardrails/init.sh` to extend `PATH` (asdf/mise/nvm) |
| Skip everything (guardrails AND repo hooks) | `git commit --no-verify` / `git push --no-verify` |

There is deliberately **no in-repo opt-out marker.** A repository must not
be able to disable user-level security checks by committing a file.

## Security properties

- **No repo-local control over what guardrails runs.** Hostile repos cannot
  weaken via `.gitleaks.toml` allowlists (guardrails uses an explicit
  `--config` to a user-owned baseline).
- **No in-repo opt-out marker.** Only `~/.config/guardrails/.opt-out`.
- **Staged-blob large-file check.** Inspects `git cat-file -s :path`, not
  worktree bytes — staging a large blob and truncating the worktree no
  longer bypasses.
- **Ownership marker.** Generated hooks contain `# guardrails-managed:
  guardrails.v0`. `guardrails uninstall` removes only matching hooks.
- **`rm -f` before write.** Install never follows symlinks (a subtle but
  catastrophic bug class that we shipped a fix for in v0.3.0).
- **PATH sanitized at hook entry** (override via `GUARDRAILS_PATH`).
- **`core.hooksPath`-conflict detection.** Refuses install by default if
  the repo already overrides hooksPath, with a useful error and `--force`
  escape.

## Migration from legacy install

If you were using the pre-v0.3.0 model where guardrails lived at
`~/.git-hooks-personal/` and was wired via global `core.hooksPath`:

```bash
guardrails migrate           # dry-run
guardrails migrate --apply   # perform the migration

# Then, in each repo you want enrolled:
cd <repo> && guardrails install

# When validated, delete the legacy dir:
rm -rf ~/.git-hooks-personal
```

## Tests

```bash
cd <clone>
brew install lefthook gitleaks actionlint bats-core
bun install                                # only needed for the test fixtures
bats tests/                                # all of them
```

## Companions

- [git-wt](https://github.com/noamsiegel/git-wt) — parallel-safe worktree
  CLI for agentic coding. Sets `protected_refs` per-repo that guardrails'
  `branch-guard` reads automatically.
- [provenance](https://github.com/noamsiegel/provenance) — capture Claude
  Code session transcripts as secret gists linked from PRs.

## License

MIT. See [LICENSE](./LICENSE).
