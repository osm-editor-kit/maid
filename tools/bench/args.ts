/**
 * The one place that reads `--app`. The browser checks and `check-all` take the app from here.
 *
 *   bun run check-edit small --app bicycle      (or --app=bicycle)
 *   bun run check-all --app bicycle
 *
 * `takeApp()` removes the option from `process.argv`, so the positional arguments keep their place
 * (`process.argv[2]` is still the scene). It must run before a check reads `process.argv`:
 * check-page.ts calls it when it is imported, and every browser check imports check-page.ts first.
 */
import { PORTS } from '../ports'

/** The apps the checks can run against: the folder, and the port the app's dev server is fixed to */
export const APPS = {
  maid: { dir: 'apps/maid', port: PORTS.maid },
  bicycle: { dir: 'apps/maid-bicycle', port: PORTS.maidBicycle },
} as const

export type AppName = keyof typeof APPS

let taken: AppName | undefined

function usage(message: string): never {
  console.error(`${message}\nUsage: --app ${Object.keys(APPS).join('|')} (default maid)`)
  process.exit(2)
}

/** The app named by `--app`, or 'maid'. Removes the option from `process.argv` the first time. */
export function takeApp(): AppName {
  if (taken) return taken
  const args = process.argv.slice(2)
  const kept: string[] = []
  const values: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--app') {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) usage('--app needs a name')
      values.push(value)
      i++
    } else if (arg.startsWith('--app=')) {
      values.push(arg.slice('--app='.length))
    } else {
      kept.push(arg)
    }
  }
  if (values.length > 1) usage('--app is given more than once')
  const name = values[0] ?? 'maid'
  if (!Object.hasOwn(APPS, name)) usage(`Unknown app "${name}"`)
  process.argv.splice(2, process.argv.length - 2, ...kept)
  taken = name as AppName
  return taken
}
