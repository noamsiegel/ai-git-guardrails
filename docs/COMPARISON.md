---
id: COMPARISON
summary: "How git-guardrails differs from hook orchestrators and secret scanners"
---

# How git-guardrails compares

Short version: git-guardrails is not a general hook framework and not a scanner. It is a brew-installed, user-owned universal Git safety layer that composes with hook frameworks and invokes scanners under a shipped baseline.

## At a glance

| Project | Core verb | Output | Loaded at | Composable with git-guardrails? |
|---|---|---|---|---|
| **git-guardrails** | guard | ownership-marked `.git/hooks/*` shims or pasteable compose snippets; shipped universal checks | commit-time + push-time + on-demand doctor/run | — |
| [`pre-commit`](https://github.com/pre-commit/pre-commit) | orchestrate | repo-owned `.pre-commit-config.yaml` and hook entrypoints | commit-time | yes — call `git-guardrails run <hook>` from a repo-managed hook |
| [`lefthook`](https://github.com/evilmartians/lefthook) | orchestrate | repo-owned `lefthook.yml` commands and Git hook wiring | commit-time + push-time | yes — git-guardrails already uses lefthook as execution substrate |
| [`Husky`](https://github.com/typicode/husky) | wire | repo-owned `.husky/*` scripts | commit-time + push-time | yes — paste the compose snippet near the top of each script |
| [`Githooks`](https://github.com/gabyx/githooks) / [`Overcommit`](https://github.com/sds/overcommit) | manage | shared/repo hook runner config and hook entrypoints | Git hook time | partial — useful execution infrastructure, different trust model |
| [`Gitleaks`](https://github.com/gitleaks/gitleaks) | scan | findings; optional config/rules | on-demand, CI, or hook-runner invocation | yes — git-guardrails invokes it with a shipped baseline |
| [`TruffleHog`](https://github.com/trufflesecurity/trufflehog) | verify secrets | findings across Git and many other sources | on-demand, CI, or hook-runner invocation | possible future scanner backend; not current default |

## In words

### pre-commit

`pre-commit` is the dominant multi-language hook framework. It manages language environments, pins hook repos, and has a large hook ecosystem. `pre-commit-hooks` overlaps with large-file checks and branch protection.

**Difference**: pre-commit is normally repo-owned through `.pre-commit-config.yaml`. git-guardrails is user-owned: the repo cannot remove gitleaks, branch guard, large-file checks, actionlint, commitlint, or fallow by editing committed config. Project `ruff`, `biome`, `ty`, `eslint`, `tsc`, and test commands stay in pre-commit or another repo-owned surface.

**Compose**: keep pre-commit for project-specific checks. Put git-guardrails in a hook entrypoint when you want explicit chaining, or let git-guardrails own `.git/hooks` for the personal baseline.

### lefthook

`lefthook` is a fast hook orchestrator with concurrent YAML-defined commands. git-guardrails uses a shipped `lefthook.yml` internally to run its universal checks.

**Difference**: lefthook executes configured commands. git-guardrails adds policy: conflict-aware install, ownership markers, marker-only uninstall, user-owned opt-out, hostile-repo-resistant shipped config, and a curated universal registry.

**Compose**: existing lefthook repos can call `git-guardrails run pre-commit`, `run pre-push`, or `run commit-msg` from their repo-owned config, then run workspace-scoped language/toolchain commands from that same config. git-guardrails should not silently mutate that config by default.

### Husky

`Husky` is popular in JS/package.json projects and writes repo-owned `.husky/*` scripts through `core.hooksPath`.

**Difference**: git-guardrails is not JS-specific and does not depend on a package.json lifecycle. It provides the same baseline for Bash, Go, TypeScript, docs-only, or mixed repos.

**Compose**: paste the README compose snippet near the top of `.husky/pre-commit`, `.husky/pre-push`, or `.husky/commit-msg` so failures block before project-specific hook logic continues.

### Githooks and Overcommit

Githooks and Overcommit are mature hook managers with shared-hook or trust/signature concepts. They are real prior art for hook conflict and hook trust problems.

**Difference**: they are flexible execution frameworks. git-guardrails narrows the problem: a personal, universal safety baseline that hostile repos should not weaken. That narrower scope is why it can avoid a plugin system and repo-local opt-out.

**Compose**: use them when you want broader hook orchestration or shared hook repositories. Use git-guardrails when you want the opinionated universal baseline.

### Gitleaks

`Gitleaks` is a focused secret scanner. It can scan repos, files, directories, and stdin, and it supports custom rules.

**Difference**: git-guardrails is the delivery and policy layer around Gitleaks plus non-secret checks. It invokes Gitleaks from Git hooks with a shipped baseline so repo-local `.gitleaks.toml` cannot allowlist away the user's safety check.

**Compose**: run Gitleaks directly in CI or investigations. Let git-guardrails handle client-side pre-commit enforcement.

### TruffleHog

`TruffleHog` is a broad secret discovery and verification scanner. It reaches many sources beyond Git and can verify live credentials.

**Difference**: TruffleHog is deeper and broader than this repo's client-side hook model. git-guardrails stays lightweight and MIT-friendly around Gitleaks for default pre-commit latency and licensing simplicity.

**Compose**: use TruffleHog in CI, scheduled scans, or incident response. A future git-guardrails scanner backend could call it, but that should be explicit because it changes cost, latency, and license posture.

## Why this is a tool

Every adjacent tool either:

1. runs whatever a repo or shared hook config tells it to run,
2. scans for one class of problem,
3. or manages hook distribution/trust without choosing this exact universal safety policy.

git-guardrails sits in the gap: a user-owned baseline that installs safely, refuses to clobber by default, composes with repo hook managers, and runs a small list of universal checks that do not duplicate project lint/format/typecheck/test ownership.

## Non-goals

- Not a replacement for pre-commit, lefthook, Husky, Githooks, or Overcommit.
- Not a marketplace or plugin host for arbitrary checks.
- Not a server-side enforcement system.
- Not a project-specific quality gate for lint, format, typecheck, or test suites.
- Not a broad secret-scanning platform; Gitleaks is one shipped universal check.
