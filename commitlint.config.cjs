/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  rules: {
    // Keep this config dependency-free: Homebrew ships it as data under pkgshare,
    // so it must not require @commitlint/config-conventional at runtime.
    'type-enum': [2, 'always', [
      'build',
      'chore',
      'ci',
      'docs',
      'feat',
      'fix',
      'perf',
      'refactor',
      'revert',
      'style',
      'test',
    ]],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    // Allow longer subject lines for richer commits.
    'header-max-length': [2, 'always', 100],
    // Body lines: allow up to 200 cols to fit context blocks from tools.
    'body-max-line-length': [1, 'always', 200],
    'footer-max-line-length': [1, 'always', 200],
  },
};
