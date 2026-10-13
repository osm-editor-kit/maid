/**
 * Contract check of the apps' module configs. No browser: each app's `src/maid.config.ts` is loaded
 * in Bun and checked for what can be checked without a page:
 *
 * - the config runs, its `id` is set and unique across apps, its modules have unique ids
 * - each module, alone, sets up in a real editor with no network request, registers only at extension
 *   points that exist (declared in packages/*\/src/extension-points.ts), and removes its items on destroy
 * - all the app's modules together make an editor whose `moduleIds` are the config's
 * - every `*PresetChanges` export of packages/module-* applies to the default presets, and the app's
 *   presets match a few tag sets
 * - the app's vite.config.ts serves its fixed port with strictPort on 127.0.0.1, its dev script names
 *   the same port, its OAuth login origin is that port, and the ports are unique across apps
 *
 * Not checked here (needs a page): what the modules draw, the `?harness=` pages, the browser checks.
 * The config imports the shell, so a module that reads `window` or `document` in its setup fails here.
 *
 *   bun run check-config
 *
 * Writes reports/config-check.json and prints two tables. Exits 1 on any failed check.
 */
import { mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import {
  createEditor,
  type EditorConfig,
  type MaidModule,
  type ModuleApi,
} from '../../packages/core/src/index.ts'
import { defaultPresetData } from '../../packages/presets/src/default.ts'
import {
  createPresets,
  withChanges,
  type PresetChanges,
  type Tags,
} from '../../packages/presets/src/index.ts'
import { readConfig } from '../../packages/shell/src/config.ts'
import type { AppConfig } from '../../packages/shell/src/shell.ts'
import { APPS, type AppName } from '../bench/args.ts'

const ROOT = join(import.meta.dir, '..', '..')

type CheckRow = { app: string; check: string; ok: boolean; detail: string }
type ModuleRow = {
  app: string
  module: string
  points: string[]
  items: number
  ok: boolean
  detail: string
}

const checks: CheckRow[] = []
const modules: ModuleRow[] = []
const record = (app: string, check: string, ok: boolean, detail = '') =>
  checks.push({ app, check, ok, detail })
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The points that exist: every `interface ExtensionPoints` in the packages' extension-points files */
async function declaredPoints() {
  const names = new Set<string>()
  for await (const file of new Bun.Glob('packages/*/src/extension-points.ts').scan({ cwd: ROOT })) {
    const text = await Bun.file(join(ROOT, file)).text()
    const block = /interface ExtensionPoints \{([\s\S]*?)\n\s*\}/.exec(text)?.[1] ?? ''
    for (const match of block.matchAll(/^\s*'([\w.-]+)'\s*:/gm)) names.add(match[1]!)
  }
  return names
}

type Options = Pick<EditorConfig, 'presets' | 'filters'>
type Run = {
  points: string[]
  items: number
  leftover: number
  fetches: string[]
  /** The editor's `moduleIds`: what the editor says it was made of */
  moduleIds: string[]
  error?: string
}

/** Sets the modules up in one editor, counts what they registered, destroys it and counts what is left */
function runEditor(setups: MaidModule[], options: Options): Run {
  const points: string[] = []
  const fetches: string[] = []
  // Setup must not reach the network: a request during setup is recorded and refused
  const realFetch = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request) => {
    fetches.push(String(input instanceof Request ? input.url : input))
    const refused = Promise.reject(new Error('network is blocked in check-config'))
    refused.catch(() => {})
    return refused
  }) as unknown as typeof fetch
  // The module's register is wrapped so that the point it registers at is known
  const wrapped = setups.map(
    (module): MaidModule => ({
      id: module.id,
      setup(api) {
        // arrow functions, so that no method is passed on unbound; what a module registers is still
        // checked by the editor at run time
        const spy = {
          editor: api.editor,
          on: (name: never, listener: never) => api.on(name, listener),
          register: (point: string, item: object) => {
            points.push(point)
            api.register(point as never, item as never)
          },
        } as unknown as ModuleApi
        return module.setup(spy)
      },
    }),
  )
  try {
    const editor = createEditor({
      modules: wrapped,
      presets: options.presets,
      filters: options.filters,
    })
    const unique = [...new Set(points)]
    const count = () =>
      unique.reduce((sum, point) => sum + editor.registry(point as never).list().length, 0)
    const items = count()
    editor.destroy()
    const leftover = count()
    return { points: unique, items, leftover, fetches, moduleIds: [...editor.moduleIds] }
  } catch (error) {
    return {
      points: [...new Set(points)],
      items: 0,
      leftover: 0,
      fetches,
      moduleIds: [],
      error: message(error),
    }
  } finally {
    globalThis.fetch = realFetch
  }
}

