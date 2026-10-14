/**
 * The inlang projects of Maid: the app's texts (this package) and the texts of each module that has its own
 * (`packages/module-*\/project.inlang/settings.json`). `compile.ts` and `missing.ts` read this list, so a new module
 * with texts is picked up by adding its `project.inlang` and `messages/` folders, nothing else.
 *
 * The strategy is what `compile.ts` gives the compiled output. The app keeps the locale in memory (`custom-maid`).
 * A module's `getLocale` is replaced by the app's (`linkModuleLocale`, src/module.ts), so it only needs `baseLocale`.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export type Project = {
  /** The package folder: it holds `project.inlang/`, `messages/` and the output `paraglide/` */
  dir: string
  /** The package's name for reports, e.g. `packages/module-parking` */
  name: string
  /** The Paraglide strategy of the compiled output, as the CLI takes it */
  strategy: readonly string[]
}

const I18N = join(import.meta.dir, '..')
const PACKAGES = join(I18N, '..')

export const PROJECTS: readonly Project[] = [
  { dir: I18N, name: 'packages/i18n', strategy: ['custom-maid', 'baseLocale'] },
  ...readdirSync(PACKAGES)
    .filter((name) => name.startsWith('module-'))
    .sort()
    .map((name) => join(PACKAGES, name))
    .filter((dir) => existsSync(join(dir, 'project.inlang', 'settings.json')))
    .map((dir) => ({
      dir,
      name: `packages/${dir.slice(PACKAGES.length + 1)}`,
      strategy: ['baseLocale'],
    })),
]

/** Paraglide's CLI, from the i18n package's own install (no `bunx`: a module has no install of its own) */
export const PARAGLIDE_CLI = join(I18N, 'node_modules', '@inlang', 'paraglide-js', 'bin', 'run.js')
