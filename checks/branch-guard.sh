#!/usr/bin/env bash
# Block direct pushes to protected branches.
# Reads pre-push refs from stdin per git's pre-push hook protocol:
#   <local-ref> <local-sha> <remote-ref> <remote-sha>
#
# Configuration resolution order (first match wins):
#
#   1. wt config — if ~/.config/wt/config.yaml exists AND current repo's
#      toplevel matches a configured wt repo, read protected_refs from
#      `repos.<name>.protected_refs` or `defaults.protected_refs`. Each
#      line is a literal branch name OR a regex (auto-detected: if it
#      starts with ^ or contains regex metachars `*?+|()[]{}\\`, treat
#      as regex; otherwise as a literal exact match).
#
#   2. PROTECTED_BRANCHES_LIST env — comma- or newline-separated literals.
#
#   3. PROTECTED_BRANCH_REGEX env — single regex (anchoring is caller's job).
#
#   4. Default regex: ^(main|master|trunk|release/.*)$
#
# Skip non-branch refs (tags, notes, etc.) — only `refs/heads/*` is checked.
#
# Bypass:
#   ALLOW_PROTECTED_PUSH=1 git push ...   (this push only)
#   git push --no-verify                  (skip ALL hooks)

set -euo pipefail

[[ "${ALLOW_PROTECTED_PUSH:-0}" == "1" ]] && exit 0

# Honor legacy PROTECTED_BRANCHES env var for backwards compat (deprecated).
if [[ -n "${PROTECTED_BRANCHES:-}" ]] && [[ -z "${PROTECTED_BRANCH_REGEX:-}" ]]; then
  echo "git-guardrails branch-guard: PROTECTED_BRANCHES is deprecated. Use PROTECTED_BRANCH_REGEX (regex) or PROTECTED_BRANCHES_LIST (literal list)." >&2
  PROTECTED_BRANCH_REGEX="$PROTECTED_BRANCHES"
fi

# ── Resolve protected_refs from wt config (if present) ──────────────────────
# Returns 0 if wt-config-managed refs were loaded into `protected_list`.
declare -a protected_list=()
use_regex=true
regex=""

load_from_wt_config() {
  local wt_config="$HOME/.config/wt/config.yaml"
  [[ -r "$wt_config" ]] || return 1
  command -v yq >/dev/null 2>&1 || return 1

  # Find the toplevel of the current repo (canonical, not worktree).
  local common_dir toplevel
  common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
  [[ -n "$common_dir" ]] || return 1
  toplevel=$(dirname "$common_dir")

  # Find the repo name in wt config whose `path` matches toplevel.
  # We also try realpath-normalization for macOS /var vs /private/var.
  local rp_toplevel
  rp_toplevel=$(realpath "$toplevel" 2>/dev/null || echo "$toplevel")

  local repo
  repo=$(yq -r --arg t "$toplevel" --arg rt "$rp_toplevel" '
    .repos | to_entries[] |
    select(.value.path == $t or .value.path == $rt) |
    .key
  ' "$wt_config" 2>/dev/null | head -1)
  # Fallback: ~-expansion in stored paths.
  if [[ -z "$repo" ]]; then
    repo=$(yq -r --arg h "$HOME" --arg t "$toplevel" '
      .repos | to_entries[] |
      select((.value.path | sub("^~"; $h)) == $t) |
      .key
    ' "$wt_config" 2>/dev/null | head -1)
  fi
  [[ -n "$repo" ]] || return 1

  # Pull repo-specific protected_refs, falling back to defaults.
  local refs
  refs=$(REPO="$repo" yq -r '
    .repos[strenv(REPO)].protected_refs // .defaults.protected_refs // [] | .[]
  ' "$wt_config" 2>/dev/null || true)
  [[ -z "$refs" ]] && return 1

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    protected_list+=("$line")
  done <<< "$refs"
  return 0
}

# ── Resolve protected refs in priority order ────────────────────────────────
if load_from_wt_config; then
  use_regex=false
elif [[ -n "${PROTECTED_BRANCHES_LIST:-}" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    protected_list+=("$line")
  done < <(printf '%s' "$PROTECTED_BRANCHES_LIST" | tr ',\n' '\n\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^$' || true)
  use_regex=false
else
  # Use regex (env or default).
  regex="${PROTECTED_BRANCH_REGEX:-^(main|master|trunk|release/.*)$}"
  use_regex=true
fi

# Auto-detect regex entries inside a literal list (wt config can mix).
is_regex_like() {
  [[ "$1" == ^* ]] || [[ "$1" =~ [\*\?\+\|\(\)\[\]\{\}\\] ]]
}

is_protected() {
  local branch="$1"
  if $use_regex; then
    [[ "$branch" =~ $regex ]]
    return $?
  fi
  local p
  for p in "${protected_list[@]}"; do
    if is_regex_like "$p"; then
      if [[ "$branch" =~ $p ]]; then
        return 0
      fi
    else
      [[ "$branch" == "$p" ]] && return 0
    fi
  done
  return 1
}

fail=0
while read -r local_ref local_sha remote_ref _remote_sha; do
  [[ -z "$remote_ref" ]] && continue
  [[ "$local_sha" == "0000000000000000000000000000000000000000" ]] && continue
  [[ "$remote_ref" == refs/heads/* ]] || continue

  remote_branch="${remote_ref#refs/heads/}"
  if is_protected "$remote_branch"; then
    printf '\033[31mrefusing direct push to protected branch:\033[0m %s\n' "$remote_branch" >&2
    printf '  remote ref:                 %s\n' "$remote_ref" >&2
    printf '  override (this push only):  ALLOW_PROTECTED_PUSH=1 git push ...\n' >&2
    printf '  bypass everything:          git push --no-verify\n' >&2
    fail=1
  fi
done

exit "$fail"
