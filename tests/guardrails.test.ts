/**
 * guardrails fixture-based test suite.
 *
 * Run: bun test tests/guardrails.test.ts
 *
 * Each test spawns a real temp git repo, exercises a hook through the actual
 * shim chain, and asserts on git state + exit codes. No mocks. The repos are
 * disposable; cleanup runs after each test.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GUARDRAILS = join(REPO_ROOT, 'guardrails');
// Build the test key at runtime so GitHub's secret scanner doesn't flag this
// source file. Gitleaks still detects the leak inside the test git repo because
// the key is written verbatim to disk there.
const STRIPE_KEY_LIKE = `const k = '${['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc'].join('_')}';`;

interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], opts: SpawnSyncOptions = {}): SpawnResult {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return {
    status: r.status,
    stdout: r.stdout?.toString() ?? '',
    stderr: r.stderr?.toString() ?? '',
  };
}

function git(repo: string, ...args: Array<string | SpawnSyncOptions>): SpawnResult {
  // Last arg may be an options object; if so peel it off.
  let opts: SpawnSyncOptions = {};
  if (args.length > 0 && typeof args[args.length - 1] === 'object') {
    opts = args.pop() as SpawnSyncOptions;
  }
  return run('git', ['-C', repo, ...(args as string[])], opts);
}

function testEnv(configHome: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GUARDRAILS_TEMPLATES: REPO_ROOT,
    XDG_CONFIG_HOME: configHome,
    PATH: `${REPO_ROOT}:${process.env.PATH ?? ''}`,
    NODE_PATH: `${process.env.HOME}/.local/share/bun/install/global/node_modules${process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ''}`,
  };
}

function newRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'guardrails-test-'));
  const configHome = join(dir, 'xdg');
  mkdirSync(configHome, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'guardrails-test');
  const install = run(GUARDRAILS, ['install', '--force'], { cwd: dir, env: testEnv(configHome) });
  if (install.status !== 0) {
    throw new Error(`guardrails install failed: ${install.stderr || install.stdout}`);
  }
  return dir;
}

function newBareRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'guardrails-test-'));
  const configHome = join(dir, 'xdg');
  mkdirSync(configHome, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'guardrails-test');
  return dir;
}

function hooksDir(repo: string): string {
  return git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim() + '/hooks';
}

function envForRepo(repo: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...testEnv(join(repo, 'xdg')), ...extra };
}

function cleanup(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function commitCount(repo: string): number {
  const r = git(repo, 'rev-list', '--count', 'HEAD');
  if (r.status !== 0) return 0;
  return Number.parseInt(r.stdout.trim(), 10);
}

describe('R5 — gitleaks baseline cannot be weakened by hostile repo .gitleaks.toml', () => {
  let repo: string;
  beforeEach(() => { repo = newRepo(); });
  afterEach(() => cleanup(repo));

  test('hostile repo .gitleaks.toml allowing everything still blocks via baseline', () => {
    writeFileSync(join(repo, '.gitleaks.toml'), `
title = "hostile"
[extend]
useDefault = true
[[allowlists]]
description = "block nothing"
regexes = ['''.*''']
`);
    writeFileSync(join(repo, 'leak.ts'), STRIPE_KEY_LIKE);
    git(repo, 'add', 'leak.ts', '.gitleaks.toml');
    const r = git(repo, 'commit', '-m', 'feat: add', { env: envForRepo(repo) });
    expect(r.status).not.toBe(0);
    expect(commitCount(repo)).toBe(0);
  });

  test('SKIP_GITLEAKS=1 bypasses gitleaks but other checks still run', () => {
    writeFileSync(join(repo, 'leak.ts'), STRIPE_KEY_LIKE);
    git(repo, 'add', 'leak.ts');
    const r = git(repo, 'commit', '-m', 'feat: ok', { env: envForRepo(repo, { SKIP_GITLEAKS: '1' }) });
    expect(r.status).toBe(0);
  });
});

describe('R6 — branch-guard list-vs-regex API', () => {
  const guard = join(REPO_ROOT, 'checks', 'branch-guard.sh');
  const ZERO = '0'.repeat(40);
  const ONE = '1'.repeat(40);

  function runGuard(stdin: string, env: Record<string, string> = {}): SpawnResult {
    return run(guard, [], {
      input: stdin,
      env: { ...testEnv(mkdtempSync(join(tmpdir(), 'guardrails-xdg-'))), ...env },
    });
  }

  test('protected-ref decisions are exact and bypassable', () => {
    const cases: Array<[string, string, Record<string, string> | undefined, number]> = [
      ['default regex blocks main', `refs/heads/main ${ONE} refs/heads/main ${ZERO}\n`, undefined, 1],
      ['default regex does not match domain', `refs/heads/domain ${ONE} refs/heads/domain ${ZERO}\n`, undefined, 0],
      ['default regex does not match feature-main', `refs/heads/feature-main ${ONE} refs/heads/feature-main ${ZERO}\n`, undefined, 0],
      ['LIST mode exact match blocks develop', `refs/heads/develop ${ONE} refs/heads/develop ${ZERO}\n`, { PROTECTED_BRANCHES_LIST: 'main,develop' }, 1],
      ['LIST mode main does not match domain', `refs/heads/domain ${ONE} refs/heads/domain ${ZERO}\n`, { PROTECTED_BRANCHES_LIST: 'main' }, 0],
      ['tag pushes are ignored', `refs/tags/v1 ${ONE} refs/tags/v1 ${ZERO}\n`, undefined, 0],
      ['branch deletions are ignored', `refs/heads/main ${ZERO} refs/heads/main ${ONE}\n`, undefined, 0],
      ['ALLOW_PROTECTED_PUSH bypasses', `refs/heads/main ${ONE} refs/heads/main ${ZERO}\n`, { ALLOW_PROTECTED_PUSH: '1' }, 0],
    ];

    for (const [name, stdin, env, status] of cases) {
      const r = runGuard(stdin, env);
      expect(r.status, name).toBe(status);
    }
  });
});

describe('R7 — large-files inspects STAGED blob, not worktree', () => {
  let repo: string;
  beforeEach(() => { repo = newRepo(); });
  afterEach(() => cleanup(repo));

  test('staged-blob size logic uses staged content and threshold override', () => {
    writeFileSync(join(repo, 'big.bin'), Buffer.alloc(6 * 1024 * 1024));
    git(repo, 'add', 'big.bin');
    writeFileSync(join(repo, 'big.bin'), 'tiny');
    const blocked = git(repo, 'commit', '-m', 'feat: x', { env: envForRepo(repo) });
    expect(blocked.status).not.toBe(0);
    expect(commitCount(repo)).toBe(0);
    git(repo, 'reset', '-q');

    writeFileSync(join(repo, 'allowed.bin'), Buffer.alloc(6 * 1024 * 1024));
    git(repo, 'add', 'allowed.bin');
    const allowedByEnv = git(repo, 'commit', '-m', 'feat: big', { env: envForRepo(repo, { LARGE_FILE_LIMIT_MB: '20' }) });
    expect(allowedByEnv.status).toBe(0);

    writeFileSync(join(repo, 'tiny.txt'), 'small');
    git(repo, 'add', 'tiny.txt');
    writeFileSync(join(repo, 'tiny.txt'), Buffer.alloc(10 * 1024 * 1024));
    const stagedSmall = git(repo, 'commit', '-m', 'feat: small', { env: envForRepo(repo) });
    expect(stagedSmall.status).toBe(0);
  });
});

describe('Bypass envvar surface', () => {
  let repo: string;
  beforeEach(() => { repo = newRepo(); });
  afterEach(() => cleanup(repo));

  test('SKIP_PERSONAL_HOOKS=1 skips guardrails entirely', () => {
    writeFileSync(join(repo, 'leak.ts'), STRIPE_KEY_LIKE);
    git(repo, 'add', 'leak.ts');
    const r = git(repo, 'commit', '-m', 'bad msg', { env: envForRepo(repo, { SKIP_PERSONAL_HOOKS: '1' }) });
    // commitlint would normally block "bad msg" too, but it's also skipped.
    expect(r.status).toBe(0);
  });

  test('--no-verify bypasses everything (wt and guardrails)', () => {
    writeFileSync(join(repo, 'leak.ts'), STRIPE_KEY_LIKE);
    git(repo, 'add', 'leak.ts');
    const r = git(repo, 'commit', '--no-verify', '-m', 'bad');
    expect(r.status).toBe(0);
  });

  test('user-owned .opt-out skips repo entirely', () => {
    // The shim resolves repo_root via `git rev-parse --show-toplevel`, which
    // canonicalizes /var/folders/... → /private/var/folders/... on macOS.
    // Use the same canonical form when writing the opt-out file.
    const canonical = git(repo, 'rev-parse', '--show-toplevel').stdout.trim();
    const optOutDir = join(repo, 'xdg', 'guardrails');
    mkdirSync(optOutDir, { recursive: true });
    writeFileSync(join(optOutDir, '.opt-out'), `${canonical}\n`);
    writeFileSync(join(repo, 'leak.ts'), STRIPE_KEY_LIKE);
    git(repo, 'add', 'leak.ts');
    const r = git(repo, 'commit', '-m', 'feat: ok', { env: envForRepo(repo) });
    expect(r.status).toBe(0);
  });

  test('in-repo .no-personal-hooks marker does NOT opt out (R1)', () => {
    writeFileSync(join(repo, '.no-personal-hooks'), '');
    writeFileSync(join(repo, 'leak.ts'), STRIPE_KEY_LIKE);
    git(repo, 'add', '.no-personal-hooks', 'leak.ts');
    const r = git(repo, 'commit', '-m', 'feat: x', { env: envForRepo(repo) });
    expect(r.status).not.toBe(0);
  });
});

describe('R3 — env var poisoning cannot disable hooks', () => {
  let repo: string;
  beforeEach(() => { repo = newRepo(); });
  afterEach(() => cleanup(repo));

  test('ambient WT_HOOK_RUNNING=1 alone does NOT bypass', () => {
    writeFileSync(join(repo, 'leak.ts'), STRIPE_KEY_LIKE);
    git(repo, 'add', 'leak.ts');
    const r = git(repo, 'commit', '-m', 'feat: x', { env: envForRepo(repo, { WT_HOOK_RUNNING: '1' }) });
    expect(r.status).not.toBe(0);
    expect(commitCount(repo)).toBe(0);
  });
});

describe('Conventional commits gating', () => {
  let repo: string;
  beforeEach(() => { repo = newRepo(); });
  afterEach(() => cleanup(repo));

  test('conventional commit decisions and bypass', () => {
    writeFileSync(join(repo, 'a.txt'), 'a');
    git(repo, 'add', 'a.txt');
    const clean = git(repo, 'commit', '-m', 'feat: clean commit message', { env: envForRepo(repo) });
    expect(clean.status).toBe(0);

    writeFileSync(join(repo, 'b.txt'), 'b');
    git(repo, 'add', 'b.txt');
    const blocked = git(repo, 'commit', '-m', 'no convention here', { env: envForRepo(repo) });
    expect(blocked.status).not.toBe(0);

    const bypassRepo = newRepo();
    try {
      writeFileSync(join(bypassRepo, 'c.txt'), 'c');
      git(bypassRepo, 'add', 'c.txt');
      const bypass = git(bypassRepo, 'commit', '-m', 'bad', { env: envForRepo(bypassRepo, { SKIP_COMMITLINT: '1' }) });
      expect(bypass.status).toBe(0);
    } finally {
      cleanup(bypassRepo);
    }
  });
});

describe('Lifecycle commands', () => {
  let repo: string;

  afterEach(() => cleanup(repo));

  test('install writes owned hooks and sets local core.hooksPath', () => {
    repo = newBareRepo();
    const r = run(GUARDRAILS, ['install'], { cwd: repo, env: envForRepo(repo) });
    expect(r.status).toBe(0);

    const dir = hooksDir(repo);
    expect(git(repo, 'config', '--local', '--get', 'core.hooksPath').stdout.trim()).toBe(dir);
    for (const hook of ['pre-commit', 'pre-push', 'commit-msg']) {
      expect(readFileSync(join(dir, hook), 'utf8')).toContain('# guardrails-managed: guardrails.v0');
    }
  });

  test('uninstall preserves non-ours hooks and keeps non-guardrails hooksPath', () => {
    repo = newBareRepo();
    const dir = join(repo, '.custom-hooks');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pre-commit'), '#!/usr/bin/env bash\necho custom\n');
    git(repo, 'config', '--local', 'core.hooksPath', '.custom-hooks');

    const r = run(GUARDRAILS, ['uninstall'], { cwd: repo, env: envForRepo(repo) });
    expect(r.status).toBe(0);
    expect(readFileSync(join(dir, 'pre-commit'), 'utf8')).toContain('echo custom');
    expect(git(repo, 'config', '--local', '--get', 'core.hooksPath').stdout.trim()).toBe('.custom-hooks');
  });

  test('uninstall removes owned hooks and unsets guardrails-owned hooksPath', () => {
    repo = newBareRepo();
    expect(run(GUARDRAILS, ['install'], { cwd: repo, env: envForRepo(repo) }).status).toBe(0);
    const dir = hooksDir(repo);

    const r = run(GUARDRAILS, ['uninstall'], { cwd: repo, env: envForRepo(repo) });
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, 'pre-commit'))).toBe(false);
    expect(git(repo, 'config', '--local', '--get', 'core.hooksPath').status).not.toBe(0);
  });

  test('install --force replaces a conflicting hook', () => {
    repo = newBareRepo();
    const dir = hooksDir(repo);
    writeFileSync(join(dir, 'pre-commit'), '#!/usr/bin/env bash\necho external\n');

    const refused = run(GUARDRAILS, ['install'], { cwd: repo, env: envForRepo(repo) });
    expect(refused.stdout + refused.stderr).toContain('conflicts: 1');

    const forced = run(GUARDRAILS, ['install', '--force'], { cwd: repo, env: envForRepo(repo) });
    expect(forced.status).toBe(0);
    expect(readFileSync(join(dir, 'pre-commit'), 'utf8')).toContain('# guardrails-managed: guardrails.v0');
  });

  test('install --skip excludes requested hook', () => {
    repo = newBareRepo();
    const r = run(GUARDRAILS, ['install', '--skip', 'pre-push'], { cwd: repo, env: envForRepo(repo) });
    expect(r.status).toBe(0);

    const dir = hooksDir(repo);
    expect(existsSync(join(dir, 'pre-commit'))).toBe(true);
    expect(existsSync(join(dir, 'pre-push'))).toBe(false);
    expect(existsSync(join(dir, 'commit-msg'))).toBe(true);
  });

  test('migrate dry-run reports changes without applying', () => {
    repo = newBareRepo();
    const home = mkdtempSync(join(tmpdir(), 'guardrails-home-'));
    const legacy = join(home, '.git-hooks-personal');
    mkdirSync(legacy, { recursive: true });
    run('git', ['config', '--global', 'core.hooksPath', legacy], { env: { ...envForRepo(repo), HOME: home } });

    const r = run(GUARDRAILS, ['migrate'], { cwd: repo, env: { ...envForRepo(repo), HOME: home } });
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toContain('DRY RUN');
    expect(run('git', ['config', '--global', '--get', 'core.hooksPath'], { env: { ...envForRepo(repo), HOME: home } }).stdout.trim()).toBe(legacy);
    cleanup(home);
  });

  test('migrate --apply unsets legacy global hooksPath and migrates opt-out', () => {
    repo = newBareRepo();
    const home = mkdtempSync(join(tmpdir(), 'guardrails-home-'));
    const legacy = join(home, '.git-hooks-personal');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, '.opt-out'), `${repo}\n`);
    run('git', ['config', '--global', 'core.hooksPath', legacy], { env: { ...envForRepo(repo), HOME: home } });

    const r = run(GUARDRAILS, ['migrate', '--apply'], { cwd: repo, env: { ...envForRepo(repo), HOME: home } });
    expect(r.status).toBe(0);
    expect(run('git', ['config', '--global', '--get', 'core.hooksPath'], { env: { ...envForRepo(repo), HOME: home } }).status).not.toBe(0);
    expect(readFileSync(join(repo, 'xdg', 'guardrails', '.opt-out'), 'utf8')).toContain(repo);
    cleanup(home);
  });

  test('doctor current repo renders structured detail', () => {
    repo = newBareRepo();
    expect(run(GUARDRAILS, ['install'], { cwd: repo, env: envForRepo(repo) }).status).toBe(0);

    const r = run(GUARDRAILS, ['doctor'], { cwd: repo, env: envForRepo(repo) });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('category');
    expect(r.stdout).toContain('installed');
    expect(r.stdout).toContain('pre-commit');
    expect(r.stdout).toContain('installed (guardrails)');
  });

  test('doctor --all summary agrees with current repo classification', () => {
    repo = newBareRepo();
    expect(run(GUARDRAILS, ['install'], { cwd: repo, env: envForRepo(repo) }).status).toBe(0);

    const current = run(GUARDRAILS, ['doctor'], { cwd: repo, env: envForRepo(repo) });
    const all = run(GUARDRAILS, ['doctor', '--all', '--root', repo], { env: envForRepo(repo) });

    expect(current.status).toBe(0);
    expect(all.status).toBe(0);
    expect(current.stdout).toContain('category');
    expect(current.stdout).toContain('installed');
    expect(all.stdout).toContain('1 installed');
    expect(all.stdout).toContain(repo);
  });

  test('global-template generate writes init template and configures git', () => {
    repo = newBareRepo();
    const home = mkdtempSync(join(tmpdir(), 'guardrails-home-'));
    const dataHome = join(repo, 'xdg-data');
    const env = { ...envForRepo(repo), HOME: home, XDG_DATA_HOME: dataHome };

    const r = run(GUARDRAILS, ['global-template', 'generate'], { cwd: repo, env });
    expect(r.status).toBe(0);

    const templateDir = join(dataHome, 'guardrails', 'git-template');
    expect(run('git', ['config', '--global', '--get', 'init.templateDir'], { env }).stdout.trim()).toBe(templateDir);
    for (const hook of ['pre-commit', 'pre-push', 'commit-msg']) {
      expect(readFileSync(join(templateDir, 'hooks', hook), 'utf8')).toContain('# guardrails-managed: guardrails.v0');
    }
    cleanup(home);
  });
});

describe('Doctor handles worktrees correctly', () => {
  let scanRoot: string;
  let parent: string;
  let wt: string;
  let parentCanonical: string;
  let wtCanonical: string;
  beforeEach(() => {
    // Use a shared scan root containing both parent repo and worktree.
    scanRoot = mkdtempSync(join(tmpdir(), 'guardrails-doctor-'));
    parent = join(scanRoot, 'parent');
    mkdirSync(parent);
    git(parent, 'init', '-q', '-b', 'main');
    git(parent, 'config', 'user.email', 't@e.com');
    git(parent, 'config', 'user.name', 't');
    writeFileSync(join(parent, 'x'), 'x');
    git(parent, 'add', 'x');
    git(parent, 'commit', '-q', '-m', 'feat: init');
    const configHome = join(scanRoot, 'xdg');
    mkdirSync(configHome, { recursive: true });
    const install = run(GUARDRAILS, ['install', '--force'], { cwd: parent, env: testEnv(configHome) });
    expect(install.status).toBe(0);
    git(parent, 'branch', 'other');
    wt = join(scanRoot, 'wt');
    git(parent, 'worktree', 'add', wt, 'other');

    parentCanonical = git(parent, 'rev-parse', '--show-toplevel').stdout.trim();
    wtCanonical = git(wt, 'rev-parse', '--show-toplevel').stdout.trim();
  });
  afterEach(() => {
    cleanup(scanRoot);
  });

  test('worktree (with .git file, not directory) is detected as enrolled', () => {
    const r = run(GUARDRAILS, ['doctor', '--all', '--root', scanRoot], { env: testEnv(join(scanRoot, 'xdg')) });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('2 repos');
    expect(r.stdout).toContain('  ✓ parent');
    expect(r.stdout).toContain('  ✓ wt');
    expect(r.stdout).toContain('2 installed');
  });
});


describe('hook classifier', () => {
  let repo: string;

  beforeEach(() => { repo = newRepo(); });
  afterEach(() => cleanup(repo));

  function hooksDir(): string {
    return git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim() + '/hooks';
  }

  function classify(hook: string, env: NodeJS.ProcessEnv = envForRepo(repo)): SpawnResult {
    return run('bash', ['-c', `source "${GUARDRAILS}"; _classify_hook "${hooksDir()}" "${hook}"`], { cwd: repo, env });
  }

  test('absent', () => {
    rmSync(join(hooksDir(), 'pre-commit'), { force: true });
    expect(classify('pre-commit').stdout.trim()).toBe('absent');
  });

  test('ours', () => {
    expect(classify('pre-commit').stdout.trim()).toBe('ours');
  });

  test('non-ours', () => {
    writeFileSync(join(hooksDir(), 'pre-commit'), '#!/usr/bin/env bash\necho external\n');
    expect(classify('pre-commit').stdout.trim()).toBe('non-ours');
  });

  test('opt-out', () => {
    const optOutDir = join(repo, 'xdg', 'guardrails');
    mkdirSync(optOutDir, { recursive: true });
    const canonical = git(repo, 'rev-parse', '--show-toplevel').stdout.trim();
    writeFileSync(join(optOutDir, '.opt-out'), `${canonical}\n`);
    expect(classify('pre-commit').stdout.trim()).toBe('opt-out');
  });

  test('shadowed by local core.hooksPath', () => {
    git(repo, 'config', '--local', 'core.hooksPath', '.custom-hooks');
    expect(classify('pre-commit').stdout.trim()).toBe('shadowed');
  });

  test('shadowed by global core.hooksPath', () => {
    const home = mkdtempSync(join(tmpdir(), 'guardrails-home-'));
    git(repo, 'config', '--local', '--unset', 'core.hooksPath');
    run('git', ['config', '--global', 'core.hooksPath', '.global-hooks'], { env: { ...envForRepo(repo), HOME: home } });
    expect(classify('pre-commit', { ...envForRepo(repo), HOME: home }).stdout.trim()).toBe('shadowed');
    cleanup(home);
  });
});