/** Loads one app's config and checks it. Returns the app's id and port for the cross-app checks. */
async function checkApp(name: AppName, declared: Set<string>) {
  const { dir, port } = APPS[name]
  let app: AppConfig
  try {
    app = (await import(join(ROOT, dir, 'src/maid.config.ts'))).app as AppConfig
    record(name, 'config loads', true, relative(ROOT, join(ROOT, dir, 'src/maid.config.ts')))
  } catch (error) {
    record(name, 'config loads', false, message(error))
    return undefined
  }

  const id = typeof app.id === 'string' && app.id.length > 0 ? app.id : undefined
  record(name, 'app id is set', id !== undefined, id ?? 'missing')

  // the config as the shell makes it: the URL's settings, read from a scene's search string
  const config = readConfig({ search: '?scene=small' } as unknown as Location)
  let editorConfig: EditorConfig
  try {
    editorConfig = app.editor(config)
    record(name, 'editor config runs', true)
  } catch (error) {
    record(name, 'editor config runs', false, message(error))
    return { id, port }
  }
  const list = editorConfig.modules ?? []
  const options: Options = { presets: editorConfig.presets, filters: editorConfig.filters }
  const ids = list.map((module) => module.id)
  const duplicates = ids.filter((item, index) => ids.indexOf(item) !== index)
  record(
    name,
    'module ids are unique',
    duplicates.length === 0 && ids.every((item) => typeof item === 'string' && item.length > 0),
    duplicates.length ? `duplicates: ${duplicates.join(', ')}` : `${ids.length} modules`,
  )

  for (const module of list) {
    const run = runEditor([module], options)
    const unknown = run.points.filter((point) => !declared.has(point))
    const problems = [
      run.error ? `error: ${run.error}` : '',
      run.fetches.length ? `network during setup: ${run.fetches.join(', ')}` : '',
      unknown.length ? `undeclared points: ${unknown.join(', ')}` : '',
      run.leftover ? `${run.leftover} items left after destroy` : '',
    ].filter(Boolean)
    modules.push({
      app: name,
      module: module.id,
      points: run.points,
      items: run.items,
      ok: problems.length === 0,
      detail: problems.join('; '),
    })
  }

  const together = runEditor(list, options)
  const sameIds = JSON.stringify(together.moduleIds) === JSON.stringify(ids)
  record(
    name,
    'all modules together make an editor, and destroy leaves nothing',
    !together.error && !together.leftover && sameIds,
    together.error ??
      (sameIds
        ? `${together.items} items at ${together.points.length} points, ${ids.length} modules`
        : `editor.moduleIds ${together.moduleIds.join(', ')} differs from the config`),
  )

  const presets = editorConfig.presets
  if (!presets) {
    record(name, 'presets are set', false, 'no presets in the editor config')
  } else {
    try {
      const samples: Tags[] = [
        { highway: 'residential' },
        { amenity: 'bench' },
        { highway: 'footway', surface: 'asphalt' },
      ]
      for (const tags of samples) {
        if (!presets.match(tags, 'line') && !presets.match(tags, 'point'))
          throw new Error('no match')
      }
      record(name, 'presets match sample tags', true)
    } catch (error) {
      record(name, 'presets match sample tags', false, message(error))
    }
  }

  await checkVite(name, dir, port, app)
  return { id, port }
}

