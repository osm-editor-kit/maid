import { defineConfig } from 'oxlint'

// FMC default (skill tech-stack, references/oxc-config.md), adapted to this monorepo.
// ignorePatterns: keep in sync with oxfmt.config.mjs.
export default defineConfig({
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'react'],
  options: { typeAware: true },
  ignorePatterns: [
    '.reference/**',
    // ported from Rapid and kept close to the original for now (packages/model/README.md)
    'packages/model/**',
    'reports/**',
    'patches/**',
    'fixtures/**',
    '**/dist/**',
    '**/generated/**',
    // Paraglide's output, written by packages/i18n/scripts/compile.ts (git-ignored)
    'packages/i18n/paraglide/**',
    'packages/shell/public/**',
    // host pages and adapters for iD and Rapid: plain browser scripts, not part of our code base
    'tools/refs/id/**',
    'tools/refs/rapid/**',
    'tools/refs/frame-sync.js',
    'playwright-report/**',
    'test-results/**',
  ],
  rules: {
    'typescript/switch-exhaustiveness-check': 'error',
    // Restriction category: keep ESLint recommended coverage (off by default in oxlint)
    'react/unsupported-syntax': 'error',
    // Allow bare `_` (oxlint default ignores `_foo` but not `_`); object config clears defaults
    'eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'typescript/no-non-null-assertion': 'off',
        'react/rules-of-hooks': 'off',
      },
    },
    {
      // benchmark and measuring scripts talk to untyped editor internals through page.evaluate
      files: ['tools/bench/**', 'tools/maplibre-repro/**'],
      rules: {
        'typescript/no-explicit-any': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/no-unsafe-argument': 'off',
      },
    },
  ],
})
