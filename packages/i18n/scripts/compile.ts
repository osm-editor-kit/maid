/**
 * Generates Paraglide's output into `paraglide/` from `project.inlang/settings.json` and `messages/`.
 * Run by `bun run i18n-compile` and by every script that needs the output (the root package.json).
 *
 * It does nothing when the output is newer than every input, so scripts that run one after another
 * compile once, and two scripts never write the folder at the same time. Strategy `custom-maid` (see
 * src/strategy.ts) keeps the locale in memory; `baseLocale` is the fallback.
 *
 *   bun run --cwd packages/i18n compile          (add --force to compile in any case)
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
// Paraglide does not rewrite files whose content is unchanged, so their times do not tell when it ran.
// This file is written after each successful compile, and it is inside the output folder.
const STAMP = join(ROOT, 'paraglide', '.compiled')

function newestInput(): number {
  const messages = join(ROOT, 'messages')
  const inputs = [
    join(ROOT, 'project.inlang/settings.json'),
    join(ROOT, 'package.json'),
    join(ROOT, 'scripts/compile.ts'),
    ...readdirSync(messages).map((file) => join(messages, file)),
  ]
  return Math.max(...inputs.map((file) => statSync(file).mtimeMs))
}

function isFresh(): boolean {
  try {
    return statSync(STAMP).mtimeMs >= newestInput()
  } catch {
    // no output yet: compile
    return false
  }
}

if (!process.argv.includes('--force') && isFresh()) {
  console.log('i18n: paraglide/ is up to date')
  process.exit(0)
}

const result = spawnSync(
  process.execPath,
  [
    'x',
    'paraglide-js',
    'compile',
    '--project',
    './project.inlang',
    '--outdir',
    './paraglide',
    '--emit-ts-declarations',
    '--strategy',
    'custom-maid',
    'baseLocale',
  ],
  { cwd: ROOT, stdio: 'inherit' },
)
if (result.status !== 0) {
  console.error('i18n: paraglide-js compile failed')
  process.exit(result.status ?? 1)
}
writeFileSync(STAMP, `${new Date().toISOString()}\n`)
console.log(`i18n: compiled into ${join(ROOT, 'paraglide')}`)
