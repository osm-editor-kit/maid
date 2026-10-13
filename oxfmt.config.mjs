import { defineConfig } from 'oxfmt'

// FMC default (skill tech-stack, references/oxc-config.md), adapted to this monorepo.
// ignorePatterns: keep in sync with oxlint.config.mjs.
export default defineConfig({
  useTabs: false,
  tabWidth: 2,
  printWidth: 100,
  singleQuote: true,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  semi: false,
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  endOfLine: 'lf',
  sortImports: {
    newlinesBetween: false,
  },
  sortTailwindcss: {
    stylesheet: 'packages/shell/src/styles.css',
    functions: ['twMerge', 'twJoin', 'clsx'],
  },
  sortPackageJson: true,
  ignorePatterns: [
    '.reference/**',
    // ported from Rapid and kept close to the original for now (packages/model/README.md)
    'packages/model/**',
    'reports/**',
    'patches/**',
    'fixtures/**',
    '**/dist/**',
    '**/generated/**',
    'packages/shell/public/**',
    'tools/refs/id/**',
    'tools/refs/rapid/**',
    'tools/refs/frame-sync.js',
    'playwright-report/**',
    'test-results/**',
    'bun.lock',
    // prose is written and wrapped by hand
    '**/*.md',
  ],
})