/** The dev server's fixed port, and the OAuth origin that the redirect is registered for */
async function checkVite(name: AppName, dir: string, port: number, app: AppConfig) {
  try {
    const vite = (await import(join(ROOT, dir, 'vite.config.ts'))).default
    const server = vite?.server ?? {}
    const preview = vite?.preview ?? {}
    const bad = [
      server.port !== port && `server.port ${server.port}`,
      server.strictPort !== true && 'server.strictPort',
      server.host !== '127.0.0.1' && `server.host ${server.host}`,
      preview.port !== port && `preview.port ${preview.port}`,
      preview.strictPort !== true && 'preview.strictPort',
    ].filter(Boolean)
    record(
      name,
      `vite.config serves port ${port}, strictPort, 127.0.0.1`,
      bad.length === 0,
      bad.join(', ') || `port ${port}`,
    )
  } catch (error) {
    record(name, 'vite.config loads', false, message(error))
  }

  const pkg = (await Bun.file(join(ROOT, dir, 'package.json')).json()) as {
    scripts?: Record<string, string>
  }
  const dev = pkg.scripts?.dev ?? ''
  record(
    name,
    'dev script names the same port',
    dev.includes(`--port ${port}`) && dev.includes('--strictPort'),
    dev || 'no dev script',
  )

  const origin = app.osm?.loginOrigin
  record(
    name,
    'OAuth login origin is the app port',
    origin === `http://127.0.0.1:${port}`,
    origin ?? 'no loginOrigin',
  )
}

/** Every `*PresetChanges` that a module package exports, applied to the default presets */
async function checkPresetChanges() {
  const found: { name: string; value: PresetChanges }[] = []
  for await (const file of new Bun.Glob('packages/module-*/src/index.ts').scan({ cwd: ROOT })) {
    const exported = await import(join(ROOT, file))
    for (const [name, value] of Object.entries(exported)) {
      if (name.endsWith('PresetChanges') && value && typeof value === 'object') {
        found.push({ name: `${file.split('/')[1]}: ${name}`, value: value as PresetChanges })
      }
    }
  }
  record('all', 'module packages export preset changes', found.length > 0, `${found.length} found`)
  for (const { name, value } of found) {
    try {
      const presets = createPresets(withChanges(defaultPresetData, value))
      presets.match({ highway: 'residential' }, 'line')
      presets.match({ amenity: 'bench' }, 'point')
      record('all', `preset change applies: ${name}`, true)
    } catch (error) {
      record('all', `preset change applies: ${name}`, false, message(error))
    }
  }
  return found.map((item) => item.name)
}

function table(header: string[], rows: string[][]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)))
  const line = (cells: string[]) =>
    cells
      .map((c, i) => c.padEnd(widths[i]!))
      .join('  ')
      .trimEnd()
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n')
}

const declared = await declaredPoints()
record('all', 'extension points are declared', declared.size > 0, [...declared].sort().join(', '))

const loaded: { name: AppName; id?: string; port: number }[] = []
for (const name of Object.keys(APPS) as AppName[]) {
  const result = await checkApp(name, declared)
  if (result) loaded.push({ name, ...result, port: APPS[name].port })
}

const ids = loaded.map((app) => app.id).filter((id): id is string => id !== undefined)
record(
  'all',
  'app ids are unique',
  new Set(ids).size === ids.length && ids.length === loaded.length,
  ids.join(', '),
)
const ports = loaded.map((app) => app.port)
record('all', 'app ports are unique', new Set(ports).size === ports.length, ports.join(', '))

const presetChanges = await checkPresetChanges()

const failedChecks = checks.filter((c) => !c.ok)
const failedModules = modules.filter((m) => !m.ok)
const passed = failedChecks.length === 0 && failedModules.length === 0

console.log(
  table(
    ['APP', 'CHECK', 'RESULT', 'DETAIL'],
    checks.map((c) => [c.app, c.check, c.ok ? 'ok' : 'FAIL', c.detail]),
  ),
)
console.log('')
console.log(
  table(
    ['APP', 'MODULE', 'POINTS', 'ITEMS', 'RESULT', 'DETAIL'],
    modules.map((m) => [
      m.app,
      m.module,
      m.points.join(', ') || '-',
      String(m.items),
      m.ok ? 'ok' : 'FAIL',
      m.detail,
    ]),
  ),
)

const reportPath = join(ROOT, 'reports', 'config-check.json')
await mkdir(join(ROOT, 'reports'), { recursive: true })
await Bun.write(
  reportPath,
  `${JSON.stringify(
    {
      passed,
      declaredPoints: [...declared].sort(),
      presetChanges,
      apps: loaded,
      checks,
      modules,
    },
    null,
    2,
  )}\n`,
)
console.log(
  `\ncheck-config: ${checks.length - failedChecks.length} of ${checks.length} checks ok, ${modules.length - failedModules.length} of ${modules.length} modules ok. Report: ${relative(ROOT, reportPath)}`,
)
process.exit(passed ? 0 : 1)
