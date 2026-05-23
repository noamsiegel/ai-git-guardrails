# guardrails

> Cross-repo personal git-hook quality layer that composes with whatever your repo already uses.

`guardrails` is a portable [lefthook](https://github.com/evilmartians/lefthook)
config + bash helpers that adds the **same handful of universal quality
checks** to every git repo you work in, without conflicting with the repo's
own lint/format/typecheck setup.

## What runs

Universal checks only — these are the ones every repo benefits from, and
none of them duplicate what the repo's own tooling does:

| Hook | Check | Tool | What it catches |
|---|---|---|---|
| `pre-commit` | secrets | [gitleaks](https://github.com/gitleaks/gitleaks) | API keys, JWTs, AWS creds, etc. in staged changes |
| `pre-commit` | workflow lint | [actionlint](https://github.com/rhysd/actionlint) | broken `.github/workflows/*.yml` |
| `pre-commit` | large files | bash + `git cat-file -s` | files >5MB landing in your history (configurable) |
| `commit-msg` | message format | [commitlint](https://commitlint.js.org/) | non-Conventional Commits messages |
| `pre-push` | branch protection | bash | direct pushes to `main`/`master`/`trunk`/`release/*` |
| `pre-push` | code quality | [fallow](https://github.com/fallow-rs/fallow) | unused code, dead deps, duplication, hotspots (JS/TS only) |

What's deliberately NOT in scope: `eslint`, `prettier`, `ruff`, `biome`,
`tsc`, `mypy`, project-specific tests. Those belong to each repo.

## Composes with what you have

Guardrails is designed to layer on top of (not replace) anything else
running in your hooks. If a repo uses Husky, lefthook, the pre-commit
framework, or a custom orchestrator, guardrails runs *before* that —
catching universals first, then handing off.

The canonical install is a 3-tier chain:

```
git commit / push
   ↓
(optional) wt hook        ← worktree-aware checks (canonical-refuse, autopush)
   ↓
guardrails hook            ← universal quality checks (this repo)
   ↓
repo-local .git/hooks/*   ← repo-specific stuff (lint, format, typecheck, tests)
```

The bridge between the wt layer and guardrails is `_wt-personal.sh` which
ships with [git-wt](https://github.com/noamsiegel/git-wt). If you don't use
wt, you can wire guardrails directly to `core.hooksPath` instead.

## Install

```bash
brew install lefthook gitleaks actionlint
bun install -g @commitlint/cli

git clone https://github.com/noamsiegel/guardrails.git ~/.git-hooks-personal
cd ~/.git-hooks-personal && bun install   # populates @commitlint/config-conventional for commit-msg
```

Then wire it as your global hook target. Two options:

**Option A — Standalone (no wt):**
```bash
git config --global core.hooksPath ~/.git-hooks-personal
```

**Option B — Layered with [git-wt](https://github.com/noamsiegel/git-wt):**
Install git-wt; its `_wt-personal.sh` bridge auto-discovers guardrails at
`~/.git-hooks-personal/` and invokes it inside wt's hook chain. No additional
config needed.

## Configure

Set `GUARDRAILS_HOME` if guardrails lives somewhere other than
`~/.git-hooks-personal`:
```bash
export GUARDRAILS_HOME="$HOME/code/guardrails"
```

## XDG init.sh

If you use asdf, mise, nvm, volta, rbenv, or other PATH-manipulating
version managers, the default sanitized PATH may not include your tools.
Create `${XDG_CONFIG_HOME:-$HOME/.config}/guardrails/init.sh` to extend
PATH before hooks run:

```bash
# ~/.config/guardrails/init.sh
. "$HOME/.asdf/asdf.sh"  # or whatever your version manager needs
```

The script is sourced (not exec'd) so `export PATH=...` propagates correctly.

For per-repo customization, use the standard tool config files:
- `.gitleaksignore` for fingerprint-based gitleaks exceptions (safe, per-commit).
- `.fallowrc.json` for fallow project config.

For cross-repo customization, edit your local checkout of `gitleaks.toml`
and `commitlint.config.cjs`.

## Bypass

Layered escape hatches, smallest hammer first:

| Goal | How |
|---|---|
| Skip one check, once | `SKIP_GITLEAKS=1 git commit ...` (also: `SKIP_ACTIONLINT`, `SKIP_LARGE_FILES`, `SKIP_COMMITLINT`, `SKIP_BRANCH_GUARD`, `SKIP_FALLOW`) |
| Allow push to protected branch (one-time) | `ALLOW_PROTECTED_PUSH=1 git push ...` |
| Raise large-file threshold | `LARGE_FILE_LIMIT_MB=20 git commit ...` |
| Pin fallow to a different version | `FALLOW_VERSION=2.45.0 git push ...` |
| Skip all guardrails for this invocation | `SKIP_PERSONAL_HOOKS=1 git commit ...` |
| Override PATH for non-standard tool locations | `export GUARDRAILS_PATH="..."` in your shell rc |
| Opt out of guardrails for one repo permanently | Add the repo's canonical path to `$GUARDRAILS_HOME/.opt-out`, one per line |
| Skip everything (guardrails AND repo hooks) | `git commit --no-verify` / `git push --no-verify` |

Note: there is deliberately **no in-repo opt-out marker** (e.g.
`.no-personal-hooks`). A repository must not be able to disable user-level
security checks by committing a file. Opt-outs live only in your home
directory.

## Doctor

```bash
bun ~/.git-hooks-personal/skill/doctor.ts
# or, if you've installed it into PATH:
pai-hooks doctor
```

Audits every git repo under `~/Documents/GitHub/` (configurable via `--root`)
and reports which ones will fire guardrails vs which override `core.hooksPath`
locally. For overrides, it emits the exact shim snippet to paste.

## Tests

```bash
bun test tests/guardrails.test.ts
```

22 tests covering: hostile-repo `.gitleaks.toml` allowlist defeated; branch-guard list/regex modes; large-files staged-vs-worktree blob check; per-repo opt-out; in-repo marker correctly ignored; env-var poisoning defended; commitlint enforcement; doctor handles worktrees.

## Security properties

- **No repo-local control over what guardrails runs.** Hostile or careless
  repos cannot weaken or disable the user's security checks.
- **PATH sanitized at hook entry** (override with `GUARDRAILS_PATH`). Tools
  resolve to known locations, not whatever `$PATH` says when `git commit`
  runs.
- **Gitleaks runs against a user-owned baseline config**, not the repo's
  `.gitleaks.toml`. A repo can still use `.gitleaksignore` for safe
  per-commit exceptions, but cannot add broad allowlists.
- **Large-files inspects the staged blob via `git cat-file -s`**, not the
  worktree. Staging a large blob and then truncating the worktree file no
  longer bypasses the check.
- **Branch-guard supports both literal list mode and regex mode**, with
  default anchoring. `PROTECTED_BRANCHES_LIST=main` does NOT match `domain`.

## Companion tools

- [git-wt](https://github.com/noamsiegel/git-wt) — parallel-safe worktree
  CLI for agentic coding. The natural worktree layer below guardrails.

## License

MIT. See [LICENSE](./LICENSE).
