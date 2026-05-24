# Security Policy

## Reporting a vulnerability

Email security reports to noam@noamsiegel.com.

Do not open public issues for security bugs. Include enough detail to reproduce the problem, the affected version or commit, and any known impact. You can expect a private response before public disclosure is coordinated.

## Supported versions

| Version | Supported |
|---|---|
| Current main branch | Yes |

## Security boundaries

`git-guardrails` is a user-owned hook layer. Hostile or careless repos must not be able to weaken the user's security checks through repo-local files or hook configuration.

Gitleaks baseline overrides are security-critical. Report any bypass that lets a repo-local `.gitleaks.toml`, environment poisoning, path manipulation, or committed opt-out marker disable or broaden secret-scanning allowlists without explicit user control.
